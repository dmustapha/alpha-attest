import { config } from "dotenv";
config();

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
