FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.61.1-noble AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    KITE_DATA_DIR=/app/data \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN useradd --system --uid 1001 kite || true

COPY --from=builder --chown=kite:nodejs /app/.next/standalone ./
COPY --from=builder --chown=kite:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=kite:nodejs /app/src/lib/schema.sql ./src/lib/schema.sql
COPY --from=builder --chown=kite:nodejs /app/scripts ./scripts

RUN mkdir -p /app/data && chown -R kite:nodejs /app/data

USER kite
EXPOSE 3000
CMD ["node", "server.js"]
