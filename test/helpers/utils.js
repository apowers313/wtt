// Wait for port to be available
async function waitForPort(port, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isPortFree(port)) {
      return true;
    }
    await sleep(100);
  }
  return false;
}

// Check if port is free
async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Capture console output
function captureOutput(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const output = { stdout: [], stderr: [] };
  
  console.log = (...args) => output.stdout.push(args.join(' '));
  console.error = (...args) => output.stderr.push(args.join(' '));
  
  try {
    fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  
  return output;
}

module.exports = {
  waitForPort,
  isPortFree,
  sleep,
  captureOutput
};