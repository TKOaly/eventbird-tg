FROM node:20.11-alpine

WORKDIR /app
COPY yarn.lock ./
COPY package.json ./
RUN yarn

COPY src ./src

CMD ["yarn", "start"]
