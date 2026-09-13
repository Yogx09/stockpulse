FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

COPY packages ./packages
COPY services/inventory-service ./services/inventory-service

EXPOSE 4002

CMD ["npx", "tsx", "services/inventory-service/src/server.ts"]
