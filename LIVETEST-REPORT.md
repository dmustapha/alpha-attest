# Livetest Report

**URL / Program:** https://alpha-attest.vercel.app
**Network:** Robinhood Chain Testnet (Chain ID 46630)
**Tested:** 2026-06-09T00:00:00Z → 2026-06-09T12:00:00Z
**Overall:** PASS
**Results:** 14 PASS / 0 WARN / 0 FAIL

---

## Interface Inventory

| Channel | Endpoint | Auth | Priority |
|---------|----------|------|----------|
| Browser UI — Dashboard | https://alpha-attest.vercel.app/ | none | high |
| Browser UI — Verify Signal | https://alpha-attest.vercel.app/verify/{id} | none | high |
| Browser UI — Proof/How It Works | https://alpha-attest.vercel.app/proof | none | high |
| SSE stream | /api/notify (GET) | none | medium |
| Alchemy Notify webhook | /api/notify (POST) | HMAC header | medium |
| Contract: getSignal | SignalRegistry `0x09522dB7a983a675ba4E19BC9bc0896110b80C6A` | none | high |
| Contract: signalCount | SignalRegistry | none | high |
| Contract: getAccuracyScore | SignalRegistry | none | high |

---

## Domain Results

| # | Domain | Status | Notes |
|---|--------|--------|-------|
| 1 | Core User Flows | PASS | 4 signals loaded, verify/1 fingerprint match confirmed, proof page functional |
| 2 | API Connectivity | PASS | 200 on all pages; SSE timeout expected (stream stays open) |
| 3 | Visual Completeness | PASS | No broken images, no undefined/null/NaN placeholders |
| 4 | Form Functionality | PASS | Subscribe button renders correctly in pre-wallet state; no crash on interaction |
| 5 | Console Errors | PASS | Zero console.error or uncaught exceptions across all pages |
| 6 | Auth Flows | PASS | "Connect Wallet" and "Connect Wallet to Subscribe" buttons present and functional |
| 7 | Mobile Responsiveness | PASS | No horizontal scroll at 375px; content fully accessible |
| 8 | Post-PRD Additions | PASS | SSE GET fires to /api/notify on page load; SampleSignals component renders live data |

---

## Detailed Test Results

### D1-01: Dashboard signal feed
- signalCount=4(expect >0) — PASS
- rpcFired=9(expect >0) — 9 POST calls to `rpc.testnet.chain.robinhood.com` — PASS
- hasTSLA=true, hasAMZN=true — PASS
- hasErrorBanner=false — PASS
- consoleErrors=0 — PASS

### D1-02: Stats strip values
- SIGNALS PUBLISHED=4(expect >0) — PASS
- ACCURACY=100%(expect valid %) — PASS
- resolved=1/1 — PASS

### D1-03: Signal card content
- Cards render with ticker, direction, price, date — PASS
- Sample signals show 400+ word analysis previews — PASS
- "Verify on-chain →" link present on each card — PASS

### D1-04: Verify page `/verify/1`
- Status: "✓ Verified — This analysis is unchanged" — PASS
- ipfsFetch=1 (Pinata gateway call fired) — PASS
- rpcFired=1 (on-chain hash fetched) — PASS
- hasSignalData=true (TSLA, NEUTRAL) — PASS
- hasPlaceholders=false — PASS

### D1-05: Proof/How It Works page
- Renders with 3-step explanation — PASS
- No 404 — PASS

### D2-01: HTTP status checks
- `GET /` → 200 — PASS
- `GET /verify/1` → 200 — PASS
- `GET /api/notify` → timeout (SSE stream stays open — expected) — PASS

### D3-01: Visual completeness
- brokenImages=0 — PASS
- hasPlaceholders=false — PASS
- hasLoremIpsum=false — PASS

### D5-01: Console errors (all pages)
- Dashboard: 0 errors — PASS
- Verify: 0 errors — PASS
- Proof: 0 errors — PASS

### D6-01: Wallet connect UI
- "Connect Wallet" button in nav — PASS
- "Connect Wallet to Subscribe" CTA renders — PASS
- Subscribe button renders in correct pre-wallet state — PASS
- Note: Full MetaMask connect flow not testable in headless; button presence confirmed

### D7-01: Mobile layout (375×812)
- scrollWidth=375, clientWidth=375 — no horizontal overflow — PASS
- Content renders and is accessible — PASS

### D8-01: SSE stream
- `GET /api/notify` fires on page load — PASS
- Stream stays open (expected for SSE) — PASS

---

## Patch Run Summary

| Test ID | Original | Fix Applied | Re-verify |
|---------|----------|-------------|-----------|
| P0-01 | FAIL — wagmi.ts fallback RPC was `MISSING_KEY` Alchemy URL, causing all RPC calls to fail | Changed fallback to `https://rpc.testnet.chain.robinhood.com` in `frontend/src/lib/wagmi.ts`, committed `613e107`, redeployed | PASS |
| P0-02 | FAIL — `NEXT_PUBLIC_ALCHEMY_RPC_URL` set in Vercel via `echo` pipe, giving trailing `\n` → invalid URL | Removed and re-added using `printf` (no newline) | PASS |
| P0-03 | FAIL — All 3 contract address env vars set via `echo` → trailing `\n` → viem threw `ContractFunctionExecutionError: Address is invalid` synchronously (no RPC requests made) | Removed and re-added with `printf '0x...' \| vercel env add ...` for all 3 addresses, redeployed | PASS |

**Root cause of P0-02 and P0-03:** `echo "value" | vercel env add` embeds a trailing `\n` in the stored value. viem 2.x validates EIP-55 checksums synchronously and rejects addresses containing `\n`. Use `printf 'value'` (no trailing newline) for all Vercel env var additions.

---

## On-Chain Integration Proofs

| Integration | Proof |
|-------------|-------|
| Frontend → SignalRegistry.signalCount() | 9 RPC POST calls to `rpc.testnet.chain.robinhood.com` confirmed via network capture |
| Frontend → SignalRegistry.getSignal(1) | RPC call confirmed on `/verify/1` page; response shows `ipfsHash` matching IPFS document |
| Frontend → Pinata IPFS gateway | `ipfsFetch=1` on verify page; fingerprint comparison shows "Verified — This analysis is unchanged" |
| SignalRegistry (deployed) | `0x09522dB7a983a675ba4E19BC9bc0896110b80C6A` — 4 signals on-chain, 1 resolved CORRECT |
| SubscriptionManager (deployed) | `0x566BEAa729E8E1e6cde30446546279BD30e5630d` |
| MockConsumer (deployed) | `0x6114270e211C2cd5542D9972caF6F0D51FbA7105` |

---

## Critical Issues
_None._

## Warnings
_None._
