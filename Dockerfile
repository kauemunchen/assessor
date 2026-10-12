FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
CMD ["sh", "-c", "node src/db/migrate.js && node src/index.js"]
