## Stage 1 — build React frontend
FROM node:24-alpine AS build

WORKDIR /app

RUN npm install -g pnpm

COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY frontend/ .
RUN pnpm build

## Stage 2 — serve with nginx
FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# nginx non-root: listen on 80 but run as nginx user (uid 101)
EXPOSE 80
