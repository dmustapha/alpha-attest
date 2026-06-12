# MASTERFIX — Deep Critique & Perfect Fixes

**Date:** 2026-06-11 | **Deadline:** June 14 (registration closes June 12) | **Last trading days before deadline: Thu June 12, Fri June 13**
**Supersedes:** CRITIQUE.md (2026-06-10) and FIXPLAN.md — both partially executed; this doc reflects verified current state.
**Verification basis:** full source re-read (contracts, keeper, frontend), live on-chain queries, live production probes, decoded CID proofs.

---

## How to read this

Every finding has: **Evidence** (verified, not assumed), **Perfect Fix** (exact change), **Effort**, **Verify** (command/check proving it worked). Severity:

- **P0** — judge sees it fail, or core claim is false
- **P1** — judge finds it with one layer of digging
- **P2** — quality/polish; raises ceiling

The single organizing insight: **the product's pitch is "an autonomous AI whose track record is permanently verifiable" — and today the agent isn't running, most signals don't verify, and the track record has one entry.** Every P0 below is one of those three clauses.

---

# PART A — The Decision That Gates Everything: Redeploy Contracts or Not

The contract fixes in Part B require a redeploy (Solidity is immutable). Decide this FIRST because it sequences everything else.

### Why redeploy is the right call (Path A — RECOMMENDED)

The current on-chain ledger is **polluted beyond repair**:

1. Signals #1–4 carry locally-computed raw-SHA256 hashes that are **not valid IPFS addresses** — no gateway will ever serve them. `/verify/2-4` can never do real verification.
2. Signals #5–7 directions are scrambled vs. their own analyses' intent: precache expected BULLISH/BEARISH/NEUTRAL for +2.5%/−1.8%/+0.4! moves; chain shows NEUTRAL/NEUTRAL/BULLISH. An AI that calls a +2.5% spike "NEUTRAL" and a +0.4% drift "BULLISH" is incoherent to any finance-literate judge — and when resolved, this track record will look random.
3. Signals #5–7's immutable IPFS documents contain `"demo": true` (precache.ts line 80). A judge opening the raw document sees the system admitting it's staged. **Immutability — your own product — preserves this forever.**
4. The accuracy ledger has 1 manually-resolved entry.

A fresh registry deployed today, fed by the live keeper through Thursday and Friday market hours, produces a **clean ledger where every signal verifies, every direction is coherent, and every document is genuinely autonomous**. That artifact is unbuildable on Saturday. The old registry stays on-chain as deployment history (keep addresses in proof.md under "v1 — superseded").

**Cost:** ~30 min deploy + env var updates (frontend ×1 redeploy, keeper ×1) + re-register MockConsumer + setSubscriptionManager. All scripts exist.

### Path B — fallback (no redeploy)

If Path A is not deployed and verified by **18:00 WAT today (June 11)**, freeze contracts and ship only off-chain fixes (Parts C–F). Document the contract trust assumptions in README under "Testnet trust model." Accept `/verify/1` as the only fully-working legacy verification and point everything at signals the live keeper creates (they'll verify via the frontend CID fix even on the old registry — the old registry's commitSignal works fine).

> Note: Path B still gets autonomous signals + working verification for NEW signals. What it cannot fix: the resolver trust hole, the missing direction validation, the polluted history sitting at the top of the feed.

---

# PART B — Contracts (deploy as SignalRegistry v1.1 under Path A)

## B1. `resolveSignal` is permissionless with caller-supplied price — the accountability ledger is griefable **[P0]**

**Evidence:** `SignalRegistry.sol:179-181` — "Anyone can call after RESOLVE_DELAY_BLOCKS", `actualPrice` is an unvalidated argument, `status != 0` makes resolution permanent. One transaction from any stranger marks any pending signal CORRECT or INCORRECT with a fabricated price, irreversibly. The contract's central feature — trustless accuracy — is its weakest point. (A judge's first adversarial question: "who supplies the truth?")

**Perfect Fix:** keeper-only resolution with the trust model stated honestly in NatSpec:

```solidity
error NotKeeper(); // already exists

/// @notice Resolve a pending signal against the observed market price.
/// @dev TRUST MODEL (testnet): resolution price is supplied by the keeper from the
///      same Finnhub feed that triggered the signal. Robinhood Chain testnet has no
///      canonical price oracle to read trustlessly; on mainnet this becomes an
///      oracle read (e.g. EquityPriceOracle) and loses the keeper trust assumption.
///      Keeper-only beats permissionless here: an open resolver with caller-supplied
///      price lets anyone permanently falsify the ledger.
function resolveSignal(uint256 signalId, uint256 actualPrice) external {
    if (msg.sender != keeper) revert NotKeeper();
    // ... rest unchanged
```

Stretch (only if <2h): check `https://docs.robinhood.com/chain/contracts/` for a deployed price oracle; if one exists with TSLA/AMZN feeds, read `actualPrice` from it and drop the parameter — that makes resolution genuinely trustless and is a track-winning answer. Do NOT burn more than 2 hours on this.

**Effort:** 15 min (keeper-only) | **Verify:** Foundry test `vm.prank(stranger); vm.expectRevert(NotKeeper.selector); registry.resolveSignal(1, X);`

