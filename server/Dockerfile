# Cloud Run. Node 22 LTS — --experimental-strip-types runs the TypeScript
# sources directly, so there is no build step to drift out of sync.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# Story skeletons are read at boot by src/skeletons.ts (BE-07). Without them
# the container exits before serving — the loader scans this directory eagerly
# so a missing one fails loudly at startup rather than on the first request.
COPY skeletons ./skeletons
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "src/index.ts"]
