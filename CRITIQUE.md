# AlphaAttest — Full Critique
**Scope:** Planned vs. implemented (ARCHITECTURE.md + README + sponsor tracks) AND functional capability audit (does it actually do what it claims, end-to-end, no mock/demo shortcuts)
**Date:** 2026-06-10

---

## Summary Verdict

The contracts are correct and well-designed. The frontend UI is complete and polished. But three of the four core integration claims — IPFS permanence, real-time signals, and Storacha fallback — are broken or missing at the infrastructure layer. The system produces verifiable on-chain signals only through a pre-seeded demo. A live autonomous keeper has never run in production.

---

## Part 1: Planned vs. Implemented

### What is fully implemented

**Contracts — all 3 deployed, all 7 features live**
- `SignalRegistry`: 4 invariants (ticker allowlist, 5-min expiry, keeper identity, sequence gap), EIP-712 on-chain verification, accuracy ledger, ISignalConsumer callbacks — deployed at `0x09522dB7a983a675ba4E19BC9bc0896110b80C6A`
- `SubscriptionManager`: USDG-gated subscribe/cancel — deployed at `0x566BEAa729E8E1e6cde30446546279BD30e5630d`
- `MockConsumer`: TSLA ERC-20 read on every signal, registered as ISignalConsumer — deployed at `0x6114270e211C2cd5542D9972caF6F0D51FbA7105`
- Post-deploy orchestration: `registerConsumer()` and `setSubscriptionManager()` both confirmed on-chain with TX hashes
- Foundry test suite: 10 tests covering all invariants, accuracy ledger, consumer callback, AMZN ticker

**Keeper — all 8 modules present**
- `FinnhubClient`: WebSocket with exponential backoff reconnect (1s → 30s max)
- `AnthropicClient`: claude-haiku-4-5, 6-dimension structured output, 400+ word minimum
- `EIP712Signer`: domain separator matches contract constructor exactly
- `SignalOrchestrator`: concurrent-signal guard per ticker, full pipeline coordination
- `seed-demo.ts` and `precache.ts` scripts run — 5 IPFS cache files in `frontend/public/ipfs-cache/`

**Frontend — all 5 pages/routes**
- Dashboard: signal feed, stats strip, SSE primary + 30s polling fallback
- `/verify/[signalId]`: on-chain `ipfsHash` → CID derivation → IPFS fetch → display (cryptographically sound via content addressing)
- `/proof`: 7-step verification walkthrough + live contract addresses
- `/api/notify`: HMAC-verified Alchemy webhook + SSE stream
- Onboarding block, wrong-network banner, empty/loading/error states, SampleSignals judge preview

**Added beyond architecture**
- Logo system: V1 Shield Pulse (shield + EKG) in Nav, `public/logo.svg` with 3 SVG variants
- Favicon stack: `favicon-32.png`, `apple-touch-icon.png`, SVG fallback
- OG/Twitter card metadata with 1200×630 `og-image.png`
- Analysis 160-char preview in SignalCard for subscribers
- USDG decimals fetched dynamically at subscribe time (avoids hardcoded decimal assumption)
- Bugs fixed: wagmi fallback RPC (`MISSING_KEY` → public RPC), 3 Vercel contract address env vars with trailing `\n` (viem synchronous validation was throwing before any network request)

---

### Gap 1 — Orphaned components: `SubscribeButton.tsx` and `AnalysisViewer.tsx`

**Severity: Medium**

Both files exist and are fully implemented, but zero grep hits for either as an import anywhere in the frontend source tree. Their functionality was re-implemented inline — subscribe logic in `page.tsx`, analysis display in `SignalCard.tsx` and the verify page.

`SubscribeButton.tsx` is actually more complete than the inline version: it includes a cancel subscription path with a "Cancel" button and subscribed-state badge. The inline version in `page.tsx` only shows subscribe, not cancel.

