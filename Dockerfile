# Playwright base image (Chromium) for catalog scraping
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Persist scraped cache on a mounted volume at /app/data
VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