## B2. Proof expiry has no upper bound — future timestamps pass "Invariant 1" **[P1]**

**Evidence:** `SignalRegistry.sol:124-127` checks only `timestamp < windowStart`. A timestamp 10 years in the future passes. The invariant is half-enforced and judges reading the four-invariants pitch will test exactly this.

**Perfect Fix:**
```solidity
error ProofFromFuture(uint256 providedTimestamp, uint256 nowPlusTolerance);
// in commitSignal, after the existing expiry check:
if (timestamp > block.timestamp + 60) revert ProofFromFuture(timestamp, block.timestamp + 60);
```
(60s tolerance absorbs keeper/chain clock skew.)

**Effort:** 10 min | **Verify:** test commits with `block.timestamp + 2 hours` → expect revert.

## B3. `direction` is never validated — "Invariant 4: input schema validation" misses a field **[P1]**

**Evidence:** `commitSignal` accepts any `uint8 direction`; `direction = 7` stores fine and `resolveSignal` silently treats it as BEARISH (`direction != 2 && direction != 0`).

**Perfect Fix:**
```solidity
error InvalidDirection(uint8 direction);
if (direction > 2) revert InvalidDirection(direction);
```

**Effort:** 5 min | **Verify:** test with direction=3 → revert.

## B4. `ISignalConsumer` callback omits `signalId` and `ticker` — composability is half-usable **[P1]**

**Evidence:** `onSignalPublished(bytes32 ipfsHash, uint256 price, uint8 direction)` — a real consumer (rebalancer, hedging vault) cannot know **which asset** the signal is about, or look the signal up. The composability story is the Open-track differentiator; this interface can't support it.

**Perfect Fix (interface v1.1):**
```solidity
function onSignalPublished(
    uint256 signalId,
    string calldata ticker,
    bytes32 ipfsHash,
    uint256 price,
    uint8 direction
) external;
```
Update `_notifyConsumers` and MockConsumer to match. This is exactly the kind of "we thought about real integrators" detail Smart Contract Quality judges reward.

**Effort:** 30 min incl. tests | **Verify:** existing consumer-callback Foundry tests updated and green.

## B5. MockConsumer `onSignalPublished` has no access control — anyone can forge the composability proof **[P1]**

**Evidence:** `MockConsumer.sol:42-46` — no `msg.sender` check. Anyone calls it directly with fake data, corrupting `lastSignal`/`signalCount`. Your livetest uses `MockConsumer.signalCount == registry.signalCount` as an integration proof; that equality is spoofable in either direction.

**Perfect Fix:**
```solidity
error NotRegistry();
address public immutable REGISTRY;
constructor(address _tslaToken, address _registry) Ownable(msg.sender) {
    require(_registry != address(0), "MockConsumer: invalid registry");
    REGISTRY = _registry;
    ...
}
function onSignalPublished(...) external override {
    if (msg.sender != REGISTRY) revert NotRegistry();
    ...
}
```

**Effort:** 15 min | **Verify:** direct call from EOA reverts in test.

## B6. Subscription is "monthly" in the UI, eternal in the contract **[P1]**

**Evidence:** `SubscriptionManager.sol:23` — `mapping(address => bool)`; no time component anywhere (grep for expiry/duration: zero hits). UI and README say "10 USDG/month". A judge cross-reading catches it in 60 seconds.

