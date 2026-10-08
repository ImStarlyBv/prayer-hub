# Publisher service. Build context is the REPO ROOT (it needs the Eleventy site
# source to render releases):  docker build -f publisher/Dockerfile .
FROM node:20-alpine
WORKDIR /srv/app
COPY package*.json ./
RUN npm ci
COPY . .
ENV SITE_ROOT=/srv/site \
    PRAYER_DATA_DIR=/srv/data \
    PORT=8000
EXPOSE 8000
CMD ["node", "publisher/server.js"]
