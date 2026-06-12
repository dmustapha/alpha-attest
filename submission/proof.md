# AlphaAttest — On-Chain Proof

## Network
- **Chain:** Robinhood Chain Testnet
- **Chain ID:** 46630
- **Explorer:** https://explorer.testnet.chain.robinhood.com

---

## v1.1 — Live Deployment (2026-06-11)

Deployed after a full security and correctness pass: keeper-gated resolution with a
documented trust model, future-timestamp bound, direction validation, registry-gated
consumer callbacks carrying signalId + ticker, timed 30-day subscriptions, and a
0.01%-granularity NEUTRAL band. 56 Foundry tests green at deploy.

| Contract | Address | Deploy Tx |
|----------|---------|-----------|
| SignalRegistry | `0x23CD0368f1471de25E4F90f1bb2217E4Fc17bC56` | [0x4917dc5f...](https://explorer.testnet.chain.robinhood.com/tx/0x4917dc5f2cd1c72965cb4eaeb3a1286b94aacc83eddd032c04e3cab33e77c7d8) |
| SubscriptionManager | `0xf24d7B0481BCFEE1d8D9D7bF27368619A597eefF` | [0xdccb5315...](https://explorer.testnet.chain.robinhood.com/tx/0xdccb5315dae15038f974f9e66c030e8caf69e6ca05de2801f35fd9d29502ce29) |
| MockConsumer | `0x4C92099fc1b242C7B21e66af78d60fa09db3f17c` | [0xb61b31a5...](https://explorer.testnet.chain.robinhood.com/tx/0xb61b31a55e230ef9a2c0d2ccd5908bd3acff0e69b345b31b4fdc5de1954c65da) |

### Post-Deploy Wiring

| Action | Tx Hash |
|--------|---------|
| registerConsumer(MockConsumer) | [0xfd6c2aa3...](https://explorer.testnet.chain.robinhood.com/tx/0xfd6c2aa387fb1c530bebfd15c678da02bb6ef00f25c2f25a3f7a0659b19007cf) |
| setSubscriptionManager(SubscriptionManager) | [0xc6443cbd...](https://explorer.testnet.chain.robinhood.com/tx/0xc6443cbd8c281efb1476caa60b032b97768f65a4047b7eac44eb8722df2cb6b0) |

### Autonomous Signals

Every signal on the v1.1 registry is committed by the keeper with no human trigger —
the keeper process watches Finnhub, generates the analysis, pins it, signs it, and
commits it end-to-end. Keeper logs are timestamped for cross-reference.

<!-- AUTONOMOUS-TX-LOG: append each autonomous commit + resolution TX here as they land -->

_This section fills as the live keeper trades through Thu June 12 and Fri June 13 US
market hours. Each entry: signal ID, ticker, direction, trigger move, commit TX,
resolution TX, outcome._

### Trust Model (testnet)

Signal resolution price is supplied by the keeper from the same Finnhub feed that
triggered the signal — Robinhood Chain testnet has no canonical price oracle to read
trustlessly. Keeper-only resolution beats a permissionless resolver here: an open
resolver with caller-supplied price would let anyone permanently falsify the ledger.
On mainnet this becomes an oracle read and loses the keeper trust assumption. The
full statement ships in the contract's NatSpec.

Subscription gating is client-side rendering on testnet: the analysis documents are
public by design — provenance, not secrecy, is the product. Production adds threshold
encryption (e.g., Lit) for paid content.

## Deployer
- **Address:** `0xDbBd125542077c82A9E1dFdf40a6fB5A7Cf1834C`

## Keeper
- **Address:** `0x87EFD628f0DffB1F5E33D0A958ce64435297c6d7`

## Integration Depth
- 3 contracts deployed and wired (SignalRegistry + SubscriptionManager + MockConsumer)
- Multi-contract orchestration: MockConsumer registered as ISignalConsumer (registry-gated
  callbacks), SubscriptionManager linked to registry
- MockConsumer reads on-chain Robinhood equity token (TSLA: `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`) on every signal
- EIP-712 typed signing — keeper signs off-chain, contract verifies on-chain
- USDG (`0x7E955252E15c84f5768B83c41a71F9eba181802F`, decimals()==6 verified on-chain) timed subscriptions
- In-browser verification: the frontend recomputes each document's SHA-256 via
  crypto.subtle and compares it to the on-chain bytes32 — verified is computed
  in the visitor's browser, not asserted by our server

---

## v1 — Superseded (deployment history)

The original deployment, kept on-chain as immutable history — operators can't delete
mistakes, including ours. Early keeper builds used a flawed CID derivation (raw SHA-256
instead of the Pinata CIDv1 digest) and demo seeding, so signals on this registry don't
all verify. The v1.1 registry starts clean and is fed exclusively by the live keeper.

| Contract | Address | Deploy Tx |
|----------|---------|-----------|
| SignalRegistry | `0x09522dB7a983a675ba4E19BC9bc0896110b80C6A` | [0xdd865d8f...](https://explorer.testnet.chain.robinhood.com/tx/0xdd865d8f3346bd4d6c335a64a814bcfa9b3c6ea327b6a5440be11190bdcb4a81) |
| SubscriptionManager | `0x566BEAa729E8E1e6cde30446546279BD30e5630d` | [0xcc09642d...](https://explorer.testnet.chain.robinhood.com/tx/0xcc09642dbcfaf05ca16d45d6b670a8c332241e88ff0e7726c1cf6ec47f258531) |
| MockConsumer | `0x6114270e211C2cd5542D9972caF6F0D51FbA7105` | [0x13b38749...](https://explorer.testnet.chain.robinhood.com/tx/0x13b38749a5b19199adfa8b4d2b708a86edf42e59a634ff2d25b0ef513f6f10d7) |

v1 wiring: registerConsumer [0x422e7323...](https://explorer.testnet.chain.robinhood.com/tx/0x422e73237488714b5afb849bd4f3db6a23ad953c206b8d12abf9599a93da91bb),
setSubscriptionManager [0x3047f862...](https://explorer.testnet.chain.robinhood.com/tx/0x3047f862c2b6d26e647921e3cb628601cda3e10c5c5d6223a1b40e5c1f770610).
7 signals committed (seed/demo era), e.g. #7 TSLA [0x51dd98d7...](https://explorer.testnet.chain.robinhood.com/tx/0x51dd98d7174976e1e86fa11f08cf2dfe22107d3599b6fcb8d39bd415a81f2920)
CID `bafkreibld4ow63qa4bvyadblcvy35sgvysf7trlyz2fben7ngndio44yi4`.