**Perfect Fix (since we're redeploying):** make it actually monthly:
```solidity
mapping(address => uint256) private _subscribedUntil;
uint256 public constant SUBSCRIPTION_PERIOD = 30 days;

function subscribe() external {
    // allow renewal: extend from max(now, current expiry)
    uint256 base = _subscribedUntil[msg.sender] > block.timestamp
        ? _subscribedUntil[msg.sender] : block.timestamp;
    _subscribedUntil[msg.sender] = base + SUBSCRIPTION_PERIOD;
    totalRevenue += SUBSCRIPTION_FEE;
    bool success = usdg.transferFrom(msg.sender, address(this), SUBSCRIPTION_FEE);
    if (!success) revert PaymentFailed();
    emit Subscribed(msg.sender, SUBSCRIPTION_FEE);
}

function isSubscriber(address account) external view returns (bool) {
    return _subscribedUntil[account] > block.timestamp;
}

function subscriptionExpiry(address account) external view returns (uint256) {
    return _subscribedUntil[account];
}
```
Keep `cancelSubscription` (sets `_subscribedUntil = block.timestamp`, no refund — spec-compliant). Remove `AlreadySubscribed` (renewals are a feature). Frontend `useSubscription` needs no change (`isSubscriber` signature identical); optionally show expiry.

**Effort:** 45 min incl. tests | **Verify:** test subscribe → warp 31 days → `isSubscriber == false`; renewal extends.

## B7. The deployed source says "WARNING: UNVERIFIED" about its own fee **[P2]**

**Evidence:** `SubscriptionManager.sol:16-18`. **Now verified on-chain: USDG `decimals() == 6`** (cast call, 2026-06-11). The fee `10 * 1e6` is correct.

**Perfect Fix:** replace the warning block with the fact:
```solidity
// USDG (0x7E955252...) verified on-chain: decimals() == 6. Fee = 10 USDG.
uint256 public constant SUBSCRIPTION_FEE = 10 * 1e6;
```

**Effort:** 2 min (ships with B6 redeploy).

## B8. NEUTRAL resolution band has 0.1% granularity **[P2]**

**Evidence:** `movement * 1000 / originalPrice < 5` — integer division means the band is evaluated in 0.1% steps; a 0.49% and a 0.40% move are indistinguishable.

**Perfect Fix:** `movement * 10_000 / originalPrice < 50` (0.01% granularity, same 0.5% threshold). Cosmetic precision; ships with redeploy.

## B9. Tests for everything above

Add to the existing 49-test suite: future-timestamp revert, direction=3 revert, stranger-resolve revert, MockConsumer direct-call revert, subscription expiry + renewal, new consumer callback shape. Target: all green before deploy. **Effort:** 1h.

### Path A deploy runbook (after B1–B8 merged)

```bash
cd contracts && forge test                      # all green
forge script script/Deploy.s.sol --rpc-url $RPC --broadcast   # update script: MockConsumer takes registry addr
cast send $NEW_REGISTRY "registerConsumer(address)" $NEW_CONSUMER ...
cast send $NEW_REGISTRY "setSubscriptionManager(address)" $NEW_SM ...
# Update env in BOTH places:
#   frontend (Vercel): NEXT_PUBLIC_SIGNAL_REGISTRY_ADDRESS, _SUBSCRIPTION_MANAGER_, _MOCK_CONSUMER_  (use printf, never echo)
#   keeper (Railway): SIGNAL_REGISTRY_ADDRESS
# proof.md: add v1.1 section, keep v1 addresses as history
```

---

# PART C — Keeper / Backend (the autonomy story)

## C1. The keeper has never run in production **[P0 — the headline issue]**

**Evidence:** `signalCount` frozen at 7 since June 9 across two trading days; signals #5–7 still PENDING despite the auto-resolver firing every 2 min after ~12 min — impossible if the process were alive. Dockerfile and railway.json exist but were never deployed.

**Perfect Fix:** deploy to Railway **today, before US market open (14:30 UTC)**:
```bash
cd keeper
railway init   # or link existing project
railway up
railway variables set FINNHUB_API_KEY=... ANTHROPIC_API_KEY=... PINATA_JWT=... \
  KEEPER_PRIVATE_KEY=... ALCHEMY_API_KEY=... SIGNAL_REGISTRY_ADDRESS=<v1.1 addr>
```
Apply C2–C8 first (they're hours of work total and the keeper restarts cleanly), but **do not let them delay market open** — C2/C3/C4 can ship as a same-day update; an imperfect live agent beats a perfect dead one.

**Verify:** Railway logs show `[Finnhub] Connected`; first >1% move produces a commit TX you did not trigger; pending signals resolve on schedule. **These autonomous TX hashes are the strongest evidence in the entire submission — collect them in proof.md.**

## C2. Restart loses all pending resolutions — the exact failure that stranded #5–7 **[P0]**

**Evidence:** `orchestrator.ts:38` — `pendingResolves` is an in-memory array. Any restart (deploy, crash, Railway maintenance) permanently strands every pending signal, silently zeroing the accuracy ledger's growth.

**Perfect Fix:** crash-recovery scan on startup. In `start()`, before `setInterval`:
```typescript
private async recoverPending(): Promise<void> {
  const count = await this.chain.getSignalCount();
  for (let id = 1n; id <= count; id++) {
    const s = await this.chain.getSignal(id);          // add getSignal to ChainClient ABI
    if (s.status === 0) {
      this.pendingResolves.push({ signalId: id, ticker: s.ticker, commitBlock: s.blockNumber });
      console.log(`[Recovery] Re-queued pending signal #${id} (${s.ticker})`);
    }
  }
}
```
Now the chain itself is the durable queue — no database needed. This is the architecturally *correct* fix, not a workaround: the registry already stores everything the resolver needs.

**Effort:** 45 min | **Verify:** restart keeper while a signal is pending → log shows re-queue → resolves on schedule.

## C3. A permanently-reverting resolution retries forever **[P1]**

**Evidence:** `orchestrator.ts:214-217` — any error leaves the entry in the queue. If a signal was already resolved (or the v1 registry's permissionless resolver raced), `SignalNotPending` reverts every 2 minutes, eternally, burning RPC quota and log noise.

**Perfect Fix:** classify the error; drop terminal ones:
```typescript
} catch (err) {
  const msg = String(err);
  if (msg.includes("SignalNotPending") || msg.includes("SignalNotFound")) {
    console.warn(`[Resolver] Signal #${pending.signalId} terminal (${msg.slice(0,80)}) — dropping`);
    this.pendingResolves.splice(i, 1);
  } else {
    console.error(`[Resolver] Transient failure for #${pending.signalId}, will retry:`, err);
  }
}
```

**Effort:** 15 min.

## C4. The analysis hallucinates: Claude is asked for volume/support/resistance analysis but receives only price + change% **[P0 for product credibility]**

**Evidence:** `anthropic.ts:36-61` — the prompt demands `VOLUME_ANALYSIS` ("whether volume confirms this price action") and support/resistance levels, but the entire model input is ticker, one price, one percentage, one timestamp. Meanwhile `finnhub.ts` *receives* `volume` on every trade and `getQuote` returns open/high/low/prevClose — **all discarded**. Every volume claim and price level in every published analysis is fabricated. The product's core claim is "real AI analysis of real market data"; a judge who reads one analysis document against a real chart can falsify it. This is the warroom's #1 premortem risk ("thin/templated analysis") in its worst form: *confident* fabrication.

**Perfect Fix:** ground the prompt in real data the keeper already has or can fetch in one call:

1. Extend `getQuote` to return the full Finnhub quote: `{ c, o, h, l, pc, d, dp }` (current, open, high, low, prevClose, change, change%).
2. In `handleTrade`, before calling Claude: `const quote = await this.finnhub.getFullQuote(symbol);`
3. Pass `trade.volume` and the quote into `buildAnalysisPrompt`; inject a DATA block:
```
MARKET DATA (real-time, Finnhub):
- Trigger trade: $X at <time>, size <volume>
- Session: open $O, high $H, low $L, prev close $PC
- Day change: D (DP%)
```
4. Reword the section instructions to analyze **the provided data**: "Using the session range and prev close above…", "The trigger trade size was N shares — characterize what conviction this print size suggests; do not invent aggregate volume figures."
5. Add to the system prompt: *"Only reference figures present in MARKET DATA. If a data point is unavailable, state that explicitly rather than estimating."*

**Effort:** 1.5h | **Verify:** generate one analysis, cross-check every number it cites against the injected data block — zero uncited figures.

## C5. Silent NEUTRAL on parse failure + truncation-prone output ordering **[P0 — likely cause of the scrambled directions]**

**Evidence:** Three converging facts. (a) `parseDirection` (`anthropic.ts:70-75`) returns NEUTRAL whenever the `SIGNAL_DIRECTION` section is missing. (b) That section is **last** in a 6-section response capped at `max_tokens: 2048` — roughly 800–1000 words of headroom for a prompt demanding 400+ words *minimum* across six analytical sections; truncation eats the tail first. (c) On-chain: precache expected BULLISH (+2.5%), BEARISH (−1.8%), NEUTRAL (+0.4%); chain recorded NEUTRAL, NEUTRAL, BULLISH. The default is masquerading as analysis.

**Perfect Fix (three changes, all required):**
1. `max_tokens: 4096`.
2. Move the direction to the **front**: require the response to open with a single line `DIRECTION: BULLISH|BEARISH|NEUTRAL` before any section (first tokens are never truncated).
3. Make the parser strict — absence is an error, not NEUTRAL:
```typescript
function parseDirection(content: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const m = content.match(/^DIRECTION:\s*(BULLISH|BEARISH|NEUTRAL)/m);
  if (!m) throw new Error("Analysis missing DIRECTION line — refusing to default");
  return m[1] as "BULLISH" | "BEARISH" | "NEUTRAL";
}
```
4. (With C6) one retry on failure with the error appended to the prompt; then skip the signal.

**Effort:** 45 min | **Verify:** 3 test generations across +2%/−2%/+0.3% scenarios produce coherent directions; truncate-simulation (max_tokens=200) throws instead of returning NEUTRAL.

## C6. Failed signal attempts hammer the APIs — baseline never advances on error **[P1]**

**Evidence:** `orchestrator.ts:185` updates `lastPrices` only on success; the catch path doesn't. After any failure (thin analysis, Pinata outage), the *very next trade tick* re-triggers the full pipeline — during volatile periods that's a Claude+Pinata call per tick, burning quota and rate limits in a tight loop.

**Perfect Fix:** per-symbol cooldown on failure:
```typescript
private readonly cooldownUntil = new Map<string, number>();
// top of handleTrade:
if ((this.cooldownUntil.get(symbol) ?? 0) > Date.now()) return;
// in catch:
this.cooldownUntil.set(symbol, Date.now() + 120_000); // 2 min backoff
```
Keep baseline un-advanced (correct — the move is still unanalyzed); the cooldown bounds the retry rate.

**Effort:** 15 min.

## C7. Finnhub WebSocket has no heartbeat — a half-open connection silences the agent forever **[P1]**

**Evidence:** `finnhub.ts` — no ping/pong. TCP half-open (NAT timeout, Finnhub-side drop without FIN) leaves `ws` in OPEN state receiving nothing; reconnect logic never fires because `close` never fires. The agent looks alive and is deaf — the worst failure mode for the demo window ("why has it been quiet for 6 hours?").

**Perfect Fix:** standard ws liveness pattern:
```typescript
private heartbeat: NodeJS.Timeout | null = null;
// on "open":
this.heartbeat = setInterval(() => {
  if (this.ws?.readyState === WebSocket.OPEN) {
    let alive = false;
    this.ws.once("pong", () => { alive = true; });
    this.ws.ping();
    setTimeout(() => { if (!alive) this.ws?.terminate(); }, 10_000); // terminate → 'close' → reconnect
  }
}, 30_000);
// on "close": clearInterval(this.heartbeat)
```

**Effort:** 30 min | **Verify:** locally, kill network for 60s → log shows terminate + reconnect.

## C8. Railway restart policy abandons the agent after 3 crashes **[P1]**

**Evidence:** `railway.json` — `"restartPolicyType": "ON_FAILURE", "restartPolicyMaxRetries": 3`. Three crashes (one bad deploy + flaky RPC is enough) and Railway stops restarting permanently — the agent dies quietly mid-hackathon.

**Perfect Fix:**
```json
"deploy": { "restartPolicyType": "ALWAYS" }
```
Plus a heartbeat log every 5 min in the orchestrator (`[Heartbeat] alive | pending=${this.pendingResolves.length} | lastPrice TSLA=$...`) so Railway logs prove liveness at a glance — and give the demo video a great backend shot.

**Effort:** 10 min.

## C9. No fetch timeouts on the IPFS path — one hung request stalls a symbol indefinitely **[P2]**

**Evidence:** `pinata.ts` — three sequential `fetch` calls, no `AbortSignal`. A hung connection holds the `processing` lock for that ticker forever (until process restart).

**Perfect Fix:** `signal: AbortSignal.timeout(15_000)` on all three attempts; the existing fallback chain handles the abort as a failure.

**Effort:** 10 min.

## C10. Storacha "fallback" cannot succeed — fail loudly instead **[P2]**

**Evidence:** `storacha.ts` uses ephemeral `StoreMemory` with no space DID or delegation — first real call fails with an auth error (its own file warns "UNVERIFIED PATTERN"). Current behavior: Pinata fails → Storacha fails differently → signal abandoned with a misleading error.

**Perfect Fix (honest minimalism):** delete the Storacha call from the orchestrator; on Pinata exhaustion, log `[IPFS] CRITICAL: all Pinata methods failed — signal skipped` and let C6's cooldown govern retry. Remove `storacha.ts` or leave it with a header comment "not configured — kept as integration sketch." A fallback that can't fall back is worse than no fallback: it doubles debugging surface during an outage.

**Effort:** 15 min.

## C11. Graceful shutdown **[P2]**

`SIGTERM` (every Railway redeploy) currently kills mid-pipeline writes. Add:
```typescript
process.on("SIGTERM", () => { console.log("[Keeper] SIGTERM — draining"); this.finnhub.disconnect(); process.exit(0); });
```
Pending commits at kill-time are recovered by C2's startup scan. **Effort:** 10 min.

---

# PART D — Frontend: Functionality

## D1. `bytes32ToCid` reconstructs the wrong CID for every Pinata-pinned signal **[P0 — root cause of the empty judge preview]**

**Evidence (proven, not inferred):** Pinata v3 returns CIDv1 raw-codec (`bafkrei…`). Decoded `bafkreibld4ow…` = prefix `01551220` + digest `2b1f1d6f…` — **byte-identical to signal #7's on-chain ipfsHash**. The frontend (`lib/ipfs.ts:2-11`) reconstructs only CIDv0 (`Qm…` = base58 of `1220`+digest), which (a) misses the cache — files are saved under `bafkrei…` names, (b) 404s on every gateway — the Qm form addresses a dag-pb-wrapped block that was never created. This single bug breaks: SampleSignals (renders zero cards — the judge's first impression), `/verify/5-7` analysis fetch, "View raw document →", and subscribers' "Read full analysis →". Production console shows exactly this: 3× cache 404 + 3× gateway 500 for Qm-form CIDs.

**Perfect Fix:** reconstruct **both** forms and try CIDv1 first (all new signals), CIDv0 second (legacy local-cache signals):

```typescript
// CIDv1 raw-codec: 0x01 0x55 0x12 0x20 + digest → multibase base32 ('b' prefix)
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function bytes32ToCidV1(bytes32: `0x${string}`): string {
  const digest = Buffer.from(bytes32.slice(2), "hex");
  const cid = new Uint8Array(36);
  cid.set([0x01, 0x55, 0x12, 0x20], 0);  // cidv1, raw, sha2-256, 32 bytes
  cid.set(digest, 4);
  return "b" + base32Encode(cid);
}

