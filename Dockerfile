FROM node:16-alpine as builder

WORKDIR /build

COPY dockerbuilddeps.sh .
RUN /bin/sh dockerbuilddeps.sh

COPY package.json .
RUN npm install --include=dev

COPY . .
RUN npm run build

FROM node:16-alpine

EXPOSE 80
EXPOSE 443

WORKDIR /app

COPY dockerbuilddeps.sh .
RUN /bin/sh dockerbuilddeps.sh

COPY package.json .
RUN npm install
COPY certs ./certs
COPY --from=builder /build/dist ./dist/

CMD ["npm", "run", "start"]
