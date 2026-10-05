/**
 * SENTINEL REPORT GENERATOR
 * -------------------------
 * Turns scan results (the array returned by scanner.runFullScan) into a
 * clean, self-contained HTML security report with plain-language fixes.
 * The page has a "Print / Save as PDF" button, so no extra libraries are needed.
 */

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Plain-language "what to do about it" for each kind of finding the scanner can produce.
function fixFor(finding) {
  const issue = (finding.issue || "").toLowerCase();

  if (issue.includes("introspection is enabled")) {
    return "Turn introspection off in production (keep it on only in development). This stops outsiders from downloading a map of your API.";
  }
  if (issue.startsWith("sensitive field exposed")) {
    return "Remove this field from the public API, or restrict it so only authorised, logged-in users can read it. Never expose personal or secret data (such as ID numbers or passwords) through a general-purpose query.";
  }
  if (issue.startsWith("potentially dangerous mutation")) {
    return "Require login and a permission check before this action can run, and remove it from the API if it isn't needed. Destructive actions must never be callable by anonymous users.";
  }
  if (issue.includes("not been patched in over 12 months")) {
    return "Apply the latest security updates as soon as possible, then set a regular patch schedule (for example monthly). Old, unpatched devices are the easiest to attack.";
  }
  if (issue.includes("patching is overdue")) {
    return "Schedule and apply pending security updates in the next maintenance window.";
  }
  if (issue.includes("port: 21")) {
    return "Replace FTP with SFTP (encrypted file transfer) and close port 21 if it isn't needed.";
  }
  if (issue.includes("port: 23")) {
    return "Disable Telnet and use SSH instead. Telnet sends passwords in plain text.";
  }
  if (issue.includes("port: 3389")) {
    return "Don't expose Remote Desktop directly. Put it behind a VPN, turn on multi-factor authentication, and limit which addresses can connect.";
  }
  if (issue.includes("scan failed") || issue.includes("unreachable")) {
    return "Check that the target is online and the address is correct, then run the scan again. This result does not mean the target is safe.";
  }
  return "Review this finding with your IT team and decide whether the exposure is needed.";
}

function countBySeverity(results) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const asset of results) {
    for (const f of asset.findings || []) {
      if (counts[f.severity] !== undefined) counts[f.severity] += 1;
    }
  }
  return counts;
}

function overallLevel(results) {
  let worst = "low";
  for (const asset of results) {
    if (SEVERITY_ORDER.indexOf(asset.level) < SEVERITY_ORDER.indexOf(worst)) worst = asset.level;
  }
  return worst;
}

function renderAsset(asset) {
  const findings = [...(asset.findings || [])].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  const rows = findings
    .map(
      (f) => `
        <div class="finding sev-${esc(f.severity)}">
          <div class="finding-head">
            <span class="badge b-${esc(f.severity)}">${esc(f.severity)}</span>
            <strong>${esc(f.issue)}</strong>
          </div>
          <p class="detail">${esc(f.detail)}</p>
          <p class="fix"><span>Recommended fix:</span> ${esc(fixFor(f))}</p>
        </div>`
    )
    .join("");

  return `
    <section class="asset">
      <div class="asset-head">
        <div>
          <h3>${esc(asset.name)}</h3>
          <span class="muted">${asset.type === "api" ? "API endpoint" : "Network device"}</span>
        </div>
        <div class="score s-${esc(asset.level)}">
          <b>${esc(asset.score)}</b><small>/100 · ${esc(asset.level)}</small>
        </div>
      </div>
      ${rows || '<p class="muted">No findings recorded.</p>'}
    </section>`;
}

/**
 * @param {Array} results   Array returned by runFullScan()
 * @param {Object} options  { title, preparedFor, preparedBy, generatedAt }
 * @returns {string} full HTML document
 */