export async function fetchAnalysis(bytes32: `0x${string}`): Promise<object> {
  const candidates = [bytes32ToCidV1(bytes32), bytes32ToCid(bytes32)]; // v1 first, legacy v0 second
  for (const cid of candidates) {
    for (const url of [`/ipfs-cache/${cid}.json`, `https://ipfs.io/ipfs/${cid}`, `https://gateway.pinata.cloud/ipfs/${cid}`]) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) return r.json();
      } catch { /* next */ }
    }
  }
  throw new Error("Analysis document unreachable under any CID form");
}
```
Change `fetchAnalysis` callers (SampleSignals, SignalCard, verify page) to pass the raw `ipfsHash` instead of a pre-derived CID; display CID = `bytes32ToCidV1` for new signals. `getIPFSUrl` links should use the v1 form.

**Effort:** 1.5h incl. call-site updates | **Verify:** production dashboard renders 3 sample cards; `/verify/<new>` loads its document from `ipfs.io` with cache disabled in devtools.

## D2. "Verified" is asserted without verifying — recompute the hash in the browser **[P0 for credibility]**

**Evidence:** `verify/[signalId]/page.tsx:39-41` — `status = "verified"` the moment `fetchAnalysis` resolves. No hash comparison. And the document usually comes from your own `/ipfs-cache/` static dir — so the on-screen claim "the fingerprint matches the live document" is, observably, "our server served the file we put there." A judge with devtools open discounts the entire core claim.

**Perfect Fix:** make verification real and visible:
```typescript
const raw = await fetchAnalysisRaw(s.ipfsHash);            // return the exact bytes (response.text())
const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
const computed = "0x" + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
setStatus(computed === s.ipfsHash.toLowerCase() ? "verified" : "mismatch");
```
(Pinata v3 raw-codec CIDs are the SHA-256 of the exact bytes — this round-trips. Legacy signals #1–4 also hash raw bytes, so it works for them via cache too. **Important:** hash the raw text, not `JSON.parse`→re-stringify.)

UI: render the "mismatch" state distinctly (red banner: "The live document does NOT match the on-chain fingerprint") — its *existence* in the UI is proof you take verification seriously. Add a line under the badge: *"Hash recomputed in your browser just now: `0x2b1f…9847` — equal to the on-chain record."* That sentence is the demo's wow moment, upgraded from staged to live.

**Effort:** 1.5h | **Verify:** `/verify/<new signal>` shows verified with matching displayed hashes; temporarily corrupt a cache file locally → mismatch state renders.

## D3. Dead interactive element: "Subscribe to read it →" does nothing **[P1]**

**Evidence:** `SignalCard.tsx:106-110` — `cursor: pointer`, no handler. Judges click; nothing happens; trust drops.

**Perfect Fix:** make it scroll to the subscribe callout (or trigger wallet connect when disconnected):
```tsx
<button className="aa-link-quiet" onClick={() => document.querySelector(".aa-subscribe-callout")?.scrollIntoView({ behavior: "smooth" })}>
  Subscribe to read it →