`AnalysisViewer.tsx` is a proper expandable panel component with "View Analysis / Hide Analysis" toggle and full 6-dimension display. SignalCard uses a 160-char truncated preview instead.

These components represent better UX than what's deployed. They should either be wired in or deleted.

---

### Gap 2 — No `resolveSignal()` UI or script

**Severity: Medium**

`resolveSignal(signalId, actualPrice)` is defined in the contract, ABI-exposed in `contracts.ts`, and referenced in the data flow spec. But there is no frontend button, admin page, or keeper-side auto-resolution script. Every signal on-chain is permanently `PENDING`. The accuracy stat strip will always show `0/0 resolved`.

This matters for the core narrative: "Hold AI to account." Without resolution, there's no account. The EKG pulse logo, the hero copy, the PRD promise — all assume the accuracy ledger fills over time. It never will without this piece.

---

### Gap 3 — Playwright temp files in `public/`

**Severity: Low-Medium**

Nine zero-byte temp files from Playwright's atomic write process are deployed to Vercel and publicly accessible:
```
.!4209!apple-touch-icon.png
.!4210!apple-touch-icon.png
.!4211!apple-touch-icon.png
.!4212!favicon-32.png  (×3)
.!4227!og-image.png    (×3)
```
They don't break anything, but they expose implementation artifacts and will show up in any directory listing or crawler.

---

### Gap 4 — Seed signal is NEUTRAL direction

**Severity: Low-Medium**

Signal #1 has `direction: NEUTRAL`. The `resolveSignal()` logic for NEUTRAL requires price to stay within 0.5% — the hardest and least interesting outcome for a demo. A BULLISH or BEARISH seed would demonstrate the directional call narrative more compellingly and be straightforward to resolve as CORRECT.

---

### Gap 5 — `SubscriptionManager.sol` deployed with UNVERIFIED warning

**Severity: Low (testnet only)**

The deployed contract was tagged `WARNING: UNVERIFIED — verify USDG decimal places before deploy`. It uses `SUBSCRIPTION_FEE = 10 * 1e6` (6 decimals). If USDG uses 18 decimals, the fee is 0.00000001 USDG instead of 10. The subscribe flow fetches decimals dynamically from the ERC-20 before calling approve — this is done correctly in `useSubscription.ts`. But the SubscriptionManager itself hardcodes the fee at 6 decimals in the contract, so if USDG is 18-decimal, the contract stores `10e6` as revenue while the user approved `10e18`. The `transferFrom` would succeed at the wrong amount.

---

### Gap 6 — Demo video missing

**Severity: High for submission**

`submission/video/links.md` exists but contains a single empty line. A hackathon submission without a demo video is at a significant disadvantage across all judging tracks.

---

## Part 2: Functional Capability Audit

This section asks: does each core system function as advertised, end-to-end, without demo shortcuts?

---

### Critical Finding 1 — Pinata upload is not actually uploading to Pinata

**Severity: CRITICAL — breaks core system claim**

**What the code does** (`keeper/src/clients/pinata.ts`):
```typescript
async upload(content: object, filename: string): Promise<IPFSResult> {
  const json = JSON.stringify(content, null, 2);
  const buf = Buffer.from(json, "utf8");
  const cid = computeCIDv0(buf);          // SHA-256 computed locally
  const ipfsHash = cidToBytes32(cid);     // bytes32 for on-chain
  writeFileSync(join(this.cacheDir, `${cid}.json`), json, "utf8");  // cached locally
  console.log(`[IPFS] Computed CIDv0 locally (Pinata plan limit hit — content cached)`);
  return { cid, ipfsHash, url: `https://ipfs.io/ipfs/${cid}`, provider: "pinata" };
}
```

There is no Pinata API call. The `PINATA_JWT` env var is accepted but never used in the upload path. The method computes the CID deterministically (correct mathematics), writes the JSON to a local `.ipfs-cache/` directory on the keeper machine, and returns the CID as if an upload happened.

**What this means in production:**
- The `ipfsHash` stored on-chain is mathematically valid (SHA-256 of the actual content)
- The content is NOT on Pinata, NOT on any public IPFS gateway
- It exists only on the keeper's local disk
- The `url` field (`https://ipfs.io/ipfs/${cid}`) will return 404 for any user
- If the keeper machine is restarted, wiped, or moved, those analysis documents are gone permanently

