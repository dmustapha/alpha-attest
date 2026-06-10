# AlphaAttest — Fix Plan

**Status:** Post-critique remediation blueprint
**Working dir:** `/Users/MAC/arbitrum-london/AlphaAttest`
**Scope:** Every broken or missing piece across keeper, frontend, deployment, and submission

---

## Priority Matrix

| Fix | Severity | Effort | Impact |
|-----|----------|--------|--------|
| F1: Real Pinata upload | CRITICAL | Medium | IPFS pipeline actually works |
| F2: Keeper deployment | CRITICAL | Medium | Keeper runs 24/7 in production |
| F3: SSE → watchContractEvent | HIGH | Low | Real-time updates work on Vercel |
| F4: Storacha — explicit error | MEDIUM | Trivial | No silent fallback confusion |
| F5: Auto-resolver in orchestrator | MEDIUM | Medium | Accuracy ledger populates automatically |
| F6: Re-seed 3 real signals | MEDIUM | Low (after F1) | Sample signals work end-to-end |
| F7: Wire SubscribeButton component | MEDIUM | Low | UI uses complete component, cancel works |
| F8: Delete Playwright temp files | LOW | Trivial | Clean public/ directory |
| F9: USDG acquisition path | MEDIUM | Trivial | Users can actually subscribe |
| F10: Demo video | MEDIUM | Medium | Submission complete |

---

## F1 — Restore Real Pinata Upload

**File:** `keeper/src/clients/pinata.ts`

**Root cause:** The `upload()` method computes a CID locally using raw SHA-256 of the JSON bytes. Real IPFS CIDv0 requires SHA-256 of the dag-pb/UnixFS-wrapped content, not raw bytes. The CID this function produces will never match what any IPFS gateway returns for the same content. Additionally, the Pinata API call is entirely absent — the JWT is accepted in the constructor but never used.

**What to delete:**
- The entire `computeCIDv0()` function (lines 14-33)
- The local CID computation on line 63: `const cid = computeCIDv0(buf);`
- The stale comment on line 69 about Pinata plan limits

**What to add:**

The `upload()` method must call `POST https://api.pinata.cloud/pinning/pinJSONToIPFS` with the content and the JWT. The CID to use as `ipfsHash` comes exclusively from Pinata's API response field `IpfsHash`. Do not compute a CID locally.

After a successful Pinata upload, write the JSON to the local `.ipfs-cache/{cid}.json` as a keeper-side cache (useful for the precache script copying files to `frontend/public/ipfs-cache/`).

If the Pinata call fails (non-2xx), throw — do not silently fall back to a locally-computed CID, because a locally-computed CID is not a valid IPFS address and will produce a broken verify page.

**New `upload()` method shape:**

```typescript
async upload(content: object, filename: string): Promise<IPFSResult> {
  const json = JSON.stringify(content, null, 2);

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.jwt}`,
    },
    body: JSON.stringify({
      pinataContent: content,
      pinataMetadata: { name: filename },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Pinata upload failed (${response.status}): ${err}`);
  }

  const data = (await response.json()) as { IpfsHash: string };
  const cid = data.IpfsHash;
  const ipfsHash = cidToBytes32(cid);

  // Local cache so precache.ts can copy to frontend/public/ipfs-cache/
  writeFileSync(join(this.cacheDir, `${cid}.json`), json, "utf8");
  console.log(`[IPFS] Pinned to IPFS via Pinata: ${cid}`);

  return {
    cid,
    ipfsHash,
    url: `https://gateway.pinata.cloud/ipfs/${cid}`,
    provider: "pinata",
  };
}
```

**Keep:** `cidToBytes32()` export (used by `storacha.ts` and tests). Keep the `cacheDir` setup in the constructor.

**Env var required:** `PINATA_JWT` — already declared in `keeper/src/index.ts` validation, already present in Vercel env. Verify it is set in Railway/Fly env as well (see F2).

---

## F2 — Keeper Deployment Config

**Root cause:** The keeper is a long-running Node.js process with an open WebSocket to Finnhub. It cannot run on Vercel. No Dockerfile, no platform config, and no running deployment exists. Every signal on-chain was committed manually via `precache.ts`.

### F2-A: Create `keeper/Dockerfile`

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig*.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
CMD ["node", "dist/index.js"]
```

**Note:** The keeper's `package.json` build script compiles `src/` to `dist/`. Verify `"build": "tsc"` and `"main": "dist/index.js"` are set.

### F2-B: Create `keeper/.dockerignore`

