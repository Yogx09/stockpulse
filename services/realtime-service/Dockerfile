FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY packages ./packages
COPY services/realtime-service ./services/realtime-service

EXPOSE 4003

CMD ["npx", "tsx", "services/realtime-service/src/server.ts"]
