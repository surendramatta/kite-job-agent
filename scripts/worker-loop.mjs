const baseUrl = (process.env.KITE_INTERNAL_URL || "http://web:3000").replace(/\/$/, "");
const secret = process.env.KITE_WORKER_SECRET;
const intervalMs = Math.max(15_000, Number(process.env.KITE_WORKER_INTERVAL_MS || 60_000));

if (!secret) {
  console.error("KITE_WORKER_SECRET is required");
  process.exit(1);
}

let stopping = false;
let busy = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  if (busy || stopping) return;
  busy = true;
  try {
    const response = await fetch(`${baseUrl}/api/internal/worker/tick`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(5 * 60_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`${response.status}: ${body}`);
    console.log(`[${new Date().toISOString()}] worker tick complete`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] worker tick failed`, error);
  } finally {
    busy = false;
  }
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

while (!stopping) {
  await run();
  await sleep(intervalMs);
}
