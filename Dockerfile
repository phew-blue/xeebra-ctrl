## Stage 1 — build React frontend
FROM node:24-alpine AS build

WORKDIR /app

# corepack honours the "packageManager" pin in frontend/package.json.
# `npm install -g pnpm` does not, and silently drifted to pnpm 11 against a
# lockfile written by 10.33.0.
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

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
