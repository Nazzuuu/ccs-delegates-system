FROM node:20-alpine

WORKDIR /app

COPY tfvc-backend/package*.json ./
RUN npm install

COPY tfvc-backend/ .
RUN chmod +x node_modules/.bin/strapi
RUN npm run build

EXPOSE 1337

CMD ["node_modules/.bin/strapi", "start"]