**Why the live demo works anyway:**
The `fetchAnalysis()` function in `lib/ipfs.ts` tries local cache first:
```typescript
const local = await fetch(`/ipfs-cache/${cid}.json`);
if (local.ok) return local.json();
```
The 5 seed signal documents were manually copied into `frontend/public/ipfs-cache/` before deployment. This is the ONLY reason the verify page and SampleSignals work. The system is running on a static file server, not IPFS.

**The PRD claim that is broken:** "The analysis is uploaded to IPFS — a permanent, distributed storage network where every document's address is derived from its exact content." Neither permanent nor distributed applies.

The CID math is correct. The on-chain binding is valid. The verification logic is sound. But the storage layer — the foundational premise — is not working.

---

### Critical Finding 2 — SSE real-time updates are broken on Vercel

**Severity: High — claimed feature doesn't work in production**

**What the code does** (`frontend/src/app/api/notify/route.ts`):
```typescript
const subscribers = new Set<ReadableStreamDefaultController>();
// GET: adds controller to subscribers
// POST (Alchemy webhook): iterates subscribers, enqueues message
```

This works correctly in a single-process server (like local `next dev`). On Vercel, every HTTP request is handled by an isolated serverless function instance. The `subscribers` Set is in-memory per instance:

- User's browser opens `GET /api/notify` → instance A, adds controller to A's Set
- Alchemy fires `POST /api/notify` → routes to instance B, iterates B's empty Set
- No message is sent to the browser

The code even acknowledges this: `"fine for single-instance — use Redis pub/sub for multi-instance"`. Vercel is always multi-instance.

