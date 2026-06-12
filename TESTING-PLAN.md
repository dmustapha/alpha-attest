# Testing Plan -- AlphaAttest
**Source files read:** 30 | **Methods covered:** 23 across 5 services
**Tests:** V1=14 | V2=29 | V3=8 | Total=51
**Critical review:** complete (Phase 0D)

## Service Map
| Service | Method | Logic Type | Notes |
|---------|--------|-----------|-------|
| SignalRegistry | commitSignal | stateful+conditional | 4 invariants: keeper-only, proof expiry 300s, ticker TSLA/AMZN, seq gap; EIP-712 sig |
| SignalRegistry | resolveSignal | formulaic+conditional | NEUTRAL: movement*1000/price < 5; BULLISH/BEARISH: priceUp==predictedUp |
| SignalRegistry | registerConsumer | stateful | owner-only, uniqueness |
| SignalRegistry | setSubscriptionManager | stateful | owner-only |
| SignalRegistry | updateKeeper | stateful | owner-only |
| SignalRegistry | getSignal | functional | returns Signal struct |
| SignalRegistry | signalCount | functional | read-only |
| SignalRegistry | lastSequenceNumber | functional | read-only |
| SignalRegistry | getAccuracyScore | functional | returns (totalCorrect, totalResolved) |
| SignalRegistry | getDomainSeparator | functional | EIP-712 domain separator |
| SignalRegistry | getConsumers | functional | returns address[] |
| SubscriptionManager | subscribe | stateful | USDG transferFrom, AlreadySubscribed check |
| SubscriptionManager | cancelSubscription | stateful | NotSubscribed check |
| SubscriptionManager | isSubscriber | functional | read-only |
| SubscriptionManager | withdrawFees | stateful | owner-only |
| SubscriptionManager | SUBSCRIPTION_FEE | functional | constant 10*1e6 |
| MockConsumer | onSignalPublished | stateful | reads TSLA ERC-20 balance, increments count |
| MockConsumer | getLastSignal | functional | returns ReceivedSignal |
| MockConsumer | signalCount | functional | read-only |
| Frontend / | display+RPC | loads signalCount, signals list, accuracyScore |
| Frontend /verify/[id] | formulaic | bytes32ToCid, IPFS fetch, fingerprint comparison |
| Frontend /proof | display | static page, contract addresses |
| Frontend /api/notify | conditional | HMAC verification, SSE stream |

### Design Constraints
1. **Alchemy Notify DEGRADED** (route.ts:9-10): ALCHEMY_NOTIFY_SECRET is empty, so POST returns 503. SSE GET stays open indefinitely. Frontend uses wagmi watchContractEvent as primary real-time mechanism, not SSE.
2. **NEUTRAL resolve threshold** (SignalRegistry.sol:198): `movement * 1000 / originalPrice < 5` uses integer division. For very small movements relative to price, this can round to 0 and always pass. This is intentional Solidity integer math.
3. **Subscribe requires USDG** (SubscriptionManager.sol:47): subscribe() will revert if caller has no USDG balance or approval. No test wallet on testnet has USDG, so subscribe flow is CODE-REVIEW-ONLY.
4. **Headless wallet connect** (page.tsx:174): MetaMask inject() cannot complete in headless Playwright. Button presence is verifiable, full flow is not.

---

## V1 Foundation Plan

| ID | Method / Route | Input | Expected | Runability |
|----|---------------|-------|----------|-----------|
| TC-V1-SR-01 | SignalRegistry.signalCount() | none | >0 | LIVE |
| TC-V1-SR-02 | SignalRegistry.getSignal(1) | id=1 | returns valid Signal struct | LIVE |
| TC-V1-SR-03 | SignalRegistry.getAccuracyScore() | none | returns (uint256, uint256) | LIVE |
| TC-V1-SR-04 | SignalRegistry.getConsumers() | none | returns address[] | LIVE |
| TC-V1-SM-01 | SubscriptionManager.SUBSCRIPTION_FEE() | none | >0 | LIVE |
| TC-V1-SM-02 | SubscriptionManager.isSubscriber(random) | random addr | false | LIVE |
| TC-V1-MC-01 | MockConsumer.signalCount() | none | >0 | LIVE |
| TC-V1-MC-02 | MockConsumer.getLastSignal() | none | returns ReceivedSignal | LIVE |
| TC-V1-FE-01 | GET / | none | HTTP 200 | LIVE |
| TC-V1-FE-02 | GET /verify/1 | none | HTTP 200 | LIVE |
| TC-V1-FE-03 | GET /proof | none | HTTP 200 | LIVE |
| TC-V1-FE-04 | GET /api/notify | none | SSE stream opens | LIVE |
| TC-V1-FE-05 | Console errors (all pages) | none | 0 errors | LIVE |
| TC-V1-FE-06 | Mobile 375px | none | no horizontal overflow | LIVE |