```
node_modules
dist
.ipfs-cache
.env
*.log
```

### F2-C: Create `keeper/railway.json`

Railway is the recommended deployment target — free tier, persistent containers, env var UI, one-click redeploy.

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "keeper/Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

Place this at the repo root (Railway expects it there when pointing to a monorepo sub-directory) OR configure Railway to use `keeper/` as the root directory via the Railway dashboard.

### F2-D: Required env vars on Railway

Set these in the Railway service environment panel:

| Variable | Source |
|----------|--------|
| `ANTHROPIC_API_KEY` | Anthropic console |
| `FINNHUB_API_KEY` | finnhub.io dashboard |
| `PINATA_JWT` | Pinata console → API Keys |
| `KEEPER_PRIVATE_KEY` | Same key used to deploy contracts |
| `SIGNAL_REGISTRY_ADDRESS` | From `contracts/deployments/` |
| `ALCHEMY_API_KEY` | Alchemy dashboard (Robinhood Chain app) |

### F2-E: Verify keeper build script in `keeper/package.json`

Ensure it has:
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "main": "dist/index.js"
}
```

---

## F3 — Fix Real-Time Updates (SSE → watchContractEvent)

**File:** `frontend/src/hooks/useSignals.ts`

**Root cause:** The `EventSource("/api/notify")` SSE approach relies on an in-memory `Set` in `/api/notify/route.ts`. On Vercel, the POST from Alchemy Notify and the GET from the browser hit different serverless function instances — the `subscribers` Set is always empty in the POST instance. The browser gets an immediate `onerror` and falls back to 30-second polling.

**Fix:** Replace the EventSource with viem's `watchContractEvent`. This subscribes directly to chain events via the Alchemy WebSocket endpoint already configured in `Providers.tsx`. No serverless isolation issue because the subscription lives in the browser, not on a server.

**In `useSignals.ts`, replace the `useEffect` body:**

Delete everything from `const es = new EventSource(...)` through `es.onerror = ...` and the cleanup.

Add after the initial `fetchAll()` call:

```typescript
// Watch for new SignalCommitted events directly via Alchemy WS
const unwatch = publicClient.watchContractEvent({
  address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
  abi: SIGNAL_REGISTRY_ABI,
  eventName: "SignalCommitted",
  onLogs: () => {
    fetchAll();
  },
});

return () => {
  unwatch();
};
```

**Note:** Requires `SignalCommitted` to be in `SIGNAL_REGISTRY_ABI` in `frontend/src/lib/contracts.ts`. Check that file — if the event ABI entry is missing, add:

```typescript
{
  type: "event",
  name: "SignalCommitted",
  inputs: [
    { name: "signalId", type: "uint256", indexed: true },
    { name: "ticker", type: "string", indexed: false },
    { name: "direction", type: "uint8", indexed: false },
  ],
}
```

Match the exact event signature from `contracts/src/SignalRegistry.sol`.

**Also update the feed header in `page.tsx` line 206:**
Change `"Updated every 30s"` to `"Live"` since updates are now event-driven.

**Side effect:** The `POST /api/notify` Alchemy webhook route still works but is no longer needed for the frontend. Leave it in place — it does no harm and verifying Alchemy webhooks is still useful for server-side logic later.

---

## F4 — Storacha: Explicit Fail Instead of Silent Non-Function

**File:** `keeper/src/clients/storacha.ts`

**Root cause:** `StorachaClient` uses `StoreMemory` (ephemeral, no space DID, no authentication) and is tagged `WARNING: UNVERIFIED PATTERN`. It will fail silently or produce a non-functional CID. In the orchestrator, it is the fallback when Pinata fails — so if Pinata throws and Storacha also silently fails, the signal is committed with a garbage CID.

**Fix:** Replace the implementation with an explicit throw so the orchestrator error path surfaces clearly:

```typescript
export class StorachaClient {
  async upload(_content: object, _filename: string): Promise<never> {
    throw new Error(
      "[Storacha] Not configured. Run `npx @storacha/cli create` to provision a space DID and proof, then replace StoreMemory with a persistent store."
    );
  }
}
```

This way, if Pinata throws and the fallback is hit, the error log is actionable rather than silent.

**In `orchestrator.ts`:** The `catch` block on lines 111-116 already logs the Storacha error and propagates. No change needed there — the `finally` block cleans up `processing`.

---

## F5 — Auto-Resolver in Orchestrator

**Root cause:** `resolveSignal(signalId, actualPrice)` exists on the contract (anyone can call it after `RESOLVE_DELAY_BLOCKS = 50` blocks). The accuracy ledger never fills because nobody calls it. The keeper has no resolver logic. Currently the only way to resolve a signal is to run `keeper/scripts/seed-demo.ts` manually.

### F5-A: Add `resolveSignal` to `ChainClient`

**File:** `keeper/src/clients/chain.ts`

Add to `REGISTRY_ABI` (already has the string, just needs the method exposed):

```typescript
async resolveSignal(signalId: bigint, actualPrice: bigint): Promise<`0x${string}`> {
  const txHash = await this.walletClient.writeContract({
    address: this.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "resolveSignal",
    args: [signalId, actualPrice],
  });
  await this.publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[Chain] Signal #${signalId} resolved: ${txHash}`);
  return txHash;
}

