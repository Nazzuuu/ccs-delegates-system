FROM node:20-alpine WORKDIR /app COPY tfvc-backend/package*.json ./ RUN npm install COPY tfvc-backend/ . RUN npm run build EXPOSE 1337 CMD ["npm", "run", "start"]
