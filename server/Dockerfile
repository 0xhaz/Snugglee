# Cloud Run. Node 22 LTS — --experimental-strip-types runs the TypeScript
# sources directly, so there is no build step to drift out of sync.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "src/index.ts"]
