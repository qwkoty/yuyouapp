FROM node:20-slim AS builder

WORKDIR /app
COPY . .
RUN npm install && npm run build

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/server/package.json apps/server/
COPY --from=builder /app/apps/server/dist apps/server/dist
COPY --from=builder /app/apps/web/dist apps/web/dist
COPY --from=builder /app/node_modules node_modules

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]
