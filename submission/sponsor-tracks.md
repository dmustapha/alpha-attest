# AlphaAttest — Sponsor & Track Documentation

## Tracks

| Track | Competing? | Evidence |
|-------|-----------|----------|
| Open / General | YES | 3 deployed contracts, working frontend, on-chain provenance system |
| Best Agentic Project | YES | Autonomous Claude keeper — monitors prices, generates analysis, commits to chain without human intervention |
| Robinhood Chain | YES | All contracts deployed to Chain ID 46630; MockConsumer reads TSLA ERC-20; USDG subscription payments |

---

## Sponsor Technologies

### Robinhood Chain (PRIMARY — Chain ID 46630)

**Integration depth: DEEP**

- All 3 contracts deployed to Robinhood Chain Testnet
- **MockConsumer** reads live TSLA ERC-20 token (`0xC9f9c869...`) on every signal via `IERC20.balanceOf()`
- **SubscriptionManager** accepts USDG (`0x7E955252...`) — Robinhood Chain native stablecoin
- TSLA and AMZN equity price movements (>1%) trigger the keeper

### Alchemy

**Integration depth: MODERATE**

- RPC provider for Robinhood Chain Testnet
- Alchemy Notify webhook in `frontend/src/app/api/notify/route.ts` — HMAC-verified
- SSE stream propagates events to frontend in real time; 30s polling fallback

### OpenZeppelin (v5.x)

**Integration depth: DEEP**

- `EIP712` + `ECDSA` — keeper signature verified on-chain
- `Ownable` — access control across all contracts
- `IERC20` — reads Robinhood Chain TSLA equity balance in MockConsumer

### Anthropic Claude (claude-haiku-4-5)

**Integration depth: DEEP**

- `@anthropic-ai/sdk` — generates 400-1200 word structured financial analysis per signal
- 6-dimension output: price trend, volume, sector context, confidence, investment thesis, risk factors
- Analysis document is pinned to IPFS and cryptographically locked on-chain before publication

### Pinata IPFS

**Integration depth: MODERATE**

- Primary IPFS pin for every analysis document (Storacha as fallback)
- CIDv0 converted to `bytes32` SHA-256 digest for on-chain storage
- IPFS cache pre-seeded in `frontend/public/ipfs-cache/` for judge preview without gateway dependency

---

## On-Chain Proof

| Contract | Address |
|----------|---------|
| SignalRegistry | `0x09522dB7a983a675ba4E19BC9bc0896110b80C6A` |
| SubscriptionManager | `0x566BEAa729E8E1e6cde30446546279BD30e5630d` |
| MockConsumer | `0x6114270e211C2cd5542D9972caF6F0D51FbA7105` |
| Seed signal TX | `0x3895ed8b985ba5827bffb8e5c3e74db647d3a0783a689e2d26e16dd8153ce449` |

Explorer: https://explorer.testnet.chain.robinhood.com