async getBlockNumber(): Promise<bigint> {
  return this.publicClient.getBlockNumber();
}
```

Also add a `getSignal` method to read a signal back from chain (needed to get a signal's `blockNumber`):

```typescript
async getSignal(signalId: bigint): Promise<{ blockNumber: bigint; direction: number; price: bigint }> {
  return this.publicClient.readContract({
    address: this.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "getSignal",
    args: [signalId],
  }) as Promise<{ blockNumber: bigint; direction: number; price: bigint }>;
}
```

Requires adding `"function getSignal(uint256) view returns (tuple(...))"` to `REGISTRY_ABI` — copy the exact tuple shape from `SignalRegistry.sol`'s return type.

### F5-B: Add Finnhub REST price fetch

**File:** `keeper/src/clients/finnhub.ts`

Add a one-shot REST quote method (separate from the WebSocket):

```typescript
async getQuote(symbol: string): Promise<number> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${this.apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub quote failed: ${res.status}`);
  const data = (await res.json()) as { c: number }; // c = current price
  return data.c;
}
```

### F5-C: Add resolve tracking to `SignalOrchestrator`

**File:** `keeper/src/orchestrator.ts`

Add after the imports:

```typescript
const RESOLVE_DELAY_BLOCKS = 50n;

interface PendingResolve {
  signalId: bigint;
  ticker: string;
  commitBlock: bigint;
}
```

Add `private readonly pendingResolves: PendingResolve[] = [];` to the class.

After the successful `commitSignal` call (after line 161 `console.log([symbol] On-chain...)`), push to the queue:

```typescript
const commitBlock = await this.chain.getBlockNumber();
this.pendingResolves.push({ signalId: nextId, ticker: symbol, commitBlock });
```

Where `nextId` is the return value of `commitSignal` (update `commitSignal` return to return the new signal ID, not just the tx hash — or use `signalCount` after commit).

Add a resolver loop in `start()` after `this.finnhub.connect()`:

```typescript
// Check every 2 minutes if any pending signals are ready to resolve
setInterval(() => this.resolveReady().catch(console.error), 120_000);
```

Add the resolver method:

```typescript
private async resolveReady(): Promise<void> {
  if (this.pendingResolves.length === 0) return;
  const currentBlock = await this.chain.getBlockNumber();

  for (let i = this.pendingResolves.length - 1; i >= 0; i--) {
    const pending = this.pendingResolves[i];
    if (currentBlock - pending.commitBlock < RESOLVE_DELAY_BLOCKS) continue;

    try {
      const actualPrice = await this.finnhub.getQuote(pending.ticker);
      const priceFixed = BigInt(Math.round(actualPrice * 1e8));
      await this.chain.resolveSignal(pending.signalId, priceFixed);
      console.log(`[Resolver] Signal #${pending.signalId} (${pending.ticker}) resolved at $${actualPrice}`);
      this.pendingResolves.splice(i, 1);
    } catch (err) {
      console.error(`[Resolver] Failed to resolve signal #${pending.signalId}:`, err);
    }
  }
}
```

**Note on restart persistence:** The `pendingResolves` array is in-memory. On keeper restart, previously committed but unresolved signals are lost from the queue. For a hackathon this is acceptable — in production, persist to a local JSON file or Redis. Add a `TODO: persist pendingResolves across restarts` comment.

---

## F6 — Re-Seed 3 Real Signals After F1+F2

This is not a code change — it is an operational step that must happen after F1 (real Pinata upload) and F2 (keeper deployed or running locally with PINATA_JWT set).

### Steps:

1. In `keeper/`, ensure `.env` has all 6 required vars including `PINATA_JWT` with a valid free-tier Pinata JWT.

2. Run `precache.ts`:
   ```bash
   cd keeper && npx tsx scripts/precache.ts
   ```
   This commits 3 signals (TSLA BULLISH, AMZN BEARISH, TSLA NEUTRAL) using the real pipeline. With F1 applied, each signal's CID will now be a real IPFS CID that Pinata publicly pins.

3. Note the 3 signal IDs returned (likely 2, 3, 4 since signal #1 already exists on-chain).

4. Copy the 3 `.json` files from `keeper/.ipfs-cache/` to `frontend/public/ipfs-cache/`:
   ```bash
   cp keeper/.ipfs-cache/*.json frontend/public/ipfs-cache/
   ```

5. Update `NEXT_PUBLIC_SAMPLE_SIGNAL_IDS` in Vercel env to the new IDs:
   ```
   NEXT_PUBLIC_SAMPLE_SIGNAL_IDS=2,3,4
   ```

6. Redeploy frontend on Vercel (required because `NEXT_PUBLIC_*` vars are baked at build time).

7. Run `seed-demo.ts` (the resolve script) to resolve signal #2 as CORRECT so the accuracy stat shows:
   ```bash
   npx tsx scripts/seed-demo.ts
   ```
   Update `SIGNAL_ID` in that script to match the new signal #2 if the ID changed.

---

## F7 — Wire SubscribeButton Component

**Root cause:** `SubscribeButton.tsx` is a fully-implemented, self-contained component with subscribe + cancel + loading states. It is never imported anywhere. `page.tsx` has two inline subscribe callout blocks (one for disconnected, one for connected-but-not-subscribed) that duplicate its logic and omit the cancel path.

### F7-A: Replace inline subscribe UI in `page.tsx`

**File:** `frontend/src/app/page.tsx`

Add import at top:
```typescript
import SubscribeButton from "../components/SubscribeButton";
```

The two `aa-subscribe-callout` blocks (lines 152-194) can be simplified. The connected-but-not-subscribed block should replace its button section with `<SubscribeButton />`. The disconnected block stays as-is (it shows a wallet connect prompt, not a subscribe button).

Specifically, replace lines 183-191 (the `<button onClick={subscribe}...>` section inside the subscribed callout) with:

```tsx
<SubscribeButton />
```

This gives subscribers the cancel button they currently cannot reach.

Also remove the now-unused destructured `{ subscribe, pending, error: subscribeError }` from the `useSubscription()` call on line 52, since `SubscribeButton` manages that internally.

### F7-B: AnalysisViewer on verify page

**File:** `frontend/src/app/verify/[signalId]/page.tsx`

The verify page already renders analysis inline (lines 162-193) with paragraph splitting. The standalone `AnalysisViewer.tsx` component does the same thing but with 6-dimension breakdown and toggle. For the verify page — which is the attestation proof page — the full analysis should always be visible. The existing inline implementation is fine here.

Decision: **leave the verify page as-is** — it shows everything without a toggle which is correct for a verification context. `AnalysisViewer.tsx` is better suited for `SignalCard` expansion (see below).

### F7-C: AnalysisViewer in SignalCard (optional but high-value)

**File:** `frontend/src/components/SignalCard.tsx`

If subscribers see a 160-char truncated preview with a "View Analysis" link to the verify page, add `AnalysisViewer` as an inline expand:

Import it:
```typescript
import AnalysisViewer from "./AnalysisViewer";
```

Replace the truncated text block with a conditional: if `isSubscriber`, render `<AnalysisViewer cid={cidFromHash} />` (where `cidFromHash` is derived from `signal.ipfsHash` using `bytes32ToCid`). If not subscribed, keep the 160-char preview.

This gives subscribers inline read access without navigating away.

---

## F8 — Delete Playwright Temp Files from `frontend/public/`

**Root cause:** 9 zero-byte temp files created by Playwright's screenshot process were committed to the repo and are now deployed on Vercel, where they return 200 with empty bodies. They pollute `ls` output and could confuse Next.js static file serving.

**Files to delete:**
```
frontend/public/.!4209!apple-touch-icon.png
frontend/public/.!4210!apple-touch-icon.png
frontend/public/.!4211!apple-touch-icon.png
frontend/public/.!4212!favicon-32.png
frontend/public/.!4213!favicon-32.png
frontend/public/.!4214!favicon-32.png
frontend/public/.!4227!og-image.png
frontend/public/.!4228!og-image.png
frontend/public/.!4229!og-image.png
```

**Command:**
```bash
cd frontend/public && rm .!4209* .!4210* .!4211* .!4212* .!4213* .!4214* .!4227* .!4228* .!4229*
```

**Add to `frontend/.gitignore`** (or repo root `.gitignore`):
```
.!*
```

This pattern matches all Playwright temp screenshot files.

---

## F9 — USDG Acquisition Path in Onboarding

**Root cause:** Step 4 of `OnboardingBlock` tells users they need 10 USDG/month but does not tell them how to get USDG. On Robinhood Chain Testnet, USDG is a test token. Users have no way to proceed.

**File:** `frontend/src/app/page.tsx`, `OnboardingBlock` function (lines 13-43)

**Change:** Update step 4 to include a faucet or mint link. Since USDG is a testnet token, you need the USDG contract's faucet. Check `contracts/` for a faucet function, or point users to the Robinhood testnet bridge/faucet.

Interim approach — add a direct link to the USDG contract on the testnet explorer where users can call a `mint()` or `faucet()` function if one exists. Alternatively, link to a custom `/faucet` route that mints test USDG directly (requires a small keeper-side endpoint).

**Minimum change:** Update step 4 text to:

```tsx
<span>
  Subscribe for <strong style={{ color: "var(--text)" }}>10 USDG/month</strong> — USDG is a testnet stablecoin.{" "}
  <a
    href={`https://explorer.testnet.chain.robinhood.com/address/${process.env.NEXT_PUBLIC_USDG_ADDRESS}`}
    target="_blank"
    rel="noreferrer"
    style={{ color: "var(--brand)" }}
  >
    Get test USDG from the faucet →
  </a>
</span>
```

If `NEXT_PUBLIC_USDG_ADDRESS` is already in env, this links to the token page where users can interact with it directly.

**Better approach:** Add a `mintTestUSDG()` function to `useSubscription.ts` that calls a `mint(address, amount)` function on the USDG contract, then add a "Get test USDG" button in the onboarding block. Check if the USDG contract has a public mint function.

---

## F10 — Demo Video

**File:** `submission/video/links.md`

This file is a single blank line. The submission is incomplete without a demo video.

**Action:** After all other fixes are applied and the app works end-to-end, run the `demo-video` skill:

```
/demo-video
```

The video should demonstrate:
1. Keeper detects a price move (can simulate with `precache.ts`)
2. Claude generates analysis
3. Content pinned to IPFS via Pinata — show the CID
4. Transaction committed to Robinhood Chain — show the block explorer link
5. Frontend shows the new signal card
6. User subscribes with USDG
7. User reads the full analysis
8. User clicks "Verify" — verify page shows fingerprint match
9. Show the on-chain record at the block explorer

After recording, populate `submission/video/links.md` with the YouTube/Loom URL.

---

## Implementation Order

Execute fixes in this order to avoid rework:

```
F8 (trivial cleanup)
  → F4 (storacha explicit fail — trivial)
  → F1 (real Pinata upload — unblocks F6)
  → F2 (keeper deployment — unblocks live operation)
  → F5 (auto-resolver — needs F2 running)
  → F3 (SSE → watchContractEvent)
  → F7 (wire SubscribeButton)
  → F9 (USDG acquisition path)
  → F6 (re-seed signals — needs F1 + keeper running locally)
  → F10 (demo video — needs everything working)
```

---

## Contracts — No Changes Required

`SignalRegistry.sol` is correctly deployed. The 4 invariants (ticker allowlist, 5-min proof expiry, keeper identity binding, sequence gap detection), EIP-712 signature verification, accuracy ledger, and ISignalConsumer callbacks are all implemented correctly. No redeployment needed unless F5 reveals a `getSignal` ABI mismatch, in which case update the ABI string in `chain.ts` only — not the contract.

---

## After All Fixes — Verification Checklist

- [ ] `npx tsx scripts/precache.ts` runs end-to-end, logs real Pinata CIDs, TX hashes confirm on-chain
- [ ] CID from Pinata is accessible at `https://gateway.pinata.cloud/ipfs/{cid}` in browser
- [ ] Verify page for a new signal shows "Verified — This analysis is unchanged"
- [ ] Keeper deployed on Railway with all 6 env vars, logs show `[AlphaAttest] Monitoring TSLA and AMZN`
- [ ] After a 1%+ price move, a new signal appears on the frontend within 5s (watchContractEvent)
- [ ] After 50 blocks, resolver loop fires and accuracy stat updates
- [ ] SubscribeButton shows "Subscribed" badge + Cancel button for subscribers
- [ ] `frontend/public/` contains no `.!*` temp files
- [ ] `submission/video/links.md` has a working demo video URL
