import express from "express"

const app = express()
import http from "http"
import { initDatabase } from "../dnd/src/data/db/init.js";

const server = http.createServer(app)

import { Server } from "socket.io"

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const port = 4000

app.get('/', (req, res) => {
    res.send("Socket server is live")
})

const dmMap = new Map();
const campaignPlayers = new Map();

io.on("connection", async (socket) => {
  console.log("Connected:", socket.id);
  const db = await initDatabase();

  socket.on("joinCampaign", async ({ campaignId, name }) => {
    socket.join(campaignId);

    let session = await db.get("SELECT * FROM sessions WHERE campaign_id = ?", [
      campaignId,
    ]);

    if (!session) {
      await db.run(
        `INSERT INTO sessions (id, campaign_id, player_count, connected_users)
         VALUES (?, ?, 0, '[]')`,
        [campaignId, campaignId]
      );
      session = await db.get("SELECT * FROM sessions WHERE campaign_id = ?", [
        campaignId,
      ]);
      console.log(`Created new session for campaign ${campaignId}`);
    }

    if (!campaignPlayers.has(campaignId)) campaignPlayers.set(campaignId, []);
    campaignPlayers.get(campaignId).push({ socketId: socket.id, name });

    let role = "player";
    if (!dmMap.has(campaignId)) {
      role = "dm";
      dmMap.set(campaignId, socket.id);
    }

    const players = campaignPlayers.get(campaignId).map((p) => p.name);

    await db.run(
      `UPDATE sessions
       SET player_count = ?, connected_users = ?
       WHERE campaign_id = ?`,
      [players.length, JSON.stringify(players), campaignId]
    );

    socket.emit("roleAssigned", { role });

    io.to(campaignId).emit("sessionUpdate", {
      campaignId,
      player_count: players.length,
      connected_users: players,
      dm_name: dmMap.has(campaignId)
        ? campaignPlayers
            .get(campaignId)
            .find((p) => p.socketId === dmMap.get(campaignId))?.name
        : null,
      session_closed: false,
    });

    console.log(`Socket ${socket.id} joined ${campaignId} as ${role}`);
  });

  socket.on("disconnecting", async () => {
    const rooms = Array.from(socket.rooms);
    for (const campaignId of rooms) {
      if (campaignId === socket.id) continue;

      if (campaignPlayers.has(campaignId)) {
        const updated = campaignPlayers
          .get(campaignId)
          .filter((p) => p.socketId !== socket.id);
        campaignPlayers.set(campaignId, updated);
      }

      if (dmMap.get(campaignId) === socket.id) {
        io.to(campaignId).emit("sessionClosed");
        io.to(campaignId).emit("sessionUpdate", {
          campaignId,
          player_count: 0,
          connected_users: [],
          dm_name: null,
          session_closed: true,
        });

        setTimeout(() => {
          io.socketsLeave(campaignId);
          dmMap.delete(campaignId);
          campaignPlayers.delete(campaignId);
        }, 500);

        await db.run(
          `UPDATE sessions SET player_count = 0, connected_users = '[]' WHERE campaign_id = ?`,
          [campaignId]
        );

        console.log(`DM left, session ${campaignId} closed`);
        continue;
      }

      const updatedPlayers =
        campaignPlayers.get(campaignId)?.map((p) => p.name) || [];
      await db.run(
        `UPDATE sessions
         SET player_count = ?, connected_users = ?
         WHERE campaign_id = ?`,
        [updatedPlayers.length, JSON.stringify(updatedPlayers), campaignId]
      );

      io.to(campaignId).emit("sessionUpdate", {
        campaignId,
        player_count: updatedPlayers.length,
        connected_users: updatedPlayers,
        dm_name: dmMap.has(campaignId)
          ? campaignPlayers
              .get(campaignId)
              .find((p) => p.socketId === dmMap.get(campaignId))?.name
          : null,
        session_closed: false,
      });

      console.log(`Socket ${socket.id} left ${campaignId}`);
    }
  });
});

server.listen(port, () => {
    console.log(`Listening on port ${port}`)
})