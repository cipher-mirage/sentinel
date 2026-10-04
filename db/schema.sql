-- Sentinel Database Schema
-- Extends the original IT Asset Management design with real-time scan history.

CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,              -- 'api' or 'device'
    endpoint TEXT,                   -- URL for APIs
    ip_address TEXT,                 -- for network devices
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    scanned_at TEXT NOT NULL,
    risk_score INTEGER NOT NULL,     -- 0 (safe) - 100 (critical)
    risk_level TEXT NOT NULL,        -- 'low' | 'medium' | 'high' | 'critical'
    findings TEXT NOT NULL,          -- JSON string of issues found
    FOREIGN KEY (asset_id) REFERENCES assets (id)
);

CREATE INDEX IF NOT EXISTS idx_scans_asset ON scans (asset_id);
