// start.js - launches the target API and the dashboard together with one command.
const { spawn } = require('node:child_process');
const path = require('node:path');

const services = [
  { name: 'target-api', script: path.join('target-api', 'server.js'), delay: 0 },
  { name: 'dashboard', script: path.join('dashboard', 'server.js'), delay: 1000 },
];

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[sentinel] Shutting down...');
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 300);
}

for (const svc of services) {
  setTimeout(() => {
    if (shuttingDown) return;
    const child = spawn(process.execPath, [svc.script], { stdio: 'inherit', cwd: __dirname });
    children.push(child);
    child.on('exit', (code, signal) => {
      if (!shuttingDown) {
        console.log(`[sentinel] ${svc.name} stopped (${signal || 'code ' + code}).`);
        shutdown(code || 1);
      }
    });
  }, svc.delay);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));