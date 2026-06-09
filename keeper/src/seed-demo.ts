/**
 * seed-demo.ts — Simulate a 2% TSLA price spike and run the full AlphaAttest pipeline:
 *   Claude analysis → IPFS pin → EIP-712 sign → on-chain commitSignal
 *
 * Usage:
 *   npx tsx src/seed-demo.ts
 */

import "dotenv/config";
import { AnthropicClient } from "./clients/anthropic.js";
import { PinataClient } from "./clients/pinata.js";
import { ChainClient } from "./clients/chain.js";
import { EIP712Signer, type SignalPayload } from "./signer/eip712.js";

// ── Synthetic market event ───────────────────────────────────────────────────
const SYMBOL = "TSLA";
const BASE_PRICE = 185.40;
const CHANGE_PCT = 2.15;                          // +2.15% spike
const PRICE = BASE_PRICE * (1 + CHANGE_PCT / 100); // ~$189.38
const TIMESTAMP = Date.now();

// ── Config from .env ─────────────────────────────────────────────────────────
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;
const PINATA_JWT    = process.env.PINATA_JWT!;
const KEEPER_PK     = process.env.KEEPER_PRIVATE_KEY as `0x${string}`;
const REGISTRY_ADDR = (process.env.SIGNAL_REGISTRY_ADDRESS ?? "0x09522dB7a983a675ba4E19BC9bc0896110b80C6A") as `0x${string}`;

for (const [k, v] of Object.entries({ ANTHROPIC_KEY, PINATA_JWT, KEEPER_PK, REGISTRY_ADDR })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1); }
}

async function main() {
  console.log(`\n━━ AlphaAttest Seed Demo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Synthetic event: ${SYMBOL} +${CHANGE_PCT}% → $${PRICE.toFixed(2)}`);
  console.log(`Timestamp: ${new Date(TIMESTAMP).toISOString()}\n`);

  const anthropic = new AnthropicClient(ANTHROPIC_KEY);
  const pinata    = new PinataClient(PINATA_JWT);
  const chain     = new ChainClient(KEEPER_PK, REGISTRY_ADDR);
  const signer    = new EIP712Signer(KEEPER_PK, REGISTRY_ADDR);

  // ── Step 1: Claude haiku analysis ────────────────────────────────────────
  console.log(`[1/4] Generating Claude analysis...`);
  const analysis = await anthropic.generateAnalysis(SYMBOL, PRICE, CHANGE_PCT, TIMESTAMP);
  console.log(`      ✓ ${analysis.wordCount} words | direction: ${analysis.direction}`);

  // ── Step 2: Build IPFS document ──────────────────────────────────────────
  const ipfsDoc = {
    version: "1.0",
    ticker: SYMBOL,
    price: PRICE,
    priceChangePct: CHANGE_PCT,
    timestamp: TIMESTAMP,
    timestampISO: new Date(TIMESTAMP).toISOString(),
    direction: analysis.direction,
    analysis: analysis.analysis,
    wordCount: analysis.wordCount,
    dimensions: analysis.dimensions,
    generatedAt: new Date().toISOString(),
    demo: true,
  };

  // ── Step 3: Pin to IPFS via Pinata ───────────────────────────────────────
  console.log(`[2/4] Pinning to IPFS...`);
  const ipfsResult = await pinata.upload(ipfsDoc, `${SYMBOL}-seed-${TIMESTAMP}.json`);
  console.log(`      ✓ CID: ${ipfsResult.cid}`);
  console.log(`      ✓ bytes32: ${ipfsResult.ipfsHash}`);

  // ── Step 4: EIP-712 sign + commitSignal on-chain ─────────────────────────
  console.log(`[3/4] Fetching sequence number from chain...`);
  const lastSeq = await chain.getLastSequenceNumber();
  const seqNum  = lastSeq + 1n;
  console.log(`      ✓ sequence #${seqNum}`);

  const priceFixed  = BigInt(Math.round(PRICE * 1e8));
  const timestampSecs = BigInt(Math.floor(TIMESTAMP / 1000));
  const directionNum  = analysis.direction === "BULLISH" ? 0 : analysis.direction === "BEARISH" ? 1 : 2;

  const payload: SignalPayload = {
    ticker: SYMBOL,
    price: priceFixed,
    timestamp: timestampSecs,
    ipfsHash: ipfsResult.ipfsHash,
    direction: directionNum,
    sequenceNumber: seqNum,
  };

  console.log(`[4/4] EIP-712 signing + on-chain commit...`);
  const signature = await signer.sign(payload);
  const txHash = await chain.commitSignal(
    SYMBOL,
    priceFixed,
    timestampSecs,
    ipfsResult.ipfsHash,
    directionNum,
    seqNum,
    signature
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n━━ Pipeline Complete ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Signal ID:   #${seqNum}`);
  console.log(`Tx hash:     ${txHash}`);
  console.log(`IPFS CID:    ${ipfsResult.cid}`);
  console.log(`Direction:   ${analysis.direction}`);
  console.log(`Explorer:    https://explorer.testnet.chain.robinhood.com/tx/${txHash}`);
  console.log(`Verify UI:   http://localhost:3001/verify/${seqNum}`);
  console.log(`\nAdd to frontend .env.local:`);
  console.log(`NEXT_PUBLIC_SAMPLE_SIGNAL_IDS=${seqNum}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
