FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/_site /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
