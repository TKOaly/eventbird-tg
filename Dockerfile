FROM node:20.11-alpine

RUN apk --no-cache add --virtual native-deps \
  g++ gcc libgcc libstdc++ linux-headers make python

WORKDIR /app
COPY yarn.lock ./
COPY package.json ./
RUN yarn

COPY src ./src
COPY migrations ./migrations

CMD ["yarn", "start"]
