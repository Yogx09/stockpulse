FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

COPY packages ./packages
COPY services/catalog-service ./services/catalog-service

EXPOSE 4001

CMD ["npx", "tsx", "services/catalog-service/src/server.ts"]
