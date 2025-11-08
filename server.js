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

const dmMap = new Map(); // campaignId -> socketId of DM
const campaignPlayers = new Map(); // campaignId -> [{ socketId, name }]

io.on("connection", async (socket) => {
  console.log("Connected:", socket.id);
  const db = await initDatabase();

  // Player joins a campaign
  socket.on("joinCampaign", async ({ campaignId, name }) => {
    socket.join(campaignId);

    // Ensure session exists in DB
    let session = await db.get(
      "SELECT * FROM sessions WHERE campaign_id = ?",
      [campaignId]
    );

    if (!session) {
      // Create session if first join
      await db.run(
        `INSERT INTO sessions (id, campaign_id, player_count, connected_users)
         VALUES (?, ?, 0, '[]')`,
        [campaignId, campaignId]
      );
      session = await db.get(
        "SELECT * FROM sessions WHERE campaign_id = ?",
        [campaignId]
      );
      console.log(`Created new session for campaign ${campaignId}`);
    }

    // Add to in-memory players map
    if (!campaignPlayers.has(campaignId)) campaignPlayers.set(campaignId, []);
    campaignPlayers.get(campaignId).push({ socketId: socket.id, name });

    // Determine role (first join = DM)
    let role = "player";
    if (!dmMap.has(campaignId)) {
      role = "dm";
      dmMap.set(campaignId, socket.id);
    }

    const players = campaignPlayers.get(campaignId).map((p) => p.name);

    // Update session in DB
    await db.run(
      `UPDATE sessions
       SET player_count = ?, connected_users = ?
       WHERE campaign_id = ?`,
      [players.length, JSON.stringify(players), campaignId]
    );

    // Emit role to this socket
    socket.emit("roleAssigned", { role });

    // Notify all players in this campaign
    io.to(campaignId).emit("sessionUpdate", {
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

  // Handle disconnection
  socket.on("disconnecting", async () => {
    const rooms = Array.from(socket.rooms);
    for (const campaignId of rooms) {
      if (campaignId === socket.id) continue;

      // Remove from in-memory players
      if (campaignPlayers.has(campaignId)) {
        const updated = campaignPlayers
          .get(campaignId)
          .filter((p) => p.socketId !== socket.id);
        campaignPlayers.set(campaignId, updated);
      }

      // If DM disconnected, close session for all
      if (dmMap.get(campaignId) === socket.id) {
        io.to(campaignId).emit("sessionClosed"); // can redirect frontend
        io.to(campaignId).emit("sessionUpdate", {
          player_count: 0,
          connected_users: [],
          dm_name: null,
          session_closed: true,
        });
        io.socketsLeave(campaignId);
        dmMap.delete(campaignId);
        campaignPlayers.delete(campaignId);
        await db.run(
            `UPDATE sessions SET player_count = 0, connected_users = '[]' WHERE campaign_id = ?`,
            [campaignId]
        );

        console.log(`DM left, session ${campaignId} closed`);
        continue;
      }

      // Update DB for remaining players
      const updatedPlayers = campaignPlayers.get(campaignId)?.map(p => p.name) || [];
      await db.run(
        `UPDATE sessions
         SET player_count = ?, connected_users = ?
         WHERE campaign_id = ?`,
        [updatedPlayers.length, JSON.stringify(updatedPlayers), campaignId]
      );

      // Notify remaining players
      io.to(campaignId).emit("sessionUpdate", {
        player_count: updatedPlayers.length,
        connected_users: updatedPlayers,
        dm_name: dmMap.has(campaignId)
          ? campaignPlayers.get(campaignId).find(p => p.socketId === dmMap.get(campaignId))?.name
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