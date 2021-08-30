import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import "./style.scss";

type RowProps = {
  username: string;
  token: string;
  setToken: Function;
};

type Record = {
  id: string;
  value: number;
  time: number;
  name: string;
};

async function makeRequest(url: string, data: object) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

// TODO: proper error handling is HARD! A little alert goes a long way, though
function lazyErrorHandle(error: { toString: Function }) {
  console.log(error);
  alert(error.toString());
  throw error;
}

function timestampToString(timestamp: number): string {
  let s = new Date(timestamp - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .split(".")[0];
  s = s.slice(0, s.length - 3);
  return s;
}

function stringToTimestamp(timestamp: string): number {
  return Date.parse(timestamp);
}

const SignInRow = ({ username, token, setToken }: RowProps) => {
  const logOut = () => {
    setToken(undefined);
  };
  if (username && token) {
    return (
      <div className={"contentRow"}>
        You are signed in as <span className={"accented"}>{username}</span>, but
        you can{" "}
        <span className={"accented pointer"} onClick={logOut}>
          log out by clicking here
        </span>
        .
      </div>
    );
  }

  const [hasTriedInput, setHasTriedInput] = useState(false);
  const [hasError, setHasError] = useState(false);

  const getInputElement = () => {
    return document.getElementById("emailInput") as HTMLInputElement;
  };

  const performSignIn = () => {
    // old wisdom: the only way to truly check an address is to send it mail;
    // not much point doing frontend validation here
    makeRequest("/login/", { mail: getInputElement().value }).then(
      (response) => {
        getInputElement().value = "";
        setHasTriedInput(true);
        if (response.status === 200) {
          setHasError(false);
        } else {
          setHasError(true);
        }
      }
    );
  };

  useEffect(() => {
    // if the input element is missing, then an error is thrown - ignore it
    try {
      getInputElement().focus();
    } catch (e) {}
  });

  return (
    <div id={"signInRow"} className={"contentRow"}>
      {hasTriedInput && !hasError ? (
        <div>
          Check your email for your login link!
          <br />
          (or, if the email service has not been configured server-side, check
          the server logs)
        </div>
      ) : (
        <>
          <input
            id={"emailInput"}
            type={"text"}
            placeholder={"Your Email"}
            onKeyDown={(e) => {
              if (e.key === "Enter") return performSignIn();
            }}
          />
          <div className={"button"} onClick={performSignIn}>
            {hasError ? <>Try Again</> : <>Log In</>}
          </div>
        </>
      )}
    </div>
  );
};

// noinspection JSUnusedLocalSymbols
const DataRows = ({ username, token, setToken }: RowProps) => {
  const [editRecordId, setEditRecordId] = useState(undefined);
  const [dataTicker, setDataTicker] = useState(0);

  const svgNamespace = "http://www.w3.org/2000/svg";
  const htmlNamespace = "http://www.w3.org/1999/xhtml";

  /* TODO:
  server-stored and locally-stored data is never combined, but should be */
  const dataKey = "data";
  const cachedDataKey = "cachedData";

  /* TODO:
  The lifecycle of the data state is, well, atrocious; it really should be
  re-designed, perhaps by maintaining a local version of the data, and updating
  it *alongside* API calls (rather than *from* API calls) */
  let data: { [name: string]: Record } = {};

  const loadData = (localStorageKey: string) => {
    data = JSON.parse(localStorage.getItem(localStorageKey) || "{}");
  };

  const saveData = (localStorageKey: string) => {
    localStorage.setItem(localStorageKey, JSON.stringify(data));
  };

  const fetchData = async () => {
    let r = await makeRequest("/api/", {
      token: token,
      action: "r",
    });
    let json = await r.json();
    data = {};
    json.data.forEach((r: Record) => {
      data[r.id] = r;
    });
    saveData(cachedDataKey);
  };

  const getRecord = (): Record => {
    let record: Record = {
      id: undefined,
      value: undefined,
      time: undefined,
      name: undefined,
    };
    try {
      record.value = parseFloat(
        (document.getElementById("itemValueInput") as HTMLInputElement).value
      );
      record.time = stringToTimestamp(
        (document.getElementById("itemDateInput") as HTMLInputElement).value
      );
      record.name = (
        document.getElementById("itemNameInput") as HTMLInputElement
      ).value;
    } catch (e) {
      lazyErrorHandle(e);
    }
    return record;
  };

  const saveItem = () => {
    const record = getRecord();
    if (token) {
      makeRequest("/api/", {
        token: token,
        action: "c",
        value: record.value,
        time: record.time,
        name: record.name,
      }).then((response) => {
        if (response.status === 200) {
          setDataTicker(dataTicker + 1);
        } else {
          lazyErrorHandle("An error occurred while saving the record");
        }
      });
    } else {
      // TODO: it's not a UUID, but it should be unique enough
      // noinspection JSDeprecatedSymbols
      let recordId = btoa(new Date().toString());
      data[recordId] = {
        id: recordId,
        value: record.value,
        time: record.time,
        name: record.name,
      };
      saveData(dataKey);
      setDataTicker(dataTicker + 1);
    }
  };

  const deleteItem = () => {
    if (!editRecordId) return;

    if (token) {
      makeRequest("/api/", {
        token: token,
        action: "d",
        id: editRecordId,
      }).then((response) => {
        if (response.status === 200) {
          setDataTicker(dataTicker + 1);
        } else {
          lazyErrorHandle("An error occurred while deleting the record");
        }
      });
    } else {
      delete data[editRecordId];
      saveData(dataKey);
      setDataTicker(dataTicker + 1);
    }
  };

  const updateItem = () => {
    if (!editRecordId) return;

    const record = getRecord();
    if (token) {
      makeRequest("/api/", {
        token: token,
        action: "u",
        value: record.value,
        id: editRecordId,
      }).then((response) => {
        if (response.status === 200) {
          setDataTicker(dataTicker + 1);
        } else {
          lazyErrorHandle("An error occurred while updating the record");
        }
      });
    } else {
      data[editRecordId].value = record.value;
      saveData(dataKey);
      setDataTicker(dataTicker + 1);
    }
  };

  const getSvgCanvas = () => {
    const svg: SVGSVGElement = document.getElementById("dataDisplay") as any;
    return svg;
  };

  const makeForeignObject = (elementId: string) => {
    const svg = getSvgCanvas();
    // check if element has already been drawn
    let elements = svg.getElementsByTagNameNS(svgNamespace, "foreignObject");
    let alreadyExists: boolean | Element = false;
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].getAttribute("data-element-id") === elementId) {
        alreadyExists = elements[i];
        break;
      }
    }
    if (alreadyExists !== false) return alreadyExists;

    const element = document.getElementById(elementId);
    const x = parseInt(element.getAttribute("cx"));
    const y = parseInt(element.getAttribute("cy"));

    // calculate where to place the object
    // TODO: this could really be improved with a bit of thinking
    let objectY = y - 20;
    let objectX = x - 250;
    if (objectX < 0) objectX = x + 10;
    if (objectX > svg.viewBox.baseVal.width - 250) {
      objectX = x - 100;
      objectY = y + 50;
    }
    if (objectY < 0) {
      objectY = y + 50;
    }
    if (objectY > svg.viewBox.baseVal.height - 150) {
      objectY = y - 100;
    }

    const foreignObject = document.createElementNS(
      svgNamespace,
      "foreignObject"
    );

    foreignObject.setAttribute("data-element-id", elementId);
    foreignObject.setAttribute("x", objectX.toString());
    foreignObject.setAttribute("y", objectY.toString());
    foreignObject.setAttribute("width", "1");
    foreignObject.setAttribute("height", "1");

    return foreignObject;
  };

  const makeDisplayBox = (elementId: string) => {
    clearBoxes();
    const svg = getSvgCanvas();
    const element = document.getElementById(elementId);
    const foreignObject = makeForeignObject(elementId);
    const dataDisplayBox = document.createElementNS(htmlNamespace, "div");

    dataDisplayBox.innerHTML =
      '<div class="itemValue">' +
      element.getAttribute("data-value") +
      "</div>" +
      '<div class="itemName">' +
      element.getAttribute("data-name") +
      "</div>" +
      '<div class="itemDate">' +
      timestampToString(parseInt(element.getAttribute("data-time"))) +
      "</div>";
    dataDisplayBox.setAttribute("xmlns", htmlNamespace);
    dataDisplayBox.addEventListener("click", () => {
      dataDisplayBox.remove();
      setEditRecordId(element.getAttribute("data-id"));
    });
    dataDisplayBox.style.color = element.getAttribute("fill");
    dataDisplayBox.classList.add("dataBox");

    // sometimes mouseover fires twice, but we only want one div
    while (foreignObject.firstChild) {
      foreignObject.lastChild.remove();
    }
    foreignObject.appendChild(dataDisplayBox);
    svg.appendChild(foreignObject);
  };

  const clearBoxes = () => {
    let elements = getSvgCanvas().getElementsByTagNameNS(
      svgNamespace,
      "foreignObject"
    );
    let elementsList: Array<Element> = [];
    for (let i = 0; i < elements.length; i++) {
      elementsList.push(elements[i]);
    }
    while (elementsList.length > 0) {
      elementsList.pop().remove();
    }
    setEditRecordId(undefined);
  };

  const updateDataDisplay = () => {
    console.log("updating");
    const svg = getSvgCanvas();
    let minX: number = undefined;
    let maxX: number = undefined;
    let minY: number = undefined;
    let maxY: number = undefined;
    let categories: { [name: string]: Record[] } = {};
    let usedIds = new Set();

    const sizeX = 750;
    const sizeY = 500;

    Object.keys(data).forEach((k) => {
      const record = data[k];
      if (minX === undefined) {
        minX = record.time;
        maxX = record.time;
        minY = record.value;
        maxY = record.value;
      }
      minX = Math.min(minX, record.time);
      maxX = Math.max(maxX, record.time);
      minY = Math.min(minY, record.value);
      maxY = Math.max(maxY, record.value);
      if (!(record.name in categories)) {
        categories[record.name] = [];
      }
      categories[record.name].push(record);
    });

    const categoryColors = ["#1a535c", "#ff6b6b", "#ffe66d", "#121212"];
    let colorIndex = 0;
    let pointElements: Set<Node> = new Set();

    Object.keys(categories).forEach((k) => {
      const color = categoryColors[colorIndex % categoryColors.length];
      const plotLineId = "polylineElement" + k;
      usedIds.add(plotLineId);
      categories[k].sort((a, b) => {
        return a.time - b.time;
      });
      let points = "";
      const records = categories[k];
      records.forEach((r) => {
        const pointId = "pointElement" + r.id;
        usedIds.add(pointId);
        let x = Math.floor(((r.time - minX) / (maxX - minX)) * sizeX);
        let y = Math.floor(sizeY - ((r.value - minY) / (maxY - minY)) * sizeY);
        points += x.toString() + "," + y.toString() + " ";

        let pointElement = svg.getElementById(pointId);
        if (!pointElement) {
          pointElement = document.createElementNS(svgNamespace, "circle");
        }
        pointElement.setAttribute("id", pointId);
        pointElement.setAttribute("cx", x.toString());
        pointElement.setAttribute("cy", y.toString());
        pointElement.setAttribute("r", "6");
        pointElement.setAttribute("fill", color);

        pointElement.setAttribute("data-id", r.id);
        pointElement.setAttribute("data-value", r.value.toString());
        pointElement.setAttribute("data-name", r.name);
        pointElement.setAttribute("data-time", r.time.toString());
        pointElement.setAttribute("data-color", color);

        pointElement.addEventListener("mouseover", () => {
          makeDisplayBox(pointId);
        });

        pointElements.add(pointElement);
      });

      let plotLineElement = svg.getElementById(plotLineId);
      if (!plotLineElement) {
        plotLineElement = document.createElementNS(svgNamespace, "polyline");
      }
      plotLineElement.setAttribute("id", plotLineId);
      plotLineElement.setAttribute("stroke", color);
      plotLineElement.setAttribute("points", points);
      plotLineElement.setAttribute("fill", "none");
      plotLineElement.setAttribute("stroke-width", "3");
      svg.appendChild(plotLineElement);

      colorIndex += 1;
    });

    // the points should appear above the lines; z-index doesn't play nice with
    // svg elements, so the points need to be appended after
    pointElements.forEach((element) => {
      svg.appendChild(element);
    });

    // remove unused elements from the graph
    let deadIds: Set<string> = new Set();
    for (let i = 0; i < svg.children.length; i++) {
      let child = svg.children[i];
      if (!usedIds.has(child.id)) {
        deadIds.add(child.id.toString());
      }
    }
    deadIds.forEach((deadId) => {
      try {
        document.getElementById(deadId).remove();
      } catch (e) {}
    });
  };

  useEffect(() => {
    if (token) {
      fetchData().then(() => updateDataDisplay());
    } else {
      updateDataDisplay();
    }
  });

  if (token) {
    loadData(cachedDataKey);
  } else {
    loadData(dataKey);
  }

  // TODO: hacky fix for a hacky bug
  let editRecordIdAlt = editRecordId;
  if (editRecordId && !(editRecordId in data)) {
    setEditRecordId(undefined);
    editRecordIdAlt = undefined;
  }

  return (
    <>
      <div id={"addItemRow"} className={"contentRow"}>
        <div>
          <input
            type={"hidden"}
            id={"itemIdInput"}
            defaultValue={editRecordIdAlt}
          />
          <input
            type={"number"}
            id={"itemValueInput"}
            placeholder={"Value"}
            defaultValue={
              editRecordIdAlt ? data[editRecordIdAlt].value : undefined
            }
          />
          <input
            type={"datetime-local"}
            id={"itemDateInput"}
            placeholder={"Date"}
            defaultValue={timestampToString(
              editRecordIdAlt
                ? data[editRecordIdAlt].time
                : new Date().getTime()
            )}
          />
          <input
            type={"text"}
            id={"itemNameInput"}
            placeholder={"Name"}
            defaultValue={
              editRecordIdAlt ? data[editRecordIdAlt].name : undefined
            }
          />
        </div>

        {editRecordIdAlt ? (
          <div>
            <div className={"button"} onClick={updateItem}>
              Update
            </div>
            <div className={"button redButton"} onClick={deleteItem}>
              Delete
            </div>
            <div
              className={"button yellowButton"}
              onClick={() => {
                setEditRecordId(undefined);
              }}
            >
              Deselect
            </div>
          </div>
        ) : (
          <div className={"button"} onClick={saveItem}>
            Save
          </div>
        )}
      </div>
      <div id={"showDataRow"} className={"contentRow"}>
        <svg id={"dataDisplay"} viewBox={"0 0 750 500"} xmlns={svgNamespace} />
      </div>
    </>
  );
};

