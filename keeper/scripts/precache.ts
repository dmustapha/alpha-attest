/**
 * precache.ts — Commit 3 demo signals on-chain for demo/stress-test readiness.
 *
 * Signals committed:
 *   1. TSLA +2.5%  ($215.00 → $220.38)  — expect BULLISH
 *   2. AMZN -1.8%  ($188.39 → $185.00)  — expect BEARISH
 *   3. TSLA +0.4%  ($219.00 → $219.88)  — expect NEUTRAL
 *
 * Usage:
 *   cd keeper && npm run precache
 */

import "dotenv/config";
import { appendFileSync } from "fs";
import { join } from "path";
import { AnthropicClient } from "../src/clients/anthropic.js";
import { PinataClient } from "../src/clients/pinata.js";
import { ChainClient } from "../src/clients/chain.js";
import { EIP712Signer, type SignalPayload } from "../src/signer/eip712.js";

// ── Config from .env ──────────────────────────────────────────────────────────
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY!;
const PINATA_JWT     = process.env.PINATA_JWT!;
const KEEPER_PK      = process.env.KEEPER_PRIVATE_KEY as `0x${string}`;
const REGISTRY_ADDR  = (process.env.SIGNAL_REGISTRY_ADDRESS ?? "0x09522dB7a983a675ba4E19BC9bc0896110b80C6A") as `0x${string}`;

for (const [k, v] of Object.entries({ ANTHROPIC_KEY, PINATA_JWT, KEEPER_PK, REGISTRY_ADDR })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1); }
}

// ── Demo signals to commit ────────────────────────────────────────────────────
const SIGNALS = [
  { ticker: "TSLA", basePrice: 215.00, changePct: +2.5  },  // BULLISH
  { ticker: "AMZN", basePrice: 188.39, changePct: -1.8  },  // BEARISH
  { ticker: "TSLA", basePrice: 219.00, changePct: +0.4  },  // NEUTRAL
];

interface CommittedSignal {
  signalId: string;
  ticker: string;
  direction: string;
  cid: string;
  txHash: string;
  priceFixed: string;
}

async function commitOne(
  anthropic: AnthropicClient,
  pinata: PinataClient,
  chain: ChainClient,
  signer: EIP712Signer,
  ticker: string,
  basePrice: number,
  changePct: number,
  index: number
): Promise<CommittedSignal> {
  const price = basePrice * (1 + changePct / 100);
  const timestamp = Date.now() - (SIGNALS.length - index) * 60_000; // stagger by 1 min

  console.log(`\n[${index + 1}/${SIGNALS.length}] ${ticker} ${changePct > 0 ? "+" : ""}${changePct}% → $${price.toFixed(2)}`);

  // Step 1: Claude analysis
  console.log(`  Generating analysis...`);
  const analysis = await anthropic.generateAnalysis(ticker, price, changePct, timestamp);
  console.log(`  ✓ ${analysis.wordCount} words | direction: ${analysis.direction}`);

  // Step 2: Build IPFS document
  const ipfsDoc = {
    version: "1.0",
    ticker,
    price,
    priceChangePct: changePct,
    timestamp,
    timestampISO: new Date(timestamp).toISOString(),
    direction: analysis.direction,
    analysis: analysis.analysis,
    wordCount: analysis.wordCount,
    dimensions: analysis.dimensions,
    generatedAt: new Date().toISOString(),
    demo: true,
  };

  // Step 3: Pin to IPFS
  console.log(`  Pinning to IPFS...`);
  const ipfsResult = await pinata.upload(ipfsDoc, `${ticker}-precache-${index}-${timestamp}.json`);
  console.log(`  ✓ CID: ${ipfsResult.cid}`);

  // Step 4: Get sequence number
  const lastSeq = await chain.getLastSequenceNumber();
  const seqNum  = lastSeq + 1n;
  console.log(`  Sequence #${seqNum}`);

  // Step 5: Convert to fixed-point
  const priceFixed    = BigInt(Math.round(price * 1e8));
  const timestampSecs = BigInt(Math.floor(timestamp / 1000));
  const directionNum  = analysis.direction === "BULLISH" ? 0 : analysis.direction === "BEARISH" ? 1 : 2;

  const payload: SignalPayload = {
    ticker,
    price: priceFixed,
    timestamp: timestampSecs,
    ipfsHash: ipfsResult.ipfsHash,
    direction: directionNum,
    sequenceNumber: seqNum,
  };

  // Step 6: EIP-712 sign + on-chain commit
  console.log(`  EIP-712 signing + committing...`);
  const signature = await signer.sign(payload);
  const txHash = await chain.commitSignal(
    ticker,
    priceFixed,
    timestampSecs,
    ipfsResult.ipfsHash,
    directionNum,
    seqNum,
    signature
  );

  console.log(`  ✓ TX: ${txHash}`);
  console.log(`  ✓ Signal ID: #${seqNum}`);

  return {
    signalId: seqNum.toString(),
    ticker,
    direction: analysis.direction,
    cid: ipfsResult.cid,
    txHash,
    priceFixed: priceFixed.toString(),
  };
}

async function main() {
  console.log(`\n━━ AlphaAttest Pre-cache ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Committing ${SIGNALS.length} demo signals on Robinhood Chain Testnet\n`);

  const anthropic = new AnthropicClient(ANTHROPIC_KEY);
  const pinata    = new PinataClient(PINATA_JWT);
  const chain     = new ChainClient(KEEPER_PK, REGISTRY_ADDR);
  const signer    = new EIP712Signer(KEEPER_PK, REGISTRY_ADDR);

  const results: CommittedSignal[] = [];

  for (let i = 0; i < SIGNALS.length; i++) {
    const { ticker, basePrice, changePct } = SIGNALS[i];
    const result = await commitOne(anthropic, pinata, chain, signer, ticker, basePrice, changePct, i);
    results.push(result);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n━━ Pre-cache Complete ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  for (const r of results) {
    console.log(`Signal #${r.signalId}: ${r.ticker} ${r.direction} | TX: ${r.txHash} | CID: ${r.cid}`);
  }

  // Append to proof.md
  const proofPath = join(process.cwd(), "../submission/proof.md");
  const entry = `\n## Pre-cache Signals (${new Date().toISOString()})\n\n` +
    results.map(r =>
      `- Signal #${r.signalId}: ${r.ticker} ${r.direction} | TX: \`${r.txHash}\` | CID: \`${r.cid}\``
    ).join("\n") + "\n";

  try {
    appendFileSync(proofPath, entry, "utf8");
    console.log(`\nAppended to submission/proof.md`);
  } catch {
    console.log(`\n(proof.md not found — printing entry for manual copy)`);
    console.log(entry);
  }

  const ids = results.map(r => r.signalId).join(",");
  console.log(`\nSample signal IDs for frontend: ${ids}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
