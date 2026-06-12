import { config } from "dotenv";
config();

import { createServer } from "http";
import { SignalOrchestrator } from "./orchestrator.js";

const REQUIRED_ENV = [
  "FINNHUB_API_KEY",
  "ANTHROPIC_API_KEY",
  "PINATA_JWT",
  "KEEPER_PRIVATE_KEY",
  "ALCHEMY_API_KEY",
  "SIGNAL_REGISTRY_ADDRESS",
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[Keeper] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const orchestrator = new SignalOrchestrator({
  finnhubKey: process.env.FINNHUB_API_KEY!,
  anthropicKey: process.env.ANTHROPIC_API_KEY!,
  pinataJwt: process.env.PINATA_JWT!,
  keeperPrivateKey: process.env.KEEPER_PRIVATE_KEY as `0x${string}`,
  registryAddress: process.env.SIGNAL_REGISTRY_ADDRESS as `0x${string}`,
});

// Graceful shutdown: every Railway redeploy sends SIGTERM. Pending resolutions
// are recovered by the startup scan, so a clean exit loses nothing.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`[Keeper] ${signal} — draining`);
    orchestrator.stop();
    process.exit(0);
  });
}

orchestrator.start().catch((err) => {
  console.error("[Keeper] Fatal startup error:", err);
  process.exit(1);
});

// Health endpoint. The keeper runs as a free Render web service, which spins
// down after 15 minutes without inbound traffic, so it keeps itself awake by
// pinging its own public URL — requests through the edge count as traffic.
const port = Number(process.env.PORT ?? 8080);
createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, uptimeSeconds: Math.floor(process.uptime()) }));
}).listen(port, () => console.log(`[Health] listening on :${port}`));

const externalUrl = process.env.RENDER_EXTERNAL_URL;
if (externalUrl) {
  setInterval(() => {
    fetch(`${externalUrl}/healthz`, { signal: AbortSignal.timeout(10_000) })
      .catch((err) => console.warn("[Health] self-ping failed:", String(err).slice(0, 80)));
  }, 5 * 60_000);
  console.log(`[Health] self-ping armed against ${externalUrl} every 5 min`);
}
