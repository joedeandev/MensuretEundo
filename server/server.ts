import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import crypto from "crypto";

import express from "express";
import nodemailer from "nodemailer";
import sqlite3 from "sqlite3";

const clientFilePath = path.resolve(path.join("dist", "client"));
const indexFilePath = path.join(clientFilePath, "index.html");
const certsPath = path.resolve("certs");

const app = express();
/* TODO:
SQLite is great, and for the majority of projects, using anything else is
overkill (I will die on this hill). However, for scalability and concurrency
reasons, it would be better to connect to some network location instead */
const db = new sqlite3.Database("./db.sqlite3", (err) => {
  if (err) {
    throw err;
  }
  db.run(
    `CREATE TABLE "data" ( 
        "id" TEXT,
        "user" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "time" INTEGER NOT NULL,
        "value" INTEGER NOT NULL,
        PRIMARY KEY("id")
      );`,
    () => {
      // if there's an error here, it's because the table already exists,
      // and that's okay.
    }
  );
});

/* TODO:
For ease of demonstration, these email parameters default to a valid account
at https://ethereal.email/ (the test domain of choice for NodeMailer). Of course
it would be better if default parameters were invalid, rather than non-
functional: "Errors should never pass silently. Unless explicitly silenced." */
const EMAIL_HOST =
  process.env.MENSURET_EUNDO_EMAIL_HOST || "smtp.ethereal.email";
const EMAIL_PORT = parseInt(process.env.MENSURET_EUNDO_EMAIL_PORT) || 587;
const EMAIL_USER =
  process.env.MENSURET_EUNDO_EMAIL_USER || "wallace.gulgowski1@ethereal.email";
const EMAIL_PASS =
  process.env.MENSURET_EUNDO_EMAIL_PASS || "aZSKYTMNmDr1BwSckn";
const EMAIL_SEND = process.env.MENSURET_EUNDO_EMAIL_PASS || "Mensuret Eundo";
const EMAIL_SUBJ =
  process.env.MENSURET_EUNDO_EMAIL_PASS || "Log In to Mensuret Eundo";

const mailTransporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: false,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

class AuthHandler {
  constructor(expiry: number) {
    this.expiry = expiry;
  }
  private readonly expiry: number;
  private tokens: { [name: string]: [string, number] } = {};
  private knownUsers = new Set();
  private static currentTime(): number {
    return new Date().getTime() / 1000;
  }

  public invalidateToken(token: string) {
    if (!(token in this.tokens)) {
      return;
    }
    let user = this.tokens[token][0];
    delete this.tokens[token];
    this.knownUsers.delete(user);
  }

  public generateToken(user: string): string {
    if (this.knownUsers.has(user)) {
      // this is pretty inefficient
      for (const [foundToken, foundUserExpiry] of Object.entries(this.tokens)) {
        if (foundUserExpiry[0] === user) {
          if (this.verifyToken(foundToken)) {
            return foundToken;
          }
          // if no matching user is found, then it is because the old token was
          // expired; so just continue on and generate a new one
        }
      }
    }
    let token = crypto.randomBytes(36).toString("hex");
    let time = AuthHandler.currentTime();
    this.tokens[token] = [user, time];
    this.knownUsers.add(user);
    return token;
  }

  public verifyToken(token: string): string | boolean {
    if (!(token in this.tokens)) {
      return false;
    }
    let [user, expiry] = this.tokens[token];
    if (AuthHandler.currentTime() - expiry > this.expiry) {
      delete this.tokens[token];
      this.knownUsers.delete(user);
      return false;
    }
    return user;
  }
}

/* TODO:
Both session and login tokens get stored in memory; a more secure and scalable
system would be to store login tokens in a database, and use JWTs in place of
session tokens, but this 80% solution works for both. */
const loginTokenHandler = new AuthHandler(60 * 30);
const sessionTokenHandler = new AuthHandler(60 * 60 * 24 * 7);

app.use(express.static(clientFilePath));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(indexFilePath);
});

