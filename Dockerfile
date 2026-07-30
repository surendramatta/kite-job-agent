FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    KITE_DATA_DIR=/app/data

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build
RUN mkdir -p /app/data

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start"]