const Main = () => {
  const sessionTokenKey = "session";
  let [userToken, setUserToken] = useState(
    localStorage.getItem(sessionTokenKey)
  );
  let [username, setUsername] = useState(null);

  const setToken = (v: string) => {
    if (v) {
      localStorage.setItem(sessionTokenKey, v);
    } else {
      localStorage.removeItem(sessionTokenKey);
    }
    setUserToken(localStorage.getItem(sessionTokenKey));
  };

  // check login/session tokens on first load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let tokenParam = urlParams.get("t");
    // if there's a token in the URL, try getting a session token with it
    if (tokenParam) {
      makeRequest("/login/", { token: tokenParam }).then((response) => {
        if (response.status === 200) {
          response.json().then((data) => {
            localStorage.setItem(sessionTokenKey, data["token"]);
            setToken(data["token"]);
            window.location.search = "";
          });
        } else {
          // TODO: this is a semi-edge-case, but it could still use better handling
          localStorage.removeItem(sessionTokenKey);
          setToken(localStorage.getItem(sessionTokenKey));
          alert("This login link is invalid or has expired");
        }
      });
    }
    // if there is no URL token, but there is a localstorage one, check it
    else if (userToken) {
      makeRequest("/login/", { session: userToken }).then((response) => {
        if (response.status === 200) {
          response.json().then((data) => {
            if (data["user"] !== username) {
              setUsername(data["user"]);
            }
          });
        } else {
          localStorage.removeItem(sessionTokenKey);
          setToken(localStorage.getItem(sessionTokenKey));
        }
      });
    }
  });

  return (
    <div id={"main"}>
      <div id={"header"} className={"contentRow"}>
        <img src={require("./logo.svg")} alt={"Mensuret Eundo"} />
      </div>
      <div className={"contentRow"}>
        <p>
          <a href={"https://github.com/joedeandev/MensuretEundo"}>
            It Measures as it Goes
          </a>
          : Enter a value, timestamp, and category in the space below to see it
          displayed on the graph. Mousing over a point on the graph displays
          detailed information; click the information box to update or delete a
          data point. Data is saved locally, or if you are logged in, on the
          server.
        </p>
      </div>
      <DataRows token={userToken} username={username} setToken={setToken} />
      <SignInRow token={userToken} username={username} setToken={setToken} />
    </div>
  );
};

ReactDOM.render(<Main />, document.getElementById("root"));
