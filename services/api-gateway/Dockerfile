FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY packages ./packages
COPY services/api-gateway ./services/api-gateway

EXPOSE 4000

CMD ["npx", "tsx", "services/api-gateway/src/server.ts"]
