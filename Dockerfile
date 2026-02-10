# dnd_socket - Socket.IO server (build context must be parent so we can copy dnd)
FROM node:20-alpine

# sqlite3 native build deps
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dnd (for init.js and shared DB schema) so ../dnd resolves from dnd_socket
COPY dnd ./dnd
COPY dnd_socket/package.json dnd_socket/package-lock.json ./dnd_socket/
COPY dnd_socket/server.js ./dnd_socket/

WORKDIR /app/dnd_socket
RUN npm ci --omit=dev

# Shared DB path (same volume as dnd in compose)
ENV DATABASE_PATH=/data/game_data.db

EXPOSE 4000

CMD ["node", "server.js"]
