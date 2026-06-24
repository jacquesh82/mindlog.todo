# Build stage: install core+server deps and compile TypeScript.
FROM node:24-bookworm AS build
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY packages/web/package.json ./packages/web/package.json

# Install only the core + server workspaces (skip the web app's React/Vite deps).
RUN npm install -w @mindlog/core -w @mindlog/server --include-workspace-root

COPY packages/core ./packages/core
COPY packages/server ./packages/server
RUN npm run build:server

# Runtime stage: slim image with compiled output and node_modules.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/server/package.json ./packages/server/package.json
COPY --from=build /app/packages/server/dist ./packages/server/dist

EXPOSE 8080
CMD ["node", "packages/server/dist/index.js"]
