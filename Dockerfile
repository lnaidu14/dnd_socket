# dnd_socket - Socket.IO server (PostgreSQL)
FROM node:20-alpine

WORKDIR /app

COPY dnd_socket/package.json dnd_socket/package-lock.json ./
RUN npm ci --omit=dev

COPY dnd_socket/server.js dnd_socket/db.js ./

EXPOSE 4000

CMD ["node", "server.js"]
