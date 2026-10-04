/**
 * TARGET API
 * ----------
 * This simulates a real company's GraphQL API — the kind of system
 * Sentinel is designed to scan and assess.
 *
 * It intentionally includes some risky patterns (introspection left on,
 * sensitive fields exposed, an unauthenticated mutation) so that Sentinel
 * has real things to detect. This mirrors mistakes found in real-world
 * GraphQL APIs during bug bounty / security research.
 */

const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");

// --- Schema definition -----------------------------------------------
// Notice: `resetAllPasswords` is a mutation with no auth field, and
// `ssn` / `internalNotes` are sensitive fields directly exposed.
const schema = buildSchema(`
  type Employee {
    id: ID!
    name: String!
    email: String!
    role: String!
    ssn: String
    internalNotes: String
  }

  type Device {
    id: ID!
    hostname: String!
    ipAddress: String!
    os: String!
    lastPatched: String
  }

  type Query {
    employees: [Employee!]!
    devices: [Device!]!
    employee(id: ID!): Employee
  }

  type Mutation {
    resetAllPasswords: Boolean
    updateDevice(id: ID!, hostname: String): Device
  }
`);

// --- Fake data ----------------------------------------------------------
const employees = [
  { id: "1", name: "Jane Mwangi", email: "jane@company.com", role: "IT Admin", ssn: "12-3456-789", internalNotes: "Has root access to all servers" },
  { id: "2", name: "Brian Otieno", email: "brian@company.com", role: "Support", ssn: "98-7654-321", internalNotes: "Password reset pending" },
];

const devices = [
  { id: "1", hostname: "core-router-01", ipAddress: "10.0.0.1", os: "RouterOS 6.44", lastPatched: "2022-03-01" },
  { id: "2", hostname: "file-server-02", ipAddress: "10.0.0.15", os: "Ubuntu 18.04", lastPatched: "2021-11-10" },
  { id: "3", hostname: "reception-pc-07", ipAddress: "10.0.0.42", os: "Windows 10", lastPatched: "2024-06-20" },
];

const root = {
  employees: () => employees,
  devices: () => devices,
  employee: ({ id }) => employees.find((e) => e.id === id),
  resetAllPasswords: () => {
    console.log("[target-api] resetAllPasswords called — no auth check performed!");
    return true;
  },
  updateDevice: ({ id, hostname }) => {
    const d = devices.find((d) => d.id === id);
    if (d && hostname) d.hostname = hostname;
    return d;
  },
};

const app = express();

// Introspection is left ON here on purpose — this is exactly the kind of
// production misconfiguration Sentinel is built to catch.
app.use(
  "/graphql",
  graphqlHTTP({
    schema,
    rootValue: root,
    graphiql: true,
  })
);

const PORT = 4001;
app.listen(PORT, () => {
  console.log(`[target-api] Demo company GraphQL API running at http://localhost:${PORT}/graphql`);
});
