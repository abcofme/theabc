# Сборка фронтенда
FROM node:22-alpine AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Раздаёт Caddy (конфиг монтируется из deploy/Caddyfile)
FROM caddy:2-alpine
COPY --from=build-stage /app/dist /srv
