# Build stage: produce the static SPA bundle.
FROM node:24-bookworm AS build
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package.json tsconfig.base.json ./
COPY packages/web/package.json ./packages/web/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/server/package.json ./packages/server/package.json

RUN npm install -w @mindlog/web --include-workspace-root

COPY packages/web ./packages/web
RUN npm run build -w @mindlog/web

# Runtime stage: nginx serving the static files.
FROM nginx:1.27-alpine AS runtime
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
