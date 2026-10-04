const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite"); // built into Node 22+, no native compiler needed

const DB_PATH = path.join(__dirname, "sentinel.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

const db = new DatabaseSync(DB_PATH);

// Apply schema on startup (idempotent - uses IF NOT EXISTS)
const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
db.exec(schema);

function upsertAsset({ name, type, endpoint = null, ip_address = null }) {
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT * FROM assets WHERE name = ? AND type = ?")
    .get(name, type);

  if (existing) {
    db.prepare("UPDATE assets SET last_seen = ? WHERE id = ?").run(now, existing.id);
    return existing.id;
  }

  const info = db
    .prepare(
      "INSERT INTO assets (name, type, endpoint, ip_address, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(name, type, endpoint, ip_address, now, now);
  return info.lastInsertRowid;
}

function recordScan({ asset_id, risk_score, risk_level, findings }) {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO scans (asset_id, scanned_at, risk_score, risk_level, findings) VALUES (?, ?, ?, ?, ?)"
  ).run(asset_id, now, risk_score, risk_level, JSON.stringify(findings));
}

function getLatestSnapshot() {
  // Returns each asset with its most recent scan result
  return db
    .prepare(
      `
    SELECT a.id, a.name, a.type, a.endpoint, a.ip_address, a.first_seen, a.last_seen,
           s.risk_score, s.risk_level, s.findings, s.scanned_at
    FROM assets a
    LEFT JOIN scans s ON s.id = (
      SELECT id FROM scans WHERE asset_id = a.id ORDER BY scanned_at DESC LIMIT 1
    )
    ORDER BY a.id
  `
    )
    .all()
    .map((row) => ({
      ...row,
      findings: row.findings ? JSON.parse(row.findings) : [],
    }));
}

function getScanHistory(asset_id) {
  return db
    .prepare("SELECT * FROM scans WHERE asset_id = ? ORDER BY scanned_at DESC")
    .all(asset_id)
    .map((row) => ({ ...row, findings: JSON.parse(row.findings) }));
}

module.exports = { db, upsertAsset, recordScan, getLatestSnapshot, getScanHistory };
