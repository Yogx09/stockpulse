FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

COPY packages ./packages
COPY services/expiry-worker ./services/expiry-worker

CMD ["npx", "tsx", "services/expiry-worker/src/worker.ts"]
