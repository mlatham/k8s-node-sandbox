const http = require("http");

const TERMINATION_GRACE_PERIOD_SECONDS = 30; // Should match deployment.yaml
const PRE_STOP_DELAY_SECONDS = 8; // Should match deployment.yaml
const MAX_SHUTDOWN_TIME_SECONDS = TERMINATION_GRACE_PERIOD_SECONDS - PRE_STOP_DELAY_SECONDS;

const PORT = process.env.PORT || 8080;

let shuttingDown = false;
let operationCount = 0;

function beginOperation() {
  operationCount++;
}

function endOperation() {
  operationCount--;
}

const server = http.createServer((req, res) => {
  if (shuttingDown) {
    // TOUR: Reject handling new requests while shutting down - shouldn't be possible.
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("Server is shutting down\n");
    return;
  }

  if (req.url === "/healthz") {
    if (shuttingDown) {
      console.log(`[${new Date().toISOString()}] /healthz probe - 503 (shutting down)`);
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("not ready - shutting down\n");
      return;
    }

    console.log(`[${new Date().toISOString()}] /healthz probe - ok`);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok\n");
    return;
  }

  if (req.url === "/readyz") {
    if (shuttingDown) {
      console.log(`[${new Date().toISOString()}] /readyz probe - 503 (shutting down)`);
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("not ready - shutting down\n");
      return;
    }

    console.log(`[${new Date().toISOString()}] /readyz probe - ok`);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ready\n");
    return;
  }

  // TOUR: This is a long-running operation which can cause data loss if killed in darkness.
  if (req.url === "/long60") {
    const delayMs = 60 * 1000; // 1 minute
    console.log(`[${new Date().toISOString()}] Long request started (60s)`);
    beginOperation();

    const timeout = setTimeout(() => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("long request completed\n");
      endOperation(); 
    }, delayMs);

    // TODO: End the request gracefully if shutting down.
    res.on("close", () => {
      console.log(`/long60 request received close callback.`);
      // clearTimeout(timeout); // Gracefully end the request.
      // endOperation();
    });
    return;
  }

  // Default: respond after 1 second
  console.log(`[${new Date().toISOString()}] Request received on ${req.url}`);
  setTimeout(() => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`Hello from pod! Served at ${new Date().toISOString()}\n`);
  }, 1000);
});

function gracefulShutdown(signal) {
  console.log(`[${new Date().toISOString()}] Received ${signal} after preStop (${PRE_STOP_DELAY_SECONDS}s), starting graceful shutdown...`);
  shuttingDown = true;

  server.close(() => {
    console.log(`[${new Date().toISOString()}] HTTP server closed. No more in-flight requests.`);
    console.log(`Active operations (DATA LOSS ON WRITES): ${operationCount}`);
    process.exit(0);
  });

  // TOUR: Force exit if graceful shutdown takes too long. This must be less than
  // terminationGracePeriodSeconds minus preStop delay.
  setTimeout(() => {
    console.log(`[${new Date().toISOString()}] Forceful shutdown - timeout reached`);
    console.log(`Active operations (DATA LOSS ON WRITES): ${operationCount}`);
    process.exit(1);
  }, MAX_SHUTDOWN_TIME_SECONDS * 1000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server listening on port ${PORT}`);
});
