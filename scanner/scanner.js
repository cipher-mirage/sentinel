/**
 * SENTINEL SCANNER
 * ----------------
 * This is the core engine. It has two jobs:
 *
 *  1. GraphQL Introspection Scan — queries a target's /graphql endpoint
 *     using the standard introspection query (the same one browser tools
 *     like GraphiQL use, and the same one bug bounty hunters use to map
 *     an unknown API). It then analyzes the schema for risky patterns.
 *
 *  2. Network Asset Discovery — simulates scanning a subnet for devices
 *     (in a real deployment this step would use a tool like nmap; here
 *     it's simulated with representative sample data so the project is
 *     safely runnable anywhere without needing raw network access).
 *
 * Both feed into a shared risk-scoring model and are written to the
 * SQLite database via db/db.js.
 */

const fetch = require("node-fetch");
const { upsertAsset, recordScan } = require("../db/db");

// Standard GraphQL introspection query
const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      types {
        name
        kind
        fields {
          name
          type { name kind ofType { name kind } }
          args { name }
        }
      }
    }
  }
`;

// Field names that suggest sensitive data exposure
const SENSITIVE_FIELD_PATTERNS = [
  "ssn", "password", "secret", "token", "creditcard", "card_number",
  "internalnotes", "apikey", "api_key", "privatekey",
];

// Mutation names that suggest a dangerous, potentially unauthenticated action
const DANGEROUS_MUTATION_PATTERNS = [
  "reset", "delete", "drop", "wipe", "grant", "elevate",
];

async function introspectGraphQLEndpoint(url) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  });

  if (!res.ok) {
    return { introspectionEnabled: false, schema: null };
  }

  const json = await res.json();
  if (json.errors || !json.data || !json.data.__schema) {
    return { introspectionEnabled: false, schema: null };
  }

  return { introspectionEnabled: true, schema: json.data.__schema };
}

function analyzeSchema(schema) {
  const findings = [];
  let score = 0;

  // Introspection being reachable at all is itself a finding —
  // it should almost always be disabled in production.
  findings.push({
    severity: "medium",
    issue: "GraphQL introspection is enabled",
    detail: "Introspection lets anyone request the full schema, revealing the API's internal structure.",
  });
  score += 25;

  const allFields = [];
  for (const type of schema.types || []) {
    if (!type.fields) continue;
    for (const field of type.fields) {
      allFields.push({ typeName: type.name, fieldName: field.name });
    }
  }

  // Check for sensitive fields exposed directly in the schema
  for (const { typeName, fieldName } of allFields) {
    const lower = fieldName.toLowerCase();
    if (SENSITIVE_FIELD_PATTERNS.some((p) => lower.includes(p))) {
      findings.push({
        severity: "high",
        issue: `Sensitive field exposed: ${typeName}.${fieldName}`,
        detail: "This field name suggests it holds sensitive data queryable through the API.",
      });
      score += 20;
    }
  }

  // Check mutations for dangerous, likely-unauthenticated actions
  const mutationTypeName = schema.mutationType?.name;
  const mutationType = (schema.types || []).find((t) => t.name === mutationTypeName);
  if (mutationType && mutationType.fields) {
    for (const field of mutationType.fields) {
      const lower = field.name.toLowerCase();
      if (DANGEROUS_MUTATION_PATTERNS.some((p) => lower.includes(p))) {
        findings.push({
          severity: "critical",
          issue: `Potentially dangerous mutation exposed: ${field.name}`,
          detail: "This mutation name suggests a destructive or high-impact action with no visible auth argument.",
        });
        score += 30;
      }
    }
  }

  score = Math.min(score, 100);
  const level =
    score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : "low";

  return { score, level, findings };
}

// Simulated network discovery — representative of what an nmap-based
// scan would surface on a real subnet.
function discoverSimulatedDevices() {
  return [
    { name: "core-router-01", ip_address: "10.0.0.1", lastPatched: "2022-03-01", openPorts: [22, 80, 443] },
    { name: "file-server-02", ip_address: "10.0.0.15", lastPatched: "2021-11-10", openPorts: [21, 22, 445] },
    { name: "reception-pc-07", ip_address: "10.0.0.42", lastPatched: "2024-06-20", openPorts: [3389] },
  ];
}

function analyzeDevice(device) {
  const findings = [];
  let score = 0;

  const patchDate = new Date(device.lastPatched);
  const monthsSincePatch =
    (Date.now() - patchDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

  if (monthsSincePatch > 12) {
    findings.push({
      severity: "high",
      issue: "Device has not been patched in over 12 months",
      detail: `Last patched ${device.lastPatched}.`,
    });
    score += 35;
  } else if (monthsSincePatch > 6) {
    findings.push({
      severity: "medium",
      issue: "Device patching is overdue",
      detail: `Last patched ${device.lastPatched}.`,
    });
    score += 15;
  }

  const riskyPorts = { 21: "FTP (unencrypted)", 23: "Telnet (unencrypted)", 3389: "RDP (remote desktop, common attack target)" };
  for (const port of device.openPorts) {
    if (riskyPorts[port]) {
      findings.push({
        severity: "medium",
        issue: `Risky open port: ${port} (${riskyPorts[port]})`,
        detail: "This service is commonly targeted or transmits data without encryption.",
      });
      score += 15;
    }
  }

  score = Math.min(score, 100);
  const level =
    score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : "low";

  return { score, level, findings };
}

async function runFullScan(targets = ["http://localhost:4001/graphql"]) {
  const results = [];

  // --- Scan GraphQL API targets ---
  for (const url of targets) {
    const assetId = upsertAsset({ name: url, type: "api", endpoint: url });
    try {
      const { introspectionEnabled, schema } = await introspectGraphQLEndpoint(url);
      let analysis;
      if (introspectionEnabled) {
        analysis = analyzeSchema(schema);
      } else {
        analysis = { score: 0, level: "low", findings: [{ severity: "low", issue: "Introspection disabled or unreachable", detail: "No schema could be retrieved." }] };
      }
      recordScan({ asset_id: assetId, risk_score: analysis.score, risk_level: analysis.level, findings: analysis.findings });
      results.push({ name: url, type: "api", ...analysis });
    } catch (err) {
      recordScan({ asset_id: assetId, risk_score: 0, risk_level: "low", findings: [{ severity: "low", issue: "Scan failed", detail: err.message }] });
      results.push({ name: url, type: "api", score: 0, level: "low", findings: [{ severity: "low", issue: "Scan failed", detail: err.message }] });
    }
  }

  // --- Scan (simulated) network devices ---
  for (const device of discoverSimulatedDevices()) {
    const assetId = upsertAsset({ name: device.name, type: "device", ip_address: device.ip_address });
    const analysis = analyzeDevice(device);
    recordScan({ asset_id: assetId, risk_score: analysis.score, risk_level: analysis.level, findings: analysis.findings });
    results.push({ name: device.name, type: "device", ...analysis });
  }

  return results;
}

module.exports = { runFullScan, introspectGraphQLEndpoint, analyzeSchema, analyzeDevice, discoverSimulatedDevices };
