FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN chown -R app:app /app
USER app

EXPOSE 3000

CMD ["node", "server.js"]
