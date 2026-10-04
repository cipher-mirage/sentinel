/**
 * DASHBOARD SERVER
 * ----------------
 * Serves the Sentinel frontend (the "constellation map") and pushes
 * real-time updates to connected browsers over a WebSocket whenever a
 * new scan completes. This is the "real-time" layer of the project —
 * conceptually the same idea as GraphQL subscriptions (push instead of
 * refresh), implemented here with plain WebSockets for simplicity and
 * portability.
 */

const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const { runFullScan } = require("../scanner/scanner");
const { getLatestSnapshot } = require("../db/db");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

// REST endpoint for the initial snapshot when the page first loads
app.get("/api/snapshot", (req, res) => {
  res.json(getLatestSnapshot());
});

// Trigger an on-demand scan (also called automatically on an interval below)
app.post("/api/scan", async (req, res) => {
  await performScanAndBroadcast();
  res.json({ ok: true });
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

async function performScanAndBroadcast() {
  console.log("[dashboard] Running scan...");
  await runFullScan();
  const snapshot = getLatestSnapshot();
  broadcast({ type: "snapshot", data: snapshot, timestamp: new Date().toISOString() });
  console.log(`[dashboard] Scan complete — ${snapshot.length} assets, pushed to ${wss.clients.size} client(s).`);
}

wss.on("connection", (ws) => {
  console.log("[dashboard] Client connected");
  ws.send(JSON.stringify({ type: "snapshot", data: getLatestSnapshot(), timestamp: new Date().toISOString() }));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`[dashboard] Sentinel dashboard running at http://localhost:${PORT}`);

  // Run an initial scan shortly after startup, then re-scan periodically
  // to simulate continuous real-time monitoring.
  setTimeout(performScanAndBroadcast, 1500);
  setInterval(performScanAndBroadcast, 20000); // every 20s for demo purposes
});
