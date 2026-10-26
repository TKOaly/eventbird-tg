FROM node:22.23.4-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src

CMD ["npm", "start"]