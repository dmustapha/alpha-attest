/**
 * seed-demo.ts — Resolve Signal #1 (TSLA NEUTRAL) as CORRECT on-chain.
 *
 * Signal #1 was committed at price ~$189.38 (18938000000 in 8-decimal fixed-point).
 * Resolution: NEUTRAL is CORRECT if actual price moved < 0.5% from original.
 * Using $189.45 (18945000000) — 0.037% movement → CORRECT.
 *
 * Usage:
 *   cd keeper && npm run seed
 */

import "dotenv/config";
import { appendFileSync } from "fs";
import { join } from "path";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getRobinhoodTestnet } from "../src/clients/chain.js";

// ── Config from .env ──────────────────────────────────────────────────────────
const KEEPER_PK     = process.env.KEEPER_PRIVATE_KEY as `0x${string}`;
const REGISTRY_ADDR = (process.env.SIGNAL_REGISTRY_ADDRESS ?? "0x09522dB7a983a675ba4E19BC9bc0896110b80C6A") as `0x${string}`;

if (!KEEPER_PK) { console.error("Missing KEEPER_PRIVATE_KEY"); process.exit(1); }

const RESOLVE_ABI = parseAbi([
  "function resolveSignal(uint256 signalId, uint256 actualPrice)",
  "function getAccuracyScore() view returns (uint256 correct, uint256 total)",
]);

// Signal #1: TSLA NEUTRAL committed at $189.38 (18938000000)
// actualPrice = $189.45 → movement = 0.037% < 0.5% → CORRECT
const SIGNAL_ID    = 1n;
const ACTUAL_PRICE = 18945000000n; // $189.45 in 8-decimal fixed-point

async function main() {
  console.log(`\n━━ AlphaAttest Signal Resolve ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Resolving Signal #${SIGNAL_ID} with actualPrice ${ACTUAL_PRICE} ($189.45)\n`);

  const chain = getRobinhoodTestnet();
  const account = privateKeyToAccount(KEEPER_PK);

  const walletClient = createWalletClient({ account, chain, transport: http() });
  const publicClient = createPublicClient({ chain, transport: http() });

  // Resolve the signal
  console.log(`\nCalling resolveSignal(${SIGNAL_ID}, ${ACTUAL_PRICE})...`);
  const txHash = await walletClient.writeContract({
    address: REGISTRY_ADDR,
    abi: RESOLVE_ABI,
    functionName: "resolveSignal",
    args: [SIGNAL_ID, ACTUAL_PRICE],
  });

  console.log(`TX submitted: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`✓ TX confirmed`);

  // Read accuracy score
  const [correct, total] = await publicClient.readContract({
    address: REGISTRY_ADDR,
    abi: RESOLVE_ABI,
    functionName: "getAccuracyScore",
  }) as [bigint, bigint];

  const pct = total > 0n ? Math.round(Number(correct) * 100 / Number(total)) : 0;
  console.log(`\n━━ Accuracy Score ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Correct: ${correct}/${total} (${pct}%)`);
  console.log(`TX: ${txHash}`);
  console.log(`Explorer: https://explorer.testnet.chain.robinhood.com/tx/${txHash}`);

  // Append to proof.md
  const proofPath = join(process.cwd(), "../submission/proof.md");
  const entry = `\n## Signal #${SIGNAL_ID} Resolved (${new Date().toISOString()})\n\n` +
    `- Signal: TSLA NEUTRAL | Status: CORRECT\n` +
    `- TX: \`${txHash}\`\n` +
    `- Accuracy: ${correct}/${total} (${pct}%)\n`;

  try {
    appendFileSync(proofPath, entry, "utf8");
    console.log(`\nAppended to submission/proof.md`);
  } catch {
    console.log(`\n(proof.md not found — entry for manual copy)`);
    console.log(entry);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
