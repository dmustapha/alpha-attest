# PULSE — AlphaAttest Pipeline Rolling Context

## [livetest] 2026-06-09T12:00:00Z

**Status:** PASS
**Version:** V1
**Mode:** Hybrid (Web + Contract)
**URL / Program tested:** https://alpha-attest.vercel.app
**Results:** 14 PASS / 0 FAIL / 0 SKIP
**Test plan:** N/A (V1 first run)

**Regression:** First run

**Patch runs:** 3 (3 resolved, 0 remaining)
- P0-01: wagmi.ts MISSING_KEY fallback RPC → fixed to public Robinhood RPC, redeployed
- P0-02: NEXT_PUBLIC_ALCHEMY_RPC_URL had trailing `\n` from echo pipe → re-added with printf
- P0-03: All 3 contract address env vars had trailing `\n` → viem threw ContractFunctionExecutionError synchronously (no network request made) → re-added with printf, redeployed

**Critical issues (P0):** None (all resolved)

**For Next Skill (demo_rehearsal):**
- Overall livetest result: PASS
- P0 blockers: None
- P1 warnings to mention in demo: None
- Cross-integration proofs captured: 3 (SignalRegistry RPC calls, getSignal on verify, Pinata IPFS fingerprint)
- Screenshots taken: 6+ (in screenshots/livetest-*.png)
- Mobile: PASS (no horizontal scroll at 375px)

**Key env var lesson:** Never use `echo "value" | vercel env add`. Use `printf 'value' | vercel env add`. echo appends `\n` which embeds in the stored value and breaks viem address validation and URL parsing.

**Live state confirmed:**
- 4 signals on-chain (SignalRegistry)
- Accuracy: 100% (1/1 resolved)
- Latest: TSLA NEUTRAL $220.38 · Jun 9 2026
- Verify /verify/1: "Verified — This analysis is unchanged" (IPFS fingerprint match confirmed)

---

## [livetest] 2026-06-11T10:45:00Z

**Status:** WARN
**Version:** V2
**Mode:** Hybrid (Web + Contract)
**URL / Program tested:** https://alpha-attest.vercel.app | SignalRegistry 0x09522dB7...
**Results:** 44 PASS / 1 WARN / 0 FAIL / 6 SKIP (2 unit-verified, 4 source-verified)
**Test plan:** TESTING-PLAN.md — V1=14 | V2=29 | V3=8 | 1 CODE-REVIEW-ONLY | 4 design constraints

**Regression:** V1 14 PASS → V2 44 PASS + 1 WARN (SampleSignals IPFS cache gap). All V1 tests still passing.
**Patch runs:** 0
**Critical issues (P0):** None

**For Next Skill (demo_rehearsal):**
- Overall livetest result: WARN (no P0 blockers)
- P0 blockers: None
- P1 warnings to mention in demo: SampleSignals empty (IPFS cache gap for signals #2,#3), 3 console 404s from same cause
- Cross-integration proofs captured: 9 (Keeper→SignalRegistry, SignalRegistry→MockConsumer, Frontend→SignalRegistry, Frontend→IPFS, Keeper→Pinata, Keeper→Finnhub, Keeper→Claude, MockConsumer→TSLA ERC-20, EIP-712 signing)
- Screenshots taken: 4 (screenshots/livetest-v2-*.png)
- Mobile: PASS (scrollWidth=375 <= clientWidth=375)

**V2 exact value highlights:**
- signalCount=7, lastSequenceNumber=7, getAccuracyScore=(1,1)
- Signal #1: price=18938610000, direction=2(NEUTRAL), status=1(CORRECT), resolvedPrice=18945000000
- Resolve formula verified: movement=6390000, *1000/18938610000=0 (int div), 0<5=true
- SUBSCRIPTION_FEE=10000000, totalRevenue=0
- MockConsumer.signalCount=7, lastSignal.ipfsHash matches signal #7
- getDomainSeparator=0xfedc296e... (non-zero, EIP-712 active)
- All 8 adversarial tests PASS (boundary, zero address, URL edge cases, empty POST)

## [masterfix] 2026-06-12T01:30:00Z

**Status:** DAY-1 COMPLETE (autonomy day, executed overnight)
**Scope:** MASTERFIX.md Path A — contracts v1.1 + keeper C2-C11 + frontend D1-D8 + E1-E5

**Contracts v1.1 (B1-B9):** DEPLOYED
- SignalRegistry 0x23CD0368f1471de25E4F90f1bb2217E4Fc17bC56
- SubscriptionManager 0xf24d7B0481BCFEE1d8D9D7bF27368619A597eefF (timed 30-day, renewable)
- MockConsumer 0x4C92099fc1b242C7B21e66af78d60fa09db3f17c (registry-gated callbacks)
- All wiring TXs in submission/proof.md. 56/56 forge tests green (7 new v1.1 tests).
- Keeper-only resolveSignal w/ trust NatSpec, future-timestamp bound, direction
  validation, ISignalConsumer +signalId+ticker, 0.01% NEUTRAL band, USDG comment fixed.

**Keeper (C1-C11):** ALL FIXES IN, RUNNING LOCALLY (Railway blocked on login)
- C2 startup re-queue from chain (verified live: "[Recovery] Startup scan complete"),
  C3 terminal-revert drop, C4 real Finnhub quote+volume in prompt, C5 DIRECTION-first
  strict parse + max_tokens 4096 + 1 retry, C6 2-min failure cooldown, C7 WS ping/pong,
  C8 restartPolicy ALWAYS + 5-min heartbeat log, C9 15s fetch timeouts, C10 Storacha
  removed, C11 SIGTERM drain. Seed/precache scripts deleted (clean-ledger strategy).
- RUNNING: nohup + caffeinate, PID in keeper/keeper-local.log, Finnhub connected,
  watching v1.1 registry. Monitor armed on the log.

**Frontend (D1-D8, E1-E5):** BUILT, NOT YET DEPLOYED (Vercel blocked on login)
- D1 bytes32ToCidV1 proven byte-equal vs signal #7 digest (unit-tested);
  fetch chain v1 cache→ipfs.io→Pinata→legacy v0 w/ 8s timeouts
- D2 in-browser SHA-256 recompute vs on-chain bytes32, real mismatch state, both
  hashes displayed. D3 scroll button, D4 honest 12-min copy, D6 faucet note + judge
  path, D7 retry state, D8 disclosed in README/proof
- E1 TrackRecord hero strip (chips+accuracy+tagline), E2 trigger % on cards,
  E3 agent liveness line, E4 contrast/size + block deep-links, E5 six-dimension
  panels on /verify (AnalysisViewer deleted)
- Addresses hardcoded in lib/contracts.ts (env-var class of bugs eliminated)

**BLOCKERS (user action needed):**
1. `railway login` then keeper deploys to Railway (railway.json ready, ALWAYS policy)
2. `vercel login` then `vercel --prod` from frontend/ (build green locally)
3. Registration closes TODAY June 12 — confirm on HackQuest

**For Next Phase (Thu June 12):**
- Market opens 13:30 UTC. Keeper live locally; first >1% move = first autonomous
  v1.1 signal. Append TX hashes to proof.md AUTONOMOUS-TX-LOG as they land.
- After Vercel login: deploy frontend, verify /verify/<new> end-to-end.
- Friday: demo video during market hours (F1 beats in MASTERFIX).