---

## V2 Precision Plan

### TC-V2-SR-01: SignalRegistry.signalCount() -- exact value
**Setup:** 7 signals committed (seed + keeper runs)
**Input:** signalCount()
**Derivation:** Signals committed: #1 (seed), #2-#4 (keeper), #5-#7 (pre-cache from proof.md)
**Expected:** signalCount=7(expect 7)
**Runability:** LIVE

### TC-V2-SR-02: SignalRegistry.lastSequenceNumber() -- matches signalCount
**Setup:** sequential commits, no gaps
**Input:** lastSequenceNumber()
**Derivation:** Contract enforces sequenceNumber == lastSequenceNumber + 1 per commit. After 7 commits: lastSequenceNumber = 7
**Expected:** lastSequenceNumber=7(expect 7)
**Runability:** LIVE

### TC-V2-SR-03: SignalRegistry.getAccuracyScore() -- exact values
**Setup:** 1 signal resolved (signal #1 resolved as CORRECT)
**Input:** getAccuracyScore()
**Derivation:** totalCorrect=1, totalResolved=1
**Expected:** correct=1(expect 1), total=1(expect 1)
**Runability:** LIVE

### TC-V2-SR-04: SignalRegistry.keeper() -- exact address
**Input:** keeper()
**Expected:** keeper=0x87EFD628f0DffB1F5E33D0A958ce64435297c6d7(expect 0x87EFD628f0DffB1F5E33D0A958ce64435297c6d7)
**Runability:** LIVE

### TC-V2-SR-05: SignalRegistry.subscriptionManager() -- exact address
**Input:** subscriptionManager()
**Expected:** subscriptionManager=0x566BEAa729E8E1e6cde30446546279BD30e5630d(expect 0x566BEAa729E8E1e6cde30446546279BD30e5630d)
**Runability:** LIVE

### TC-V2-SR-06: SignalRegistry.getConsumers() -- MockConsumer registered
**Input:** getConsumers()
**Expected:** consumers=[0x6114270e211C2cd5542D9972caF6F0D51FbA7105](expect exactly 1 consumer, MockConsumer address)
**Runability:** LIVE

### TC-V2-SR-07: Signal #1 struct fields -- full decode
**Input:** getSignal(1)
**Derivation from seed-demo.ts:** TSLA, base_price=185.40, +2.15%, price=$189.39, direction=NEUTRAL(2)
  price: Math.round(189.3861 * 1e8) = 18938610000
  timestamp: unix seconds from seed run
  direction: 2 (NEUTRAL)
  sequenceNumber: 1
  ipfsHash: 0x5179d860ab5913760742902719a607af1c94b14c2e31aeec1627a3b71dc27393 (QmTphVahDTxxTcZv9Wc7UfKavuBZdxzi7xxpuwiW5kaRr2)
**Expected:** id=1, ticker="TSLA", price=18938610000, direction=2, sequenceNumber=1, status=1(CORRECT), ipfsHash=0x5179d860...
**Runability:** LIVE

### TC-V2-SR-08: Signal #1 resolve correctness -- formula verification
**Derivation from SignalRegistry.sol:192-198:**
  direction=2 (NEUTRAL)
  originalPrice=18938610000, resolvedPrice=18945000000
  movement = |18945000000 - 18938610000| = 6390000
  movement * 1000 = 6390000000
  6390000000 / 18938610000 = 0 (integer division)
  0 < 5 → correct = true → status = 1 (CORRECT)
**Expected:** status=1(expect 1=CORRECT), resolvedPrice=18945000000
**Runability:** LIVE (verify stored state matches derivation)

### TC-V2-SR-09: PROOF_EXPIRY_WINDOW constant
**Input:** PROOF_EXPIRY_WINDOW()
**Expected:** PROOF_EXPIRY_WINDOW=300(expect 300)
**Runability:** LIVE

### TC-V2-SR-10: RESOLVE_DELAY_BLOCKS constant
**Input:** RESOLVE_DELAY_BLOCKS()
**Expected:** RESOLVE_DELAY_BLOCKS=50(expect 50)
**Runability:** LIVE

### TC-V2-SM-01: SubscriptionManager.SUBSCRIPTION_FEE() -- exact value
**Derivation from SubscriptionManager.sol:19:** 10 * 1e6 = 10000000
**Expected:** SUBSCRIPTION_FEE=10000000(expect 10000000)
**Runability:** LIVE

### TC-V2-SM-02: SubscriptionManager.totalRevenue() -- zero (no subscribers)
**Derivation:** No subscribers on testnet → totalRevenue = 0
**Expected:** totalRevenue=0(expect 0)
**Runability:** LIVE

### TC-V2-SM-03: SubscriptionManager.isSubscriber(deployer) -- false
**Input:** isSubscriber(0xDbBd125542077c82A9E1dFdf40a6fB5A7Cf1834C)
**Expected:** isSubscriber=false(expect false)
**Runability:** LIVE

### TC-V2-SM-04: subscribe() flow -- requires USDG approval + balance (DESIGN CONSTRAINT)
**Behavior:** subscribe() calls transferFrom which reverts if caller has no USDG balance
**Root cause:** SubscriptionManager.sol:47 -- intentional ERC-20 gating
**This is intentional.** USDG payment is the access control mechanism.
**Expected:** Revert with PaymentFailed or ERC-20 insufficient allowance
**Runability:** CODE-REVIEW-ONLY (no test wallet with USDG on testnet)

### TC-V2-MC-01: MockConsumer.signalCount() -- matches SignalRegistry
**Derivation:** MockConsumer is registered as ISignalConsumer. onSignalPublished increments signalCount on every commitSignal. SignalRegistry.signalCount=7 → MockConsumer.signalCount=7
**Expected:** signalCount=7(expect 7)
**Runability:** LIVE

### TC-V2-MC-02: MockConsumer.TSLA_TOKEN() -- exact address
**Expected:** TSLA_TOKEN=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E(expect 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E)
**Runability:** LIVE

### TC-V2-MC-03: MockConsumer.getLastSignal() -- matches signal #7
**Derivation:** Last committed signal is #7 (latest). getLastSignal().ipfsHash should match getSignal(7).ipfsHash
**Expected:** lastSignal.ipfsHash == signals[7].ipfsHash, lastSignal.signalCount == 7 (internal counter matches)
**Runability:** LIVE

### TC-V2-SR-11: SignalRegistry.getDomainSeparator() -- non-zero
**Input:** getDomainSeparator()
**Derivation:** EIP-712 domain uses name="AlphaAttest", version="1", chainId=46630, verifyingContract=0x09522dB7... Domain separator is a keccak256 hash — deterministic but chain-dependent.
**Expected:** getDomainSeparator=non-zero bytes32 (0x != 0x0000...0000)
**Runability:** LIVE

### TC-V2-FE-01: Dashboard signal count display
**Input:** GET https://alpha-attest.vercel.app/
**Derivation:** signalCount=7. Dashboard shows "Signals Published" = {signals.length} after fetching all signals.
**Expected:** Text "7" visible in stats strip
**Runability:** LIVE

### TC-V2-FE-02: Dashboard accuracy display
**Input:** GET /
**Derivation:** getAccuracyScore returns (1,1). accuracyPct = Math.round(1*100/1) = 100
**Expected:** Text "100%" visible in accuracy stat
**Runability:** LIVE

### TC-V2-FE-03: Verify page /verify/1 -- fingerprint match
**Input:** GET /verify/1
**Derivation:** on-chain ipfsHash=0x5179d860... → bytes32ToCid → QmTphVahDTxxTcZv9Wc7UfKavuBZdxzi7xxpuwiW5kaRr2 → fetch from IPFS cache → status="verified"
**Expected:** "Verified" text visible, ipfsHash displayed, CID displayed
**Runability:** LIVE

### TC-V2-FE-04: Verify page price display -- exact computation
**Derivation:** signal.price=18938610000, Number(18938610000)/1e8 = 189.3861 → toFixed(2) = "189.39"
**Expected:** "$189.39" visible on verify page
**Runability:** LIVE

### TC-V2-FE-05: Verify page direction display
**Derivation:** signal.direction=2 → ["BULLISH","BEARISH","NEUTRAL"][2] = "NEUTRAL"
**Expected:** "NEUTRAL" text visible
**Runability:** LIVE

### TC-V2-FE-06: Verify page outcome display
**Derivation:** signal.status=1 → ["PENDING","CORRECT","INCORRECT"][1] = "CORRECT"
**Expected:** "CORRECT" text visible
**Runability:** LIVE

### TC-V2-FE-07: Proof page contract addresses
**Input:** GET /proof
**Derivation:** Contract addresses from env vars displayed in table
**Expected:** 0x09522dB7... (SignalRegistry), 0x566BEAa7... (SubscriptionManager), 0x6114270e... (MockConsumer) visible
**Runability:** LIVE

### TC-V2-FE-08: SampleSignals component -- loads pre-cached signals
**Input:** GET / (SampleSignals section)
**Derivation:** NEXT_PUBLIC_SAMPLE_SIGNAL_IDS=1,2,3,4 → loads first 3 (slice(0,3)). Each does getSignal() + IPFS fetch.
**Expected:** At least 1 sample card visible with ticker, direction, price
**Runability:** LIVE

### TC-V2-FE-09: Console errors on all routes -- zero tolerance
**Input:** Playwright console capture on /, /verify/1, /proof
**Expected:** 0 console.error across all pages
**Runability:** LIVE

### TC-V2-FE-10: Mobile responsive 375px -- no overflow
**Input:** Playwright viewport 375x812
**Expected:** scrollWidth <= clientWidth on all main routes
**Runability:** LIVE

---

## V3 Adversarial Plan

| ID | Type | Input | Expected | Runability |
|----|------|-------|----------|-----------|
| TC-V3-ADV-01 | Boundary | getSignal(0) | Returns zero-initialized struct (id=0) | LIVE |
| TC-V3-ADV-02 | Boundary | getSignal(999999) | Returns zero-initialized struct (id=0) | LIVE |
| TC-V3-ADV-03 | Error path | isSubscriber(address(0)) | false (zero address is not subscribed) | LIVE |
| TC-V3-ADV-04 | URL edge | GET /verify/0 | Renders error state or empty (no crash) | LIVE |
| TC-V3-ADV-05 | URL edge | GET /verify/abc | Renders error state (no crash) | LIVE |
| TC-V3-ADV-06 | URL edge | GET /verify/999999 | Renders error state (no crash) | LIVE |
| TC-V3-ADV-07 | Zero/empty | POST /api/notify with empty body | Returns error, no crash | LIVE |
| TC-V3-ADV-08 | Wrong caller | commitSignal from non-keeper | Reverts with NotKeeper() | UNIT-ONLY (test_commitSignalNotKeeperReverts) |

---

## Critical Review Findings

| # | Test ID | Issue | Action Taken |
|---|---------|-------|-------------|
| 1 | — | `getDomainSeparator()` had no test case in any tier | Added TC-V2-SR-11 (LIVE) |
| 2 | TC-V2-SR-08 | Re-derived resolve formula: movement=6390000, *1000=6390000000, /18938610000=0 (int div), 0<5=true=CORRECT | Confirmed — no change needed |
| 3 | TC-V2-FE-04 | Re-derived price: 18938610000/1e8=189.3861, toFixed(2)="189.39" | Confirmed — no change needed |
| 4 | TC-V2-FE-08 | Plan stated env var "1,2,3,4" but source default is "1,2,3". Either way slice(0,3) applies | Clarified — functionally correct |
| 5 | — | `registerConsumer`, `setSubscriptionManager`, `updateKeeper` are owner-only mutations requiring deployer key | Accepted as implicit CODE-REVIEW-ONLY — covered by proof.md TX hashes |
| 6 | — | `resolveSignal` live execution requires 50-block wait + keeper key | Accepted as CODE-REVIEW-ONLY — formula verified in TC-V2-SR-08 |

Critical review complete: 1 gap added | 0 derivation errors | 1 CODE-REVIEW-ONLY (TC-V2-SM-04) | 1 UNIT-ONLY (TC-V3-ADV-08) | 4 design constraints documented
