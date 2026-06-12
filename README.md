# AlphaAttest

**AI trading signals with cryptographic accountability. Every call permanently locked on-chain before publication.**

Live demo: https://alpha-attest.vercel.app
Chain: Robinhood Chain Testnet (Chain ID 46630)
Hackathon: [Arbitrum Open House London: Online Buildathon](https://arbitrum-london.hackquest.io/buildathons/Arbitrum-Open-House-London-Online-Buildathon)

---

## The Problem

AI agents are starting to manage real money, but none of them have an auditable performance history. A fund manager has a track record regulators can check; an AI signal service can quietly delete its bad calls and showcase the winners. Every AI recommendation is unverifiable by design — the analysis could have been generated after the price moved, or edited after the fact, and you'd never know.

## The Solution

AlphaAttest is a commit-reveal accountability primitive applied to AI reasoning — proof expiry, identity binding, sequence integrity, and schema validation — with the analysis itself, not the trade, as the product:

1. A keeper watches TSLA and AMZN prices via Finnhub WebSocket
2. On any >1% price move, Claude generates a 400+ word analysis grounded in the live session quote
3. The analysis is uploaded to IPFS (content-addressed, immutable)
4. The IPFS hash is EIP-712 signed and committed to Robinhood Chain **before** the signal is published
5. Anyone can verify any signal at any time — the verify page recomputes the document's SHA-256 *in your browser* and compares it to the on-chain record

If the analysis was edited after publishing, even by one character, the fingerprints won't match. Misses are preserved forever. That's the point.

---

## Try It as a Judge (no wallet needed)

The full judge path requires nothing but a browser:

1. Open https://alpha-attest.vercel.app — the Track Record strip shows every call ever made, including the wrong ones, each chip linking to its proof.
2. Click **Verify** on any signal. Your own browser recomputes the document's SHA-256 and compares it against the on-chain bytes32 — the "Verified" badge is computed client-side, not asserted by our server.
3. Open the raw document on ipfs.io and the commit block on the explorer from the same page.

Subscribing (10 USDG / 30 days, on-chain timed) is only needed to read full analyses in the feed. Testnet USDG comes from the [Robinhood Chain faucet](https://faucet.testnet.chain.robinhood.com/); if the faucet only dispenses gas ETH, browsing and verifying still works for everything above.

---

## Live Contracts (Robinhood Chain Testnet)

| Contract | Address | Role |
|----------|---------|------|
| SignalRegistry v1.1 | [`0x23CD0368f1471de25E4F90f1bb2217E4Fc17bC56`](https://explorer.testnet.chain.robinhood.com/address/0x23CD0368f1471de25E4F90f1bb2217E4Fc17bC56) | Core accountability primitive |
| SubscriptionManager v1.1 | [`0xf24d7B0481BCFEE1d8D9D7bF27368619A597eefF`](https://explorer.testnet.chain.robinhood.com/address/0xf24d7B0481BCFEE1d8D9D7bF27368619A597eefF) | USDG-gated timed subscriptions (30 days, renewable) |
| MockConsumer v1.1 | [`0x4C92099fc1b242C7B21e66af78d60fa09db3f17c`](https://explorer.testnet.chain.robinhood.com/address/0x4C92099fc1b242C7B21e66af78d60fa09db3f17c) | ISignalConsumer composability demo |

**Deploy TX:** [0x4917dc5f...](https://explorer.testnet.chain.robinhood.com/tx/0x4917dc5f2cd1c72965cb4eaeb3a1286b94aacc83eddd032c04e3cab33e77c7d8) · v1 addresses preserved as deployment history in [submission/proof.md](submission/proof.md)

### Testnet trust model

Resolution prices are supplied by the keeper from the same Finnhub feed that triggered the signal — Robinhood Chain testnet has no canonical price oracle to read trustlessly, and an open resolver with caller-supplied prices would let anyone permanently falsify the ledger, so `resolveSignal` is keeper-only with the trade-off documented in the contract's NatSpec. On mainnet this becomes an oracle read and the trust assumption disappears.

One more honest note: on testnet, the subscription gates the rendered experience, not the documents. The analyses are public by design — provenance, not secrecy, is the product. Production would add threshold encryption (e.g., Lit) for paid content.

---

## How It Works

```
Finnhub WS (TSLA/AMZN price feed)
    ↓  >1% move detected
Keeper (Node.js)
    ↓  Claude haiku-4-5 generates 400+ word analysis
Pinata IPFS
    ↓  CID → bytes32 ipfsHash
EIP-712 Signer
    ↓  keeper signs payload
SignalRegistry.commitSignal()  [Robinhood Chain 46630]
    ↓  verifies 4 invariants + signature → stores Signal
MockConsumer.onSignalPublished()
    ↓  reads TSLA ERC-20 balance on Robinhood Chain
Frontend Dashboard
    ↓  any visitor can verify any signal's provenance
```

### SignalRegistry: 7 Features

1. **4 invariants**: ticker allowlist (TSLA/AMZN), proof expiry window (5 min), keeper identity binding, sequence gap detection
2. **EIP-712 signature verification**: keeper signs off-chain, contract verifies on-chain
3. **Accuracy ledger**: tracks CORRECT/INCORRECT outcomes after `resolveSignal()`
4. **ISignalConsumer callbacks**: any contract can register to receive new signals automatically
5. **IPFS hash storage**: `bytes32` SHA-256 digest of full analysis document
6. **SubscriptionManager integration**: USDG-gated access control
7. **MockConsumer**: reads live Robinhood Chain TSLA equity token price on every signal

---

## Integration Depth

| Sponsor | Integration | Depth |
|---------|-------------|-------|
| **Robinhood Chain** | 3 contracts deployed; MockConsumer reads TSLA ERC-20; USDG subscription payments | Deep |
| **Anthropic Claude** | claude-haiku-4-5 generates the analysis; system prompt tuned for financial signal generation | Deep |
| **OpenZeppelin** | EIP712, ECDSA, Ownable, IERC20 across all contracts | Deep |
| **Alchemy** | RPC provider + Notify webhook for real-time signal feed | Moderate |
| **Pinata IPFS** | Every analysis document pinned before its hash is committed on-chain | Moderate |
| **Finnhub** | Live trade stream (WebSocket w/ heartbeat) + session quotes grounding every analysis | Deep |

---

## Setup

### Prerequisites

- Node.js 20+
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
- Funded wallet on Robinhood Chain Testnet ([faucet](https://faucet.testnet.chain.robinhood.com/))

### Contracts (already deployed, read-only)

```bash
cd contracts
forge build
forge test
```

### Keeper

```bash
cd keeper
npm install
cp .env.example .env
# Fill in: FINNHUB_API_KEY, ANTHROPIC_API_KEY, PINATA_JWT, KEEPER_PRIVATE_KEY,
#          ALCHEMY_API_KEY, SIGNAL_REGISTRY_ADDRESS
npm start
```

On startup the keeper scans the registry and re-queues any still-pending signal — the chain itself is the durable resolve queue, so restarts lose nothing.

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# NEXT_PUBLIC_* values are pre-filled with deployed contract addresses
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Verification

Any signal can be independently verified, and the verification is real computation in the visitor's browser:

1. Visit `/verify/{signalId}` on the frontend
2. The page reads the `ipfsHash` from the on-chain Signal struct
3. Fetches the exact document bytes (local cache → ipfs.io → Pinata gateway)
4. Recomputes SHA-256 over those bytes via `crypto.subtle` and compares it to the on-chain bytes32 — both hashes are displayed side by side
5. Match = the analysis is unchanged since publication. A mismatch renders its own distinct failure state, because exposing tampering is the entire product.

Try it on the live demo: `/verify/1`

---

## Screenshots

![Dashboard](docs/images/dashboard.png)

![Verify Signal](docs/images/verify.png)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24, Foundry, OpenZeppelin 5.x |
| Keeper | Node.js 20, TypeScript, viem 2.x |
| AI | @anthropic-ai/sdk, claude-haiku-4-5 |
| Storage | Pinata IPFS |
| Frontend | Next.js 14, wagmi 2.x, viem 2.x |
| Chain | Robinhood Chain Testnet (Chain ID 46630) |
| RPC | Alchemy |

---

## Project Structure

```
AlphaAttest/
├── contracts/          # Solidity contracts + Foundry tests
│   └── src/
│       ├── SignalRegistry.sol      # Core accountability primitive
│       ├── SubscriptionManager.sol # USDG payment gating
│       └── MockConsumer.sol        # ISignalConsumer demo
├── keeper/             # Node.js keeper: watches prices, generates signals
│   └── src/
│       ├── clients/    # Finnhub, Anthropic, Pinata, Chain
│       └── orchestrator.ts
├── frontend/           # Next.js dashboard + verify UI
│   └── src/
│       ├── app/        # Pages (dashboard, verify, proof)
│       └── components/ # SignalCard, TrackRecord, SampleSignals
└── submission/         # Proof, links, sponsor track documentation
```
