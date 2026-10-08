# Prayer Hub web server: Caddy serving the pre-rendered static site.
#
# The site is baked into the image as a first release so this image also works
# on its own (plain Dockerfile deploy). With docker-compose, /srv/site is the
# shared volume the publisher renders into, and /api/ is proxied to it.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/_site /srv/site/releases/baked
RUN ln -s releases/baked /srv/site/current
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