function buildReport(results, options = {}) {
  const {
    title = "Security Assessment Report",
    preparedFor = "",
    preparedBy = "",
    generatedAt = new Date(),
  } = options;

  const sorted = [...results].sort((a, b) => b.score - a.score);
  const counts = countBySeverity(results);
  const worst = overallLevel(results);
  const top = sorted[0];
  const dateText = new Date(generatedAt).toLocaleString("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const hasDevices = results.some((r) => r.type === "device");

  const summaryRows = sorted
    .map(
      (a) => `
      <tr>
        <td>${esc(a.name)}</td>
        <td>${a.type === "api" ? "API" : "Device"}</td>
        <td>${esc(a.score)}</td>
        <td><span class="badge b-${esc(a.level)}">${esc(a.level)}</span></td>
        <td>${(a.findings || []).length}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root {
    --ink:#1b2430; --muted:#5d6b7c; --line:#dfe5ec; --bg:#f5f7fa; --card:#ffffff;
    --critical:#c81e4a; --high:#e8590c; --medium:#c98a00; --low:#0f9d8a; --brand:#14233d;
  }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.55 -apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:var(--ink); background:var(--bg); }
  .page { max-width:860px; margin:0 auto; padding:32px 20px 56px; }
  header.top { background:var(--brand); color:#fff; border-radius:12px; padding:28px; }
  header.top h1 { margin:0 0 6px; font-size:26px; }
  header.top p { margin:2px 0; color:#c8d3e3; font-size:14px; }
  .toolbar { text-align:right; margin:14px 0; }
  button.print { background:#fff; border:1px solid var(--line); border-radius:8px; padding:8px 14px; font:inherit; cursor:pointer; }
  h2 { margin:30px 0 12px; font-size:19px; }
  .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px; text-align:center; }
  .card b { display:block; font-size:28px; }
  .card span { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
  .c-critical b { color:var(--critical); } .c-high b { color:var(--high); }
  .c-medium b { color:var(--medium); } .c-low b { color:var(--low); }
  .overview { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px 18px; margin-bottom:12px; }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); font-size:14px; }
  th { background:#eef2f7; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
  tr:last-child td { border-bottom:0; }
  .badge { display:inline-block; padding:2px 9px; border-radius:99px; font-size:12px; font-weight:600; color:#fff; text-transform:capitalize; }
  .b-critical { background:var(--critical); } .b-high { background:var(--high); }
  .b-medium { background:var(--medium); } .b-low { background:var(--low); }
  .asset { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px 18px; margin-bottom:14px; page-break-inside:avoid; }
  .asset-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:8px; }
  .asset h3 { margin:0; font-size:16px; word-break:break-all; }
  .muted { color:var(--muted); font-size:13px; }
  .score { text-align:right; white-space:nowrap; }
  .score b { font-size:26px; } .score small { display:block; color:var(--muted); text-transform:capitalize; }
  .s-critical b { color:var(--critical); } .s-high b { color:var(--high); }
  .s-medium b { color:var(--medium); } .s-low b { color:var(--low); }
  .finding { border-left:4px solid var(--line); padding:8px 0 8px 12px; margin:12px 0; }
  .sev-critical { border-color:var(--critical); } .sev-high { border-color:var(--high); }
  .sev-medium { border-color:var(--medium); } .sev-low { border-color:var(--low); }
  .finding-head { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .detail { margin:6px 0 4px; color:var(--muted); }
  .fix { margin:4px 0 0; background:#f1f7f5; border-radius:8px; padding:8px 10px; }
  .fix span { font-weight:600; }
  .note { font-size:13px; color:var(--muted); border-top:1px solid var(--line); margin-top:28px; padding-top:14px; }
  @media (max-width:600px) { .cards { grid-template-columns:repeat(2,1fr); } }
  @media print {
    body { background:#fff; } .toolbar { display:none; }
    .page { padding:0; } header.top { border-radius:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .badge, .fix, th { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
</style>
</head>
<body>
<div class="page">
  <header class="top">
    <h1>${esc(title)}</h1>
    <p>Generated by Sentinel · ${esc(dateText)}</p>
    ${preparedFor ? `<p>Prepared for: ${esc(preparedFor)}</p>` : ""}
    ${preparedBy ? `<p>Prepared by: ${esc(preparedBy)}</p>` : ""}
  </header>

  <div class="toolbar"><button class="print" onclick="window.print()">Print / Save as PDF</button></div>

  <h2>Summary</h2>
  <div class="overview">
    <p style="margin:0">
      <strong>${results.length}</strong> assets were checked and
      <strong>${counts.critical + counts.high + counts.medium + counts.low}</strong> findings were recorded.
      Overall risk level: <span class="badge b-${esc(worst)}">${esc(worst)}</span>.
      ${top ? `The highest-risk asset is <strong>${esc(top.name)}</strong> (score ${esc(top.score)}/100).` : ""}
    </p>
  </div>
  <div class="cards">
    <div class="card c-critical"><b>${counts.critical}</b><span>Critical</span></div>
    <div class="card c-high"><b>${counts.high}</b><span>High</span></div>
    <div class="card c-medium"><b>${counts.medium}</b><span>Medium</span></div>
    <div class="card c-low"><b>${counts.low}</b><span>Low</span></div>
  </div>

  <h2>Assets at a glance</h2>
  <table>
    <thead><tr><th>Asset</th><th>Type</th><th>Score</th><th>Level</th><th>Findings</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>

  <h2>Detailed findings and fixes</h2>
  ${sorted.map(renderAsset).join("")}

  <p class="note">
    ${hasDevices ? "Note: device results in this version of Sentinel come from simulated sample data and are shown to demonstrate how the report works. " : ""}
    This report reflects what an automated scan could see at the time it ran. It is not a full penetration test and does not guarantee that no other weaknesses exist.
    Only systems you own or have written permission to test should be scanned.
  </p>
</div>
</body>
</html>`;
}

module.exports = { buildReport, fixFor };