</button>
```
**Effort:** 15 min.

## D4. Copy contradicts the contract: "24h window" vs ~12 minutes; "$10/month" vs (current) forever **[P1]**

**Evidence:** `SignalCard.tsx:60` tooltip says "Awaiting price confirmation (24h window)"; resolution is 50 blocks ≈ 12 min. Pricing copy says "/month" in 3 places (page.tsx ×2, SubscribeButton); contract has no expiry (fixed by B6 under Path A — under Path B, fix the copy instead: "one-time 10 USDG access").

**Perfect Fix:** tooltip → "Outcome confirmed against market price ~12 minutes after publication (50 blocks)". Pricing copy: keep "/month" only if B6 ships; else "10 USDG · one-time (testnet)".

**Effort:** 15 min.

## D5. Legacy signals #1–4 need a story the UI can survive **[P1]**

**Evidence:** their on-chain hashes are not valid IPFS addresses (raw-SHA256, locally computed); only #1's document is in the deployed cache under its Qm name.

**Perfect Fix:** under Path A, moot — the v1.1 registry starts clean and the old one isn't surfaced. Under Path B: copy the keeper's `.ipfs-cache/` JSONs for #2–4 into `frontend/public/ipfs-cache/` under their derived Qm names (D1's v0 fallback then serves them), and exclude #1–4 from `SAMPLE_SIGNAL_IDS`.

**Effort:** 20 min (Path B only).

## D6. No USDG acquisition path — the subscribe flow dead-ends for every judge **[P1]**

**Evidence:** zero "faucet" hits in frontend source; README setup has no USDG section; a judge with 0 USDG hits `PaymentFailed`.

**Perfect Fix:** (a) under the SubscribeButton, add: *"Testnet USDG required — get test funds at the [Robinhood Chain faucet](https://faucet.testnet.chain.robinhood.com/), or browse and verify every signal without subscribing."* (Confirm the faucet dispenses USDG; if it only dispenses gas ETH, say exactly that and lean on (b).) (b) README "Try it as a judge" section: the no-wallet path (samples + verify) **is** the judge path — say so explicitly so nobody feels blocked. (c) demo video shows the subscribe flow once from your funded wallet, so it's proven without judges needing funds.

**Effort:** 30 min.

## D7. SampleSignals renders a header for an empty/loading section **[P2]**

**Evidence:** screenshot shows "SAMPLE SIGNALS — NO WALLET REQUIRED" over a loading line that can resolve to nothing (component returns `null` but the *loading* state already painted; on failure the section vanishes after having promised content).

**Perfect Fix:** after D1 this rarely triggers, but make the failure state honest: keep the section, render *"Sample analyses are loading slowly from IPFS — every signal below remains independently verifiable"* with a retry button, instead of silently disappearing.

**Effort:** 20 min.

## D8. Subscriber gating is client-side theater — disclose it **[P2]**

**Evidence:** analysis documents are public by design (IPFS + public cache); `isSubscriber` only gates rendering. Fine for testnet — but say it before a judge discovers it: README + /proof one-liner: *"On testnet, subscription gates the rendered experience; the documents are public by design — provenance, not secrecy, is the product. Production adds threshold encryption (e.g., Lit) for paid content."* This converts a "gotcha" into a considered architecture note.

**Effort:** 10 min.

---

# PART E — Frontend: Design ("majestic" pass)

The current UI is a competent dark terminal aesthetic — clean, consistent, credible. What it lacks is **hierarchy that tells the product's story**: the track record is the product, and it's rendered as the smallest number on the page.

## E1. Make the track record the hero **[P1 — highest design leverage]**

**Evidence:** accuracy is one stat cell ("100% · 1/1 resolved"); resolved outcomes are small gray/green chips in a uniform list. The screenshot reads as "generic signal feed," not "permanent AI report card."

**Perfect Fix:** a Track Record strip directly under the hero, built from data `useSignals` already fetches (zero new RPC):
- A horizontal row of outcome chips, one per resolved signal, in chronological order: ✓ green / ✗ red / ○ pending — each links to its `/verify` page. (With the keeper live through Thu–Fri this row fills visibly.)
- Big accuracy number with its denominator: "**83%** · 5 of 6 calls correct · every call on record".
- One line under it: *"Misses are preserved forever — that's the point."* (This sentence does more for the Real Problem Solving score than any feature.)

**Effort:** 2h.

## E2. Signal cards hide the most interesting number: the move that triggered them **[P1]**

**Evidence:** cards show entry price + direction, but not the trigger %. `priceChangePct` is in every analysis document (public), and after D1 it's fetchable for all viewers.

**Perfect Fix:** show the trigger on every card — `▲ +2.31%` green / `▼ −1.84%` red next to the price, sourced from the analysis doc (already fetched for subscribers; fetch the doc's metadata for all users — the preview text stays gated). Cards instantly stop looking like seeded test rows.

**Effort:** 1h.

## E3. Prove the agent is alive, on the page **[P1 — Best Agentic track signal]**

**Perfect Fix:** an Agent Status line in the feed header, derived from on-chain data: *"⚡ Keeper live — last signal 47 min ago · monitoring TSLA, AMZN via Finnhub"* (latest signal timestamp → relative time; if > 24h during market hours, show "idle" honestly). For judges this is the difference between "a dashboard" and "an autonomous agent's dashboard." After the keeper deploy it's also simply true.

**Effort:** 45 min.

## E4. Readability + density polish **[P2]**

- 9–11px mono text in several places (`aa-stat-sub`, card timestamps, gloss text) with `--text-4` grays on near-black: bump minimums to 11px and raise `--text-4` contrast one step (WCAG AA at small sizes).
- Duplicate "Live"/live-dot in the feed header — keep one.
- Heavy inline `style={{}}` use alongside the class system (verify page, SignalCard) — consolidate the repeated patterns into classes; not user-visible, but it's the difference between "crafted" and "generated" if a judge opens the source.
- `/verify` "On-Chain Record →" links to the bare contract address page; link to `…/block/${signal.blockNumber}` instead so the judge lands on the block containing the commit.

**Effort:** 1.5h total.

## E5. Orphaned `AnalysisViewer.tsx` **[P2]**

Either wire it into the verify page (its expandable 6-dimension panel is *better* than the current raw rendering — and the six dimensions are your "not a template" proof) or delete it. Recommend: wire into `/verify` below the data grid. **Effort:** 45 min.

---

# PART F — Demo, Submission, Narrative

## F1. Demo video (still missing) **[P0]**

`submission/video/links.md` is empty. Record **Friday during US market hours** (the only remaining window with a live market + live agent). Beats, ~2.5 min:

1. **0:00–0:20 — the problem, in VC language:** "Every AI financial signal you've ever seen is unverifiable by design. Winners get showcased, losers get deleted. We made deletion impossible."
2. **0:20–0:50 — the agent, live:** Railway logs streaming (heartbeat, Finnhub ticks) → a real >1% move → Claude analysis → Pinata pin → commit TX on the explorer. Narrate: "no human touched this."
3. **0:50–1:30 — the verify moment:** click Verify on the new signal → *hash recomputed in-browser, matches on-chain* (D2) → open the raw document on ipfs.io. "This reasoning is now permanent."
4. **1:30–2:00 — the track record:** E1 strip with real ✓/✗ across two trading days. "Including the misses. That's the product."
5. **2:00–2:30 — composability + business:** MockConsumer receiving callbacks + reading TSLA equity token; one line on the agent-economy thesis (AI track records as auditable as fund managers'); tracks: Robinhood Chain + Best Agentic.

## F2. proof.md / README refresh **[P1]**

- proof.md: v1.1 addresses, **autonomous** signal TXs flagged as such (`committed by the keeper with no human trigger — Railway logs timestamped`), resolution TXs, accuracy snapshot.
- README: Agent Status badge/line, "Try it as a judge" (no-wallet path first), testnet trust model (B1 NatSpec summary), D8 gating note, USDG note. Keep the em-dash rule and human-tone guidelines.

## F3. Narrative corrections (warroom debt) **[P1]**

- Drop "first ever"; claim precisely: *"a commit-reveal accountability primitive applied to AI reasoning — proof expiry, identity binding, sequence integrity, schema validation — with the analysis, not the trade, as the product."*
- Demote Bloomberg to one aside; lead with the **track-record thesis** (agents need auditable performance history; nothing provides it).
- Prepare the signals-#1–4 answer (if asked): "early keeper builds used a flawed CID derivation; the ledger preserves them because that's what immutability means — operators can't delete mistakes, including ours."

## F4. Submission logistics **[P0]**

- **Registration closes June 12 — confirm TODAY.**
- HackQuest fields: demo link, all contract addresses + network (46630), code explanation, sponsor tech (Alchemy RPC/WebSocket, Robinhood Chain equities, Anthropic, Pinata, Finnhub). Repo is public — no `engineering-AF` invite needed.
- Submit **Saturday June 13 night**, not Sunday — the deadline-day platform crush is a known killer, and nothing new can happen Sunday anyway (markets closed).

---

# Execution Order (3 days)

**Wed June 11 (today) — the autonomy day**
1. Decision: Path A vs B (time-box: if v1.1 not live by 18:00 WAT → Path B). 
2. Path A: B1–B9 → forge test → deploy v1.1 → wire env vars.
3. C5 + C6 (cheap, prevent bad signals) → **deploy keeper to Railway before 14:30 UTC market open** → C1 verified live.
4. C2, C3, C7, C8 as same-day keeper update.
5. D1 (CID fix) + redeploy Vercel → SampleSignals alive.
6. Confirm registration.

**Thu June 12 — the product day**
7. D2 (real verification) — the demo centerpiece.
8. E1 (track record hero), E2 (trigger %), E3 (agent status).
9. D3–D8 copy/UX sweep, C4 (grounded analyses — affects every signal from then on, do it early in the day), C9–C11.
10. Keeper runs all day → real signals + resolutions accumulate.

**Fri June 13 — the story day**
11. E4/E5 polish morning.
12. **Record demo video during market hours** (F1).
13. proof.md / README final (F2, F3). Livetest V3 regression run.
14. Submit Saturday night (F4).

**Total estimated effort:** ~16–18 focused hours. Everything above is shippable in the window; nothing requires research, only execution.

---

# Finding Index (37)

| # | Severity | Area | One-liner |
|---|---|---|---|
| A | P0 | Strategy | Redeploy decision gates everything — polluted ledger vs clean v1.1 |
| B1 | P0 | Contract | Permissionless resolveSignal with caller-supplied price — ledger griefable |
| B2 | P1 | Contract | No future-timestamp bound on proof expiry |
| B3 | P1 | Contract | direction never validated (7 passes, resolves as BEARISH) |
| B4 | P1 | Contract | Consumer callback lacks signalId/ticker — composability half-usable |
| B5 | P1 | Contract | MockConsumer callback spoofable (no access control) |
| B6 | P1 | Contract | "Monthly" subscription is eternal bool |
| B7 | P2 | Contract | "UNVERIFIED" warning in deployed source (USDG=6 now verified) |
| B8 | P2 | Contract | NEUTRAL band 0.1% granularity |
| B9 | — | Contract | Test additions for all of the above |
| C1 | P0 | Keeper | Never deployed — zero autonomous signals ever |
| C2 | P0 | Keeper | In-memory resolve queue — restarts strand signals (stranded #5–7) |
| C3 | P1 | Keeper | Terminal resolve errors retry forever |
| C4 | P0 | Keeper | Analyses hallucinate volume/levels — real data never injected |
| C5 | P0 | Keeper | Silent NEUTRAL default + truncation-prone ordering (scrambled directions) |
| C6 | P1 | Keeper | No failure cooldown — API hammering loop |
| C7 | P1 | Keeper | No WS heartbeat — half-open = silent agent |
| C8 | P1 | Infra | Railway ON_FAILURE×3 abandons the agent |
| C9 | P2 | Keeper | No fetch timeouts on IPFS path |
| C10 | P2 | Keeper | Storacha fallback cannot succeed — remove, fail loudly |
| C11 | P2 | Keeper | No SIGTERM handling |
| D1 | P0 | Frontend | CIDv0-only reconstruction breaks all Pinata-pinned signals (proven byte-equal) |
| D2 | P0 | Frontend | "Verified" without verifying — recompute hash in browser |
| D3 | P1 | Frontend | Dead "Subscribe to read it" pseudo-link |
| D4 | P1 | Frontend | Copy vs contract: 24h/12min, monthly/forever |
| D5 | P1 | Frontend | Legacy signals 1–4 unservable without cache backfill |
| D6 | P1 | Frontend | No USDG path — subscribe dead-ends |
| D7 | P2 | Frontend | SampleSignals empty-state vanishes after promising content |
| D8 | P2 | Frontend | Client-side gating — disclose as design |
| E1 | P1 | Design | Track record (the product) is the smallest number on the page |
| E2 | P1 | Design | Cards hide the trigger % move |
| E3 | P1 | Design | No proof-of-life for the agent on the page |
| E4 | P2 | Design | Contrast/size/density + explorer deep-links |
| E5 | P2 | Design | Orphaned AnalysisViewer — wire or delete |
| F1 | P0 | Submission | Demo video missing; must record Fri market hours |
| F2–F4 | P0/P1 | Submission | proof/README refresh, narrative corrections, registration TODAY |