**What actually happens:** `es.onerror` fires on the client within seconds (Vercel's serverless functions have a maximum execution duration, and a never-sending SSE stream times out). The `onerror` handler starts 30-second polling as fallback. Users get updates every 30 seconds, not in real time. This is functional but not what's claimed.

**The integration that's broken:** Alchemy Notify is correctly configured and fires the webhook. The HMAC verification works. But the signal propagation from webhook → browser never completes in production.

---

### Critical Finding 3 — Storacha fallback is non-functional

**Severity: Medium — fallback that can't fall back**

**What the code does** (`keeper/src/clients/storacha.ts`):
```typescript
export class StorachaClient {
  async upload(content: object, filename: string): Promise<IPFSResult> {
    const { create } = await import("@storacha/client");
    const { StoreMemory } = await import("@storacha/client/stores/memory");
    const client = await create({ store: new StoreMemory() });
    // ...
  }
}
```

Two problems:
1. `StoreMemory` is explicitly not persistent: the file itself says "Note: StoreMemory does NOT persist between process restarts." There is no account/space configured, no proof delegation, no DID. The `client.uploadFile()` call would fail with an auth error on first use.
2. The fallback is also tagged `WARNING: UNVERIFIED PATTERN — test immediately before relying on this fallback`.

Since Pinata never actually attempts a network call (it exits early with the local cache path), Storacha is never reached. But if the Pinata upload path were fixed to actually call the API and that API failed, Storacha would also fail. The fallback chain has two non-functional entries.

---

### Critical Finding 4 — Keeper has no persistent deployment

**Severity: High — the autonomous agent doesn't run**

The keeper is a long-lived Node.js process with a persistent WebSocket connection to Finnhub and an `EventEmitter` loop. There is no:
- Dockerfile or containerization
- Railway / Fly.io / Render deploy configuration
- PM2 process manager config
- Systemd service
- Any cloud function or cron wrapper

The only production signal (`#1, TSLA, NEUTRAL`) was injected via `scripts/seed-demo.ts` — a one-shot script that signs and commits a signal manually. The autonomous keeper pipeline (Finnhub detects 1% move → Claude generates analysis → IPFS → chain commit) has never produced a signal in production.

This is the most significant gap between the demonstrated system and the claimed architecture. The PRD says "A keeper watches TSLA and AMZN prices via Finnhub WebSocket" in present tense. It does not.

---

### Functional Finding 5 — SampleSignals shows 1 of 3 claimed samples

**Severity: Medium — misleading UI**

`SampleSignals` component uses `NEXT_PUBLIC_SAMPLE_SIGNAL_IDS ?? "1,2,3"` (env var set to `1,2,3,4` in `.env.local.example`, sliced to 3). It attempts to load signal IDs 1, 2, and 3 from the chain. Only signal #1 exists. IDs 2 and 3 return empty structs or `SignalNotFound` — both caught and returned as null, filtered out.

The section header says "Sample Signals — No Wallet Required" with no count. With only 1 signal loaded, it renders a single card with the NEUTRAL seed signal. The UI is described as "3 signals, judge preview" in the architecture. Judges see 1.

---

### Functional Finding 6 — Subscription flow requires USDG the user doesn't have

**Severity: Medium — flow is complete but unexercisable**

The subscribe flow is correctly implemented: `decimals()` read → `approve(fee)` → `subscribe()` → `waitForTransactionReceipt`. The UX is clean.

But to actually subscribe, a user needs USDG (`0x7E955252...`) on Robinhood Chain Testnet. There is:
- No link to a USDG faucet anywhere in the UI
- No USDG faucet mentioned in README setup instructions
- No explanation of how to acquire USDG on testnet

The UI says "Subscribe · 10 USDG / month" with no path to get USDG. If a judge tries to subscribe, they'll connect their wallet, see 0 USDG, and hit a "PaymentFailed" revert. The onboarding block does not address this.

---

### Functional Finding 7 — Verify page shows "Verified" for all fetched signals regardless of actual hash match

**Severity: Low — works correctly via IPFS semantics, but misleading UX**

The verify page derives a CID from `ipfsHash` via `bytes32ToCid()`, fetches the document at that CID, and if the fetch succeeds shows "Verified — This analysis is unchanged." It does not explicitly hash the fetched content and compare the result to `ipfsHash`.

This is technically correct: IPFS is content-addressed, so if a document is returned at a given CID, it by definition hashes to that CID. The verification is implicit in the fetch succeeding.

However, the current implementation only works because it's fetching from the local cache (`/ipfs-cache/${cid}.json`), not from a distributed IPFS node. Since the local cache was manually seeded, the "verification" is actually "we fetched the file we put there ourselves". If the CID on-chain ever pointed to a different document (theoretically impossible with content addressing, but), the local cache serves the original file anyway.

The verification mechanism is sound in concept. In practice it's a file-serving check against a static asset, not a distributed cryptographic verification.

---

## Part 3: Priority Matrix

| # | Finding | Category | Impact |
|---|---------|----------|--------|
| 1 | Pinata not uploading — content lives only on keeper local disk | Critical | Core premise broken |
| 2 | Keeper has no persistent deployment — no live signals ever generated | Critical | Core premise broken |
| 3 | SSE broken on Vercel — 30s polling only in production | High | Claimed feature absent |
| 4 | Storacha fallback non-functional — no auth, ephemeral store | High | Fallback can't fall back |
| 5 | Demo video missing | High | Submission completeness |
| 6 | resolveSignal() has no UI — accuracy ledger permanently empty | Medium | Core narrative broken |
| 7 | SampleSignals loads 1 of 3 signals — IDs 2 and 3 don't exist | Medium | Misleading judge preview |
| 8 | No USDG faucet link — subscribe flow unreachable in practice | Medium | Demo flow broken |
| 9 | SubscribeButton.tsx + AnalysisViewer.tsx — dead code with better UX than deployed | Medium | Wasted implementation |
| 10 | Playwright temp files in public/ | Low-Medium | Deployment noise |
| 11 | SubscriptionManager fee decimal UNVERIFIED | Low | Testnet only |
| 12 | Seed signal NEUTRAL — hardest to demo | Low | Demo impact |

---

## Part 4: What Would Make This Fully Functional

These are the exact changes needed to go from "demo that works with pre-seeded data" to "system that actually does what it claims":

**Fix 1 — Restore Pinata upload**
The `upload()` method needs the actual Pinata pinning API call:
```
POST https://api.pinata.cloud/pinning/pinJSONToIPFS
Authorization: Bearer {PINATA_JWT}
```
The CID computation and bytes32 conversion logic is correct and should stay. Just add the HTTP call before the local cache write. The local cache write can remain as a performance optimization.

**Fix 2 — Deploy the keeper**
The keeper needs a persistent runtime. Any of: Railway, Fly.io, Render, or a simple VPS with PM2. Without this, the Finnhub → Claude → IPFS → chain pipeline never runs autonomously and the project is a demo shell.

**Fix 3 — Replace in-memory SSE with a persistent channel**
For Vercel: use Vercel KV (Redis-compatible) pub/sub or simply rely on the 30s polling which works correctly. The SSE code can remain for non-serverless environments. The real-time claim should be removed from the PRD if Vercel is the deployment target.

**Fix 4 — Wire resolveSignal() to a keeper-side script**
After `RESOLVE_DELAY_BLOCKS` (50 blocks ≈ 12.5 minutes on Robinhood Chain), the keeper can auto-fetch the current price from Finnhub and call `resolveSignal(id, currentPrice)`. This closes the accuracy ledger loop without requiring any UI change.

**Fix 5 — Seed 3 signals before demo**
Run `seed-demo.ts` twice more with BULLISH and BEARISH directions (TSLA and AMZN). Update `NEXT_PUBLIC_SAMPLE_SIGNAL_IDS` to those 3 IDs. Precache all 3 IPFS documents into `frontend/public/ipfs-cache/`. This is 30 minutes of work and makes the judge preview show 3 real directional signals.

---

## Part 5: What Is Genuinely Strong

Despite the gaps, several pieces are architecturally correct and non-trivial:

- **The EIP-712 implementation is correct.** The domain separator in `EIP712Signer` matches the contract constructor exactly. The SIGNAL_TYPEHASH ordering in both the keeper and Solidity matches. This is a common source of bugs and it was done right.

- **The CID ↔ bytes32 math is correct.** `computeCIDv0()` in the keeper and `bytes32ToCid()` in the frontend are mirror implementations of the same SHA-256 multihash encoding. The round-trip is verified by the fact that `/verify/1` correctly derives the CID from the stored hash and fetches the right document.

- **The subscription fee decimal handling is correct at the frontend layer.** `useSubscription.ts` fetches USDG decimals at runtime before computing the approval amount — the right way to handle ERC-20 tokens with unknown precision.

- **The 4 invariants are well-designed.** The 5-minute proof expiry window prevents replay attacks. The sequence gap detection prevents signal omission. The keeper identity binding prevents unauthorized commits. The ticker allowlist prevents scope creep. All four are enforced with custom errors and tested in the Foundry suite.

- **The MockConsumer TSLA read is genuine.** On every `commitSignal()`, MockConsumer calls `IERC20(TSLA_TOKEN).balanceOf(address(this))` on the live Robinhood Chain equity token. This is a real cross-contract call to a real tokenized equity address, not a mock. The `tslaBalance` value is stored per signal in `ReceivedSignal.tslaBalance` and emitted in the event.
