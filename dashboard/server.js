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
const { buildReport } = require("../report");

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

// --- Security report -------------------------------------------------------
// Turns whatever getLatestSnapshot() returns into the shape report.js expects:
// { name, type, score, level, findings: [{ severity, issue, detail }] }
// It accepts either score/level or risk_score/risk_level, and findings stored
// as an array or as a JSON string.
function normalizeAsset(row) {
  let findings = row.findings;
  if (typeof findings === "string") {
    try {
      findings = JSON.parse(findings);
    } catch (e) {
      findings = [];
    }
  }
  return {
    name: row.name || row.endpoint || row.ip_address || "Unknown asset",
    type: row.type === "api" ? "api" : "device",
    score: Number(row.score ?? row.risk_score ?? 0),
    level: row.level ?? row.risk_level ?? "low",
    findings: Array.isArray(findings) ? findings : [],
  };
}

// Open /report in the browser to view it, or /report?download=1 to save it as a file.
// Optional: /report?for=Client%20Name&by=Your%20Name
app.get("/report", (req, res) => {
  const snapshot = getLatestSnapshot() || [];
  const results = snapshot.map(normalizeAsset);
  const html = buildReport(results, {
    preparedFor: req.query.for ? String(req.query.for).slice(0, 80) : "",
    preparedBy: req.query.by ? String(req.query.by).slice(0, 80) : "",
  });
  res.set("Content-Type", "text/html; charset=utf-8");
  if (req.query.download) {
    res.set("Content-Disposition", 'attachment; filename="sentinel-report.html"');
  }
  res.send(html);
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
