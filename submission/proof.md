# AlphaAttest — On-Chain Proof

## Network
- **Chain:** Robinhood Chain Testnet
- **Chain ID:** 46630
- **Explorer:** https://explorer.testnet.chain.robinhood.com

## Deployed Contracts

| Contract | Address | Deploy Tx |
|----------|---------|-----------|
| SignalRegistry | `0x09522dB7a983a675ba4E19BC9bc0896110b80C6A` | [0xdd865d8f...](https://explorer.testnet.chain.robinhood.com/tx/0xdd865d8f3346bd4d6c335a64a814bcfa9b3c6ea327b6a5440be11190bdcb4a81) |
| SubscriptionManager | `0x566BEAa729E8E1e6cde30446546279BD30e5630d` | [0xcc09642d...](https://explorer.testnet.chain.robinhood.com/tx/0xcc09642dbcfaf05ca16d45d6b670a8c332241e88ff0e7726c1cf6ec47f258531) |
| MockConsumer | `0x6114270e211C2cd5542D9972caF6F0D51FbA7105` | [0x13b38749...](https://explorer.testnet.chain.robinhood.com/tx/0x13b38749a5b19199adfa8b4d2b708a86edf42e59a634ff2d25b0ef513f6f10d7) |

## Post-Deploy Transactions

| Action | Tx Hash |
|--------|---------|
| registerConsumer(MockConsumer) | [0x422e7323...](https://explorer.testnet.chain.robinhood.com/tx/0x422e73237488714b5afb849bd4f3db6a23ad953c206b8d12abf9599a93da91bb) |
| setSubscriptionManager(SubscriptionManager) | [0x3047f862...](https://explorer.testnet.chain.robinhood.com/tx/0x3047f862c2b6d26e647921e3cb628601cda3e10c5c5d6223a1b40e5c1f770610) |

## Deployer
- **Address:** `0xDbBd125542077c82A9E1dFdf40a6fB5A7Cf1834C`

## Keeper
- **Address:** `0x87EFD628f0DffB1F5E33D0A958ce64435297c6d7`

## Live Signal (Seed Demo)

| Field | Value |
|-------|-------|
| Signal ID | `#1` |
| Tx hash | [0x3895ed8b...](https://explorer.testnet.chain.robinhood.com/tx/0x3895ed8b985ba5827bffb8e5c3e74db647d3a0783a689e2d26e16dd8153ce449) |
| IPFS CID | `QmTphVahDTxxTcZv9Wc7UfKavuBZdxzi7xxpuwiW5kaRr2` |
| bytes32 | `0x5179d860ab5913760742902719a607af1c94b14c2e31aeec1627a3b71dc27393` |
| Ticker | TSLA |
| Direction | NEUTRAL |
| Verify UI | [/verify/1](https://alpha-attest-piznb5xs0-damilolas-projects-fafdf859.vercel.app/verify/1) |

## Integration Depth: Gold
- 3 contracts deployed (SignalRegistry + SubscriptionManager + MockConsumer)
- Multi-contract orchestration: MockConsumer registered as ISignalConsumer, SubscriptionManager linked to registry
- MockConsumer reads on-chain Robinhood equity token (TSLA: `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`) on every signal
- EIP-712 typed signing — keeper signs off-chain, contract verifies on-chain
- USDG (`0x7E955252E15c84f5768B83c41a71F9eba181802F`) gated subscriptions