app.post("/login/", (req, res) => {
  if ("mail" in req.body) {
    const address = req.body["mail"];
    const loginToken = loginTokenHandler.generateToken(address);
    const targetUrl = req.protocol + "://" + req.hostname + "?t=" + loginToken;
    /* TODO:
    For ease of demonstration, the login magic link is logged to the console
    (so that the login demonstration doesn't require a working email backend);
    but it should probably be removed, were this to run in production */
    console.log(address, targetUrl);
    /* TODO:
    SMTP is a network-heavy operation; in production, this should almost
    certainly be offloaded to some cloud service (AWS's SES) or queued and
    run in the background. */
    try {
      mailTransporter
        .sendMail({
          from: EMAIL_SEND,
          to: address,
          subject: EMAIL_SUBJ,
          text: "Login in via this link (expires in one hour): " + targetUrl,
        })
        .then(() => {
          return res.status(200).end();
        })
        .catch(() => {
          return res.status(500).end();
        });
    } catch (e) {
      return res.status(500).end();
    }
  } else if ("token" in req.body) {
    const token = req.body["token"];
    const user = loginTokenHandler.verifyToken(token);
    if (!user) {
      return res.status(401).end();
    }
    loginTokenHandler.invalidateToken(token);
    const sessionToken = sessionTokenHandler.generateToken(user.toString());
    return res.json({ token: sessionToken });
  } else if ("session" in req.body) {
    const token = req.body["session"];
    const user = sessionTokenHandler.verifyToken(token);
    if (!user) {
      return res.status(401).end();
    }
    return res.status(200).json({ user: user });
  } else {
    return res.status(400).end();
  }
});

/* TODO:
This single route handles all of the CRUD work for the server. A real ORM, or
GraphQL would make this a lot cleaner, but considering the route is less than
a hundred lines, it seems like overkill to add a dependency. */
app.post("/api/", (req, res) => {
  if (!("token" in req.body)) {
    return res.status(401).end();
  }
  const user = sessionTokenHandler.verifyToken(req.body["token"]);
  if (!user) {
    return res.status(401).end();
  }
  const action = req.body["action"];
  if (action === "r") {
    db.all(
      "SELECT id, name, time, value FROM data WHERE user = ?",
      [user],
      (err, rows) => {
        if (err) {
          return res.status(500).end();
        }
        return res.json({ data: rows });
      }
    );
  } else if (action === "c") {
    const itemID = crypto.randomUUID().toString().replace("-", "a");
    const itemTime = req.body["time"] || false;
    const itemValue = req.body["value"] || false;
    const itemName = req.body["name"] || false;
    if (!itemTime || !itemValue || !itemName) {
      return res.status(400).end();
    }
    db.run(
      "INSERT INTO data VALUES (?, ?, ?, ?, ?)",
      [itemID, user, itemName.toString().toUpperCase(), itemTime, itemValue],
      (err) => {
        if (err) {
          console.log(err);
          return res.status(500).end();
        }
        return res.status(200).end();
      }
    );
  } else if (action === "u") {
    const itemID = req.body["id"] || false;
    const itemValue = req.body["value"] || false;
    if (!itemID || !itemValue) {
      return res.status(400).end();
    }
    db.run(
      "UPDATE data SET value = ? WHERE id = ? AND user = ?",
      [itemValue, itemID, user],
      (err) => {
        if (err) {
          console.log(err);
          return res.status(500).end();
        }
        return res.status(200).end();
      }
    );
  } else if (action === "d") {
    const itemID = req.body["id"] || false;
    if (!itemID) {
      return res.status(400).end();
    }
    db.run(
      "DELETE FROM data WHERE id = ? AND user = ?",
      [itemID, user],
      (err) => {
        if (err) {
          console.log(err);
          return res.status(500).end();
        }
        return res.status(200).end();
      }
    );
  } else {
    return res.status(400).end();
  }
});

/* TODO:
Were this a production-ready project, it would make sense to have some secondary
server layer between the client and the program (e.g. NGINX) to redirect traffic
from HTTP to HTTPS, handle SSL certs, and potentially load-balance.*/
http.createServer(app).listen(80);
https
  .createServer(
    {
      key: fs.readFileSync(path.join(certsPath, "privkey.pem")),
      cert: fs.readFileSync(path.join(certsPath, "fullchain.pem")),
    },
    app
  )
  .listen(443);
console.log("Running...");
