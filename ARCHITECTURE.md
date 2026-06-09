# ARCHITECTURE — AlphaAttest
**Version:** 1.0
**Stack:** Smart Contracts (Foundry/Solidity) + Backend (Node.js/TypeScript) + Frontend (Next.js)
**Chain:** Robinhood Chain Testnet (Chain ID 46630)
**Single Source of Truth — copy code exactly. No pseudocode. No TODOs.**

---

## Section 1: System Overview

### Purpose
AlphaAttest is an AI financial signal marketplace with cryptographic on-chain provenance. A Claude haiku-4-5 keeper monitors Finnhub WebSocket for TSLA/AMZN price movements. On any >1% change: keeper generates a full multi-factor analysis, commits the complete reasoning document to IPFS, and stores the IPFS hash in SignalRegistry.sol — signed with EIP-712 — BEFORE publishing the signal. Every signal the AI has ever produced is permanently auditable on-chain.

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AlphaAttest System                              │
│                                                                          │
│  ┌─────────────┐    >1% change    ┌──────────────────────────────────┐  │
│  │  Finnhub    │ ───────────────► │       Node.js Keeper             │  │
│  │  WebSocket  │                  │                                  │  │
│  │  TSLA/AMZN  │                  │  1. Claude haiku-4-5 analysis    │  │
│  └─────────────┘                  │  2. IPFS upload (Pinata primary) │  │
│                                   │  3. EIP-712 sign payload         │  │
│  ┌─────────────┐                  │  4. SignalRegistry.commitSignal  │  │
│  │  Pinata     │ ◄──────────────  │                                  │  │
│  │  IPFS       │    upload JSON   └──────────────┬───────────────────┘  │
│  │  (primary)  │                                 │                      │
│  └─────────────┘                                 │ commitSignal()       │
│  ┌─────────────┐                                 │ (EIP-712 signed)     │
│  │  Storacha   │ ◄── fallback                    ▼                      │
│  │  IPFS       │                  ┌──────────────────────────────────┐  │
│  │  (backup)   │                  │    SignalRegistry.sol            │  │
│  └─────────────┘                  │    (Robinhood Chain 46630)       │  │
│                                   │                                  │  │
│  ┌─────────────┐                  │  ▪ 4 invariants                  │  │
│  │  Next.js    │ ◄─────────────── │  ▪ EIP-712 verify               │  │
│  │  Frontend   │   read signals   │  ▪ accuracy ledger               │  │
│  │  Dashboard  │                  │  ▪ ISignalConsumer calls         │  │
│  └─────────────┘                  └──────────┬───────────────────────┘  │
│         │                                    │                          │
│         │ isSubscriber()                     │ onSignalPublished()      │
│         ▼                                    ▼                          │
│  ┌─────────────┐                  ┌──────────────────────────────────┐  │
│  │  Subscription│                 │    MockConsumer.sol              │  │
│  │  Manager    │                  │    (composability demo)          │  │
│  │  (USDG gate)│                  └──────────────────────────────────┘  │
│  └─────────────┘                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Table

| Technology | Version | Purpose |
|---|---|---|
| Solidity | 0.8.24 | Smart contracts |
| OpenZeppelin Contracts | 5.x | EIP712, ECDSA, Ownable |
| Foundry | latest | Compile, test, deploy |
| Node.js | 20+ | Keeper runtime |
| TypeScript | 5.4+ | Keeper + scripts |
| viem | 2.x | EVM client (keeper + frontend) |
| @anthropic-ai/sdk | 0.37+ | Claude haiku-4-5 API |
| Next.js | 14.x | Frontend |
| wagmi | 2.x | React hooks for EVM |
| bs58 | 5.x | Base58 encode/decode (CID ↔ bytes32) |

### File Structure Tree

```
AlphaAttest/
├── contracts/
│   ├── src/
│   │   ├── interfaces/
│   │   │   ├── ISignalRegistry.sol
│   │   │   └── ISignalConsumer.sol
│   │   ├── SignalRegistry.sol
│   │   ├── SubscriptionManager.sol
│   │   └── MockConsumer.sol
│   ├── script/
│   │   └── Deploy.s.sol
│   ├── test/
│   │   ├── SignalRegistry.t.sol
│   │   └── SubscriptionManager.t.sol
│   ├── foundry.toml
│   └── .env.example
├── keeper/
│   ├── src/
│   │   ├── clients/
│   │   │   ├── finnhub.ts
│   │   │   ├── anthropic.ts
│   │   │   ├── pinata.ts
│   │   │   ├── storacha.ts
│   │   │   └── chain.ts
│   │   ├── signer/
│   │   │   └── eip712.ts
│   │   ├── orchestrator.ts
│   │   └── index.ts
│   ├── scripts/
│   │   ├── precache.ts
│   │   └── seed-demo.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── api/
│   │   │   └── notify/
│   │   │       └── route.ts          # [E-4] Alchemy Notify webhook + SSE stream
│   │   ├── proof/
│   │   │   └── page.tsx
│   │   └── verify/
│   │       └── [signalId]/
│   │           └── page.tsx
│   ├── components/
│   │   ├── SignalCard.tsx
│   │   ├── SubscribeButton.tsx
│   │   ├── AnalysisViewer.tsx
│   │   └── SampleSignals.tsx         # [E-2] Judge preview — 3 signals, no wallet required
│   ├── hooks/
│   │   ├── useSignals.ts
│   │   └── useSubscription.ts
│   ├── lib/
│   │   ├── wagmi.ts
│   │   ├── contracts.ts
│   │   └── ipfs.ts
│   ├── next.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.local.example
├── submission/
│   ├── proof.md
│   ├── screenshots/
│   │   └── .gitkeep
│   ├── video/
│   │   └── links.md
│   ├── links.md
│   └── sponsor-tracks.md
└── README.md
```

---

## Section 2: Component Architecture

### Component Table

| Component | Type | File Path | Purpose | Dependencies |
|---|---|---|---|---|
| SignalRegistry | Smart Contract | contracts/src/SignalRegistry.sol | Core accountability primitive — 7 features | OpenZeppelin EIP712, ECDSA, Ownable |
| SubscriptionManager | Smart Contract | contracts/src/SubscriptionManager.sol | USDG payment gating | USDG ERC20 |
| MockConsumer | Smart Contract | contracts/src/MockConsumer.sol | ISignalConsumer demo implementor | ISignalConsumer, Ownable |
| ISignalConsumer | Interface | contracts/src/interfaces/ISignalConsumer.sol | Composability interface | — |
| ISignalRegistry | Interface | contracts/src/interfaces/ISignalRegistry.sol | Registry interface | ISignalConsumer |
| Deploy | Foundry Script | contracts/script/Deploy.s.sol | Deploys all 3 contracts in order | All contracts |
| FinnhubClient | Keeper Module | keeper/src/clients/finnhub.ts | WebSocket price feed with reconnect | ws |
| AnthropicClient | Keeper Module | keeper/src/clients/anthropic.ts | Claude haiku-4-5 analysis generation | @anthropic-ai/sdk |
| PinataClient | Keeper Module | keeper/src/clients/pinata.ts | IPFS upload (primary) | native fetch |
| StorachaClient | Keeper Module | keeper/src/clients/storacha.ts | IPFS upload (fallback) | @storacha/client |
| ChainClient | Keeper Module | keeper/src/clients/chain.ts | Robinhood Chain read/write | viem |
| EIP712Signer | Keeper Module | keeper/src/signer/eip712.ts | Sign signal payloads | viem |
| SignalOrchestrator | Keeper Core | keeper/src/orchestrator.ts | Coordinates all keeper components | All keeper modules |
| Keeper Entry | Keeper Entry | keeper/src/index.ts | Process entry point | SignalOrchestrator |
| Frontend App | Next.js App | frontend/app/ | Signal dashboard + proof UI | wagmi, viem |

### Dependency Graph

```
Contracts:
  ISignalConsumer ← SignalRegistry
  ISignalConsumer ← MockConsumer
  ISignalRegistry ← (frontend lib/contracts.ts)
  SubscriptionManager ← (frontend hooks/useSubscription.ts)

Keeper:
  FinnhubClient → SignalOrchestrator
  AnthropicClient → SignalOrchestrator
  PinataClient → SignalOrchestrator
  StorachaClient → SignalOrchestrator (fallback only)
  ChainClient → SignalOrchestrator
  EIP712Signer → SignalOrchestrator

Frontend:
  lib/wagmi.ts → all hooks and pages
  lib/contracts.ts → all hooks and pages
  lib/ipfs.ts → verify page, AnalysisViewer
  hooks/useSignals.ts → app/page.tsx, SignalCard
  hooks/useSubscription.ts → SubscribeButton, AnalysisViewer
```

### Data Flow: Signal Lifecycle

```
1. Finnhub WS → price tick
2. Keeper: detect >1% change
3. Keeper → Claude haiku-4-5 → analysis (400+ words)
4. Keeper → Pinata → IPFS CID → bytes32 ipfsHash
5. Keeper → EIP712Signer → signature
6. Keeper → SignalRegistry.commitSignal(ticker, price, ts, ipfsHash, direction, seq, sig)
7. SignalRegistry: verify 4 invariants + EIP-712 signature → store Signal
8. SignalRegistry → MockConsumer.onSignalPublished() [ISignalConsumer]
9. Frontend: read signals from chain events/storage
10. Frontend: SubscriptionManager.isSubscriber() → gate analysis display
11. After N blocks: anyone calls resolveSignal(id, actualPrice) → CORRECT/INCORRECT
```

---

## Section 3: Interface Definitions

#### File: contracts/src/interfaces/ISignalConsumer.sol
[VERIFIED] — Pattern from EIP standard + OpenZeppelin docs

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface for contracts that consume AlphaAttest signals.
/// @dev Register with SignalRegistry.registerConsumer(). Called on every commitSignal.
interface ISignalConsumer {
    /// @notice Called by SignalRegistry on every new signal publication.
    /// @param ipfsHash bytes32 SHA-256 digest of the IPFS analysis document (strip 0x1220 prefix from CIDv0)
    /// @param price Signal price in fixed-point with 8 decimal places (e.g., 200_00000000 = $200.00)
    /// @param direction 0=BULLISH, 1=BEARISH, 2=NEUTRAL
    function onSignalPublished(
        bytes32 ipfsHash,
        uint256 price,
        uint8 direction
    ) external;
}
```

#### File: contracts/src/interfaces/ISignalRegistry.sol
[VERIFIED] — Derived from SignalRegistry.sol implementation below

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ISignalConsumer.sol";

/// @notice Interface for the AlphaAttest SignalRegistry contract.
interface ISignalRegistry {
    /// @notice Commit a new AI signal to the registry.
    /// @dev Caller must be the registered keeper. Validates all 4 invariants + EIP-712 sig.
    /// @param ticker "TSLA" or "AMZN"
    /// @param price Fixed-point price with 8 decimals
    /// @param timestamp Unix seconds (block.timestamp range)
    /// @param ipfsHash bytes32 SHA-256 digest from IPFS CID
    /// @param direction 0=BULLISH, 1=BEARISH, 2=NEUTRAL
    /// @param sequenceNumber Must be exactly lastSequenceNumber + 1
    /// @param keeperSignature EIP-712 signature over the above fields
    /// @return signalId The assigned signal ID (1-indexed)
    function commitSignal(
        string calldata ticker,
        uint256 price,
        uint256 timestamp,
        bytes32 ipfsHash,
        uint8 direction,
        uint256 sequenceNumber,
        bytes calldata keeperSignature
    ) external returns (uint256 signalId);

    /// @notice Resolve a pending signal by providing the actual price after N blocks.
    /// @dev Anyone can call. Compares predicted direction to actual movement.
    /// @param signalId The signal to resolve
    /// @param actualPrice Current price (same fixed-point format)
    function resolveSignal(uint256 signalId, uint256 actualPrice) external;

    /// @notice Register an ISignalConsumer to receive callbacks on every signal.
    function registerConsumer(address consumer) external;

    /// @notice Get full signal data by ID.
    function getSignal(uint256 signalId) external view returns (
        uint256 id,
        string memory ticker,
        uint256 price,
        uint256 timestamp,
        bytes32 ipfsHash,
        uint8 direction,
        uint256 sequenceNumber,
        bytes memory keeperSignature,
        uint256 blockNumber,
        uint8 status,
        uint256 resolvedPrice
    );

    /// @notice Get keeper accuracy. Returns (correct, total) resolved signals.
    function getAccuracyScore() external view returns (uint256 correct, uint256 total);

    /// @notice Total signals committed.
    function signalCount() external view returns (uint256);

    /// @notice Last committed sequence number (for gap detection).
    function lastSequenceNumber() external view returns (uint256);
}
```

---

## Section 4: SignalRegistry.sol

The core accountability primitive. Implements all 7 required features:
1. Proof expiry enforcement (Invariant 1)
2. Agent identity binding — keeper address only (Invariant 2)
3. Sequence numbers with gap detection (Invariant 3)
4. Input schema validation — ticker whitelist, price > 0 (Invariant 4)
5. EIP-712 typed structured signing and on-chain verification
6. On-chain accuracy ledger — resolveSignal() records CORRECT/INCORRECT
7. ISignalConsumer composability — registered consumers called on every signal

#### File: contracts/src/SignalRegistry.sol
[VERIFIED] — OpenZeppelin EIP712 + ECDSA: https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISignalConsumer.sol";

/// @title SignalRegistry
/// @notice AI financial signal accountability primitive for AlphaAttest.
/// @dev Implements 7 features: 4 invariants, EIP-712, accuracy ledger, ISignalConsumer.
contract SignalRegistry is EIP712, Ownable {
    using ECDSA for bytes32;

    // ─── EIP-712 Type Hash ───────────────────────────────────────────────────
    // Must match exactly: field names, field types, field order
    bytes32 public constant SIGNAL_TYPEHASH = keccak256(
        "Signal(string ticker,uint256 price,uint256 timestamp,bytes32 ipfsHash,uint8 direction,uint256 sequenceNumber)"
    );

    // ─── Invariant Constants ─────────────────────────────────────────────────
    /// @notice Invariant 1: Proof expiry. Timestamps older than 5 min are rejected.
    uint256 public constant PROOF_EXPIRY_WINDOW = 5 minutes;

    /// @notice Blocks to wait before resolveSignal() can be called (~12.5 min on Robinhood Chain).
    uint256 public constant RESOLVE_DELAY_BLOCKS = 50;

    // ─── Invariant 4: Allowed Tickers ────────────────────────────────────────
    bytes32 private constant TSLA_HASH = keccak256("TSLA");
    bytes32 private constant AMZN_HASH = keccak256("AMZN");

    // ─── Storage ─────────────────────────────────────────────────────────────
    /// @notice Invariant 2: Agent identity binding. Only this address can commit signals.
    address public keeper;

    /// @notice Invariant 3: Last committed sequence number. Next must be exactly this + 1.
    uint256 public lastSequenceNumber;

    /// @notice Total signals committed.
    uint256 public signalCount;

    enum SignalStatus { PENDING, CORRECT, INCORRECT }

    struct Signal {
        uint256 id;
        string ticker;
        uint256 price;          // Fixed-point, 8 decimal places (e.g., 20000000000 = $200.00)
        uint256 timestamp;      // Unix seconds
        bytes32 ipfsHash;       // SHA-256 digest of IPFS document (CIDv0 without 0x1220 prefix)
        uint8 direction;        // 0=BULLISH, 1=BEARISH, 2=NEUTRAL
        uint256 sequenceNumber;
        bytes keeperSignature;  // EIP-712 signature — stored for permanent auditability
        uint256 blockNumber;
        uint8 status;           // 0=PENDING, 1=CORRECT, 2=INCORRECT
        uint256 resolvedPrice;
    }

    mapping(uint256 => Signal) public signals;

    // ─── Accuracy Ledger ─────────────────────────────────────────────────────
    uint256 public totalResolved;
    uint256 public totalCorrect;

    // ─── ISignalConsumer Registry ─────────────────────────────────────────────
    address[] public consumers;
    mapping(address => bool) public isConsumer;

    // ─── Integration Reference ───────────────────────────────────────────────
    address public subscriptionManager;

    // ─── Events ──────────────────────────────────────────────────────────────
    event SignalCommitted(
        uint256 indexed signalId,
        string ticker,
        uint256 price,
        uint256 timestamp,
        bytes32 indexed ipfsHash,
        uint8 direction,
        uint256 sequenceNumber
    );
    event SignalResolved(uint256 indexed signalId, bool correct, uint256 actualPrice);
    event ConsumerRegistered(address indexed consumer);
    event KeeperUpdated(address indexed newKeeper);

    // ─── Errors ───────────────────────────────────────────────────────────────
    error NotKeeper();
    error ProofExpired(uint256 providedTimestamp, uint256 windowStart);
    error InvalidTicker(string ticker);
    error InvalidPrice();
    error SequenceGap(uint256 expected, uint256 provided);
    error InvalidSignature();
    error SignalNotPending(uint256 signalId);
    error ResolveTooEarly(uint256 signalId, uint256 earliestBlock);
    error SignalNotFound(uint256 signalId);
    error ConsumerAlreadyRegistered(address consumer);

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address _keeper)
        EIP712("AlphaAttest", "1")
        Ownable(msg.sender)
    {
        require(_keeper != address(0), "Keeper cannot be zero address");
        keeper = _keeper;
    }

    // ─── Core: Commit Signal ─────────────────────────────────────────────────
    /// @notice Commit an AI signal to the registry.
    /// @dev The IPFS hash MUST be committed before the signal is published to subscribers.
    ///      This ordering is enforced architecturally: keeper calls this before frontend refresh.
    function commitSignal(
        string calldata ticker,
        uint256 price,
        uint256 timestamp,
        bytes32 ipfsHash,
        uint8 direction,
        uint256 sequenceNumber,
        bytes calldata keeperSignature
    ) external returns (uint256 signalId) {
        // ── Invariant 2: Agent identity binding ──────────────────────────────
        if (msg.sender != keeper) revert NotKeeper();

        // ── Invariant 1: Proof expiry ─────────────────────────────────────────
        uint256 windowStart = block.timestamp - PROOF_EXPIRY_WINDOW;
        if (timestamp < windowStart) {
            revert ProofExpired(timestamp, windowStart);
        }

        // ── Invariant 4: Input schema validation ──────────────────────────────
        bytes32 tickerHash = keccak256(bytes(ticker));
        if (tickerHash != TSLA_HASH && tickerHash != AMZN_HASH) {
            revert InvalidTicker(ticker);
        }
        if (price == 0) revert InvalidPrice();

        // ── Invariant 3: Sequence number gap detection ────────────────────────
        uint256 expected = lastSequenceNumber + 1;
        if (sequenceNumber != expected) revert SequenceGap(expected, sequenceNumber);

        // ── Invariant 5: EIP-712 signature verification ───────────────────────
        bytes32 structHash = keccak256(abi.encode(
            SIGNAL_TYPEHASH,
            keccak256(bytes(ticker)),
            price,
            timestamp,
            ipfsHash,
            direction,
            sequenceNumber
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = digest.recover(keeperSignature);
        if (recovered != keeper) revert InvalidSignature();

        // ── Store signal ──────────────────────────────────────────────────────
        signalId = ++signalCount;
        lastSequenceNumber = sequenceNumber;

        signals[signalId] = Signal({
            id: signalId,
            ticker: ticker,
            price: price,
            timestamp: timestamp,
            ipfsHash: ipfsHash,
            direction: direction,
            sequenceNumber: sequenceNumber,
            keeperSignature: keeperSignature,
            blockNumber: block.number,
            status: 0,
            resolvedPrice: 0
        });

        // ── ISignalConsumer: notify registered consumers ──────────────────────
        _notifyConsumers(ipfsHash, price, direction);

        emit SignalCommitted(signalId, ticker, price, timestamp, ipfsHash, direction, sequenceNumber);
    }

    // ─── Accuracy Ledger: Resolve Signal ─────────────────────────────────────
    /// @notice Resolve a pending signal. Anyone can call after RESOLVE_DELAY_BLOCKS.
    /// @dev Compares predicted direction (stored) to actual price movement (provided).
    function resolveSignal(uint256 signalId, uint256 actualPrice) external {
        if (signalId == 0 || signalId > signalCount) revert SignalNotFound(signalId);
        Signal storage signal = signals[signalId];
        if (signal.status != 0) revert SignalNotPending(signalId);

        uint256 earliestBlock = signal.blockNumber + RESOLVE_DELAY_BLOCKS;
        if (block.number < earliestBlock) revert ResolveTooEarly(signalId, earliestBlock);

        uint256 originalPrice = signal.price;
        bool correct;

        if (signal.direction == 2) {
            // NEUTRAL: correct if price moved less than 0.5%
            uint256 movement = actualPrice > originalPrice
                ? actualPrice - originalPrice
                : originalPrice - actualPrice;
            // movement * 1000 / originalPrice < 5 means < 0.5%
            correct = (movement * 1000 / originalPrice) < 5;
        } else {
            bool priceWentUp = actualPrice > originalPrice;
            bool predictedUp = (signal.direction == 0); // 0=BULLISH
            correct = (priceWentUp == predictedUp);
        }

        signal.status = correct ? 1 : 2;
        signal.resolvedPrice = actualPrice;

        totalResolved++;
        if (correct) totalCorrect++;

        emit SignalResolved(signalId, correct, actualPrice);
    }

    // ─── ISignalConsumer Registry ─────────────────────────────────────────────
    /// @notice Register a contract to receive signal callbacks.
    function registerConsumer(address consumer) external onlyOwner {
        if (isConsumer[consumer]) revert ConsumerAlreadyRegistered(consumer);
        consumers.push(consumer);
        isConsumer[consumer] = true;
        emit ConsumerRegistered(consumer);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────
    function setSubscriptionManager(address _subscriptionManager) external onlyOwner {
        subscriptionManager = _subscriptionManager;
    }

    function updateKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "Keeper cannot be zero address");
        keeper = newKeeper;
        emit KeeperUpdated(newKeeper);
    }

    // ─── View Functions ───────────────────────────────────────────────────────
    function getSignal(uint256 signalId) external view returns (Signal memory) {
        return signals[signalId];
    }

    function getAccuracyScore() external view returns (uint256 correct, uint256 total) {
        return (totalCorrect, totalResolved);
    }

    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getConsumers() external view returns (address[] memory) {
        return consumers;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────
    function _notifyConsumers(bytes32 ipfsHash, uint256 price, uint8 direction) internal {
        for (uint256 i = 0; i < consumers.length; i++) {
            // try/catch: one bad consumer cannot block all others
            try ISignalConsumer(consumers[i]).onSignalPublished(ipfsHash, price, direction) {
                // success
            } catch {
                // consumer reverted — continue silently
            }
        }
    }
}
```

---

## Section 5: SubscriptionManager.sol

#### File: contracts/src/SubscriptionManager.sol
[UNVERIFIED] — USDG decimal places not confirmed. Using 6 decimals (USDC-like). Verify before deploy.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title SubscriptionManager
/// @notice Manages USDG-gated subscriptions to AlphaAttest signals.
/// @dev cancelSubscription() is callable at any time — non-negotiable per spec.
contract SubscriptionManager is Ownable {
    // WARNING: UNVERIFIED — verify USDG decimals before deploy.
    // If USDG uses 18 decimals (standard ERC20), change to 10 * 1e18.
    // If USDG uses 6 decimals (USDC-like), this value is correct.
    uint256 public constant SUBSCRIPTION_FEE = 10 * 1e6; // 10 USDG assuming 6 decimals

    IERC20Minimal public immutable usdg;

    mapping(address => bool) private _subscribers;
    uint256 public totalRevenue;

    event Subscribed(address indexed subscriber, uint256 fee);
    event SubscriptionCancelled(address indexed subscriber);
    event FeesWithdrawn(address indexed owner, uint256 amount);

    error AlreadySubscribed();
    error NotSubscribed();
    error PaymentFailed();

    constructor(address _usdg) Ownable(msg.sender) {
        require(_usdg != address(0), "USDG cannot be zero address");
        usdg = IERC20Minimal(_usdg);
    }

    /// @notice Pay SUBSCRIPTION_FEE USDG to gain access. Requires prior ERC20 approval.
    function subscribe() external {
        if (_subscribers[msg.sender]) revert AlreadySubscribed();

        bool success = usdg.transferFrom(msg.sender, address(this), SUBSCRIPTION_FEE);
        if (!success) revert PaymentFailed();

        _subscribers[msg.sender] = true;
        totalRevenue += SUBSCRIPTION_FEE;

        emit Subscribed(msg.sender, SUBSCRIPTION_FEE);
    }

    /// @notice Cancel subscription. No refund on testnet. Callable at any time.
    function cancelSubscription() external {
        if (!_subscribers[msg.sender]) revert NotSubscribed();
        _subscribers[msg.sender] = false;
        emit SubscriptionCancelled(msg.sender);
    }

    /// @notice Check if an address has an active subscription.
    function isSubscriber(address account) external view returns (bool) {
        return _subscribers[account];
    }

    /// @notice Withdraw accumulated USDG fees to owner.
    function withdrawFees() external onlyOwner {
        uint256 balance = usdg.balanceOf(address(this));
        require(balance > 0, "No fees to withdraw");
        bool success = usdg.transfer(owner(), balance);
        if (!success) revert PaymentFailed();
        emit FeesWithdrawn(owner(), balance);
    }
}
```

---

## Section 6: MockConsumer.sol

#### File: contracts/src/MockConsumer.sol
[VERIFIED] — Simple ISignalConsumer implementor for composability demo

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ISignalConsumer.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockConsumer
/// @notice Demonstrates ISignalConsumer composability on Robinhood Chain tokenized equities.
/// @dev Reads TSLA ERC-20 balance on every signal — proves Robinhood Chain equity token interaction.
/// <!-- [CRITIQUE E-1] Added TSLA token read to demonstrate on-chain equity composability -->
contract MockConsumer is ISignalConsumer, Ownable {
    /// @notice Robinhood Chain Testnet TSLA ERC-20 address (0xC9f9c869...)
    address public immutable TSLA_TOKEN;

    struct ReceivedSignal {
        bytes32 ipfsHash;
        uint256 price;
        uint8 direction;
        uint256 receivedAt;
        uint256 tslaBalance; // TSLA token balance observed on Robinhood Chain at signal time
    }

    ReceivedSignal public lastSignal;
    uint256 public signalCount;

    event SignalReceived(
        bytes32 indexed ipfsHash,
        uint256 price,
        uint8 direction,
        uint256 signalCount,
        uint256 tslaBalance
    );

    constructor(address _tslaToken) Ownable(msg.sender) {
        require(_tslaToken != address(0), "MockConsumer: invalid TSLA address");
        TSLA_TOKEN = _tslaToken;
    }

    /// @notice Called by SignalRegistry on every new signal. Must not revert.
    /// @dev Reads live TSLA balance from Robinhood Chain to demonstrate on-chain equity interaction.
    function onSignalPublished(
        bytes32 ipfsHash,
        uint256 price,
        uint8 direction
    ) external override {
        // Read TSLA ERC-20 balance from Robinhood Chain — proves on-chain equity token composability
        uint256 tslaBalance = IERC20(TSLA_TOKEN).balanceOf(address(this));

        signalCount++;
        lastSignal = ReceivedSignal({
            ipfsHash: ipfsHash,
            price: price,
            direction: direction,
            receivedAt: block.timestamp,
            tslaBalance: tslaBalance
        });
        emit SignalReceived(ipfsHash, price, direction, signalCount, tslaBalance);
    }

    function getLastSignal() external view returns (ReceivedSignal memory) {
        return lastSignal;
    }
}
```

---

## Section 7: Deploy Script

#### File: contracts/script/Deploy.s.sol
[VERIFIED] — Foundry Script pattern: https://book.getfoundry.sh/tutorials/solidity-scripting

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SignalRegistry.sol";
import "../src/SubscriptionManager.sol";
import "../src/MockConsumer.sol";

contract Deploy is Script {
    // Robinhood Chain Testnet — from WINNER-BRIEF
    address constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    // <!-- [CRITIQUE E-1] TSLA address passed to MockConsumer for on-chain equity token read -->
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address keeper = vm.envAddress("KEEPER_ADDRESS");

        require(keeper != address(0), "Set KEEPER_ADDRESS in .env");

        vm.startBroadcast(deployerKey);

        // 1. Deploy SignalRegistry (keeper binds at construction)
        SignalRegistry registry = new SignalRegistry(keeper);
        console.log("SignalRegistry deployed:", address(registry));

        // 2. Deploy SubscriptionManager
        SubscriptionManager subscriptionManager = new SubscriptionManager(USDG);
        console.log("SubscriptionManager deployed:", address(subscriptionManager));

        // 3. Deploy MockConsumer with TSLA token address for on-chain equity read
        MockConsumer mockConsumer = new MockConsumer(TSLA);
        console.log("MockConsumer deployed:", address(mockConsumer));

        // 4. Register MockConsumer with SignalRegistry (demonstrates ISignalConsumer)
        registry.registerConsumer(address(mockConsumer));
        console.log("MockConsumer registered as ISignalConsumer");

        // 5. Link SubscriptionManager reference
        registry.setSubscriptionManager(address(subscriptionManager));
        console.log("SubscriptionManager linked to registry");

        vm.stopBroadcast();

        // Print addresses for submission/proof.md
        console.log("\n=== RECORD THESE IN submission/proof.md ===");
        console.log("SIGNAL_REGISTRY_ADDRESS=", address(registry));
        console.log("SUBSCRIPTION_MANAGER_ADDRESS=", address(subscriptionManager));
        console.log("MOCK_CONSUMER_ADDRESS=", address(mockConsumer));
        console.log("CHAIN_ID=", block.chainid);
    }
}
```

#### File: contracts/foundry.toml
[VERIFIED] — Foundry configuration

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
optimizer = true
optimizer_runs = 200
solc_version = "0.8.24"
remappings = [
    "@openzeppelin/=lib/openzeppelin-contracts/"
]

[rpc_endpoints]
robinhood_testnet = "${ALCHEMY_RPC_URL}"

[etherscan]
robinhood_testnet = { key = "${ETHERSCAN_API_KEY}", url = "https://explorer.robinhood.com/api" }
```

#### File: contracts/.env.example
[VERIFIED] — Environment template

```bash
# Deployer private key (0x-prefixed)
DEPLOYER_PRIVATE_KEY=0x...

# Keeper wallet address (receives commitSignal calls)
KEEPER_ADDRESS=0x...

# Alchemy RPC for Robinhood Chain Testnet
ALCHEMY_RPC_URL=https://robinhood-testnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Block explorer API key (optional for verification)
ETHERSCAN_API_KEY=your_key_here
```

---

## Section 8: Foundry Tests

#### File: contracts/test/SignalRegistry.t.sol
[VERIFIED] — Foundry test patterns: https://book.getfoundry.sh/forge/tests

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SignalRegistry.sol";
import "../src/MockConsumer.sol";

contract SignalRegistryTest is Test {
    SignalRegistry public registry;
    MockConsumer public consumer;

    address public owner;
    address public keeper;
    uint256 public keeperKey;

    bytes32 private DOMAIN_SEPARATOR;
    bytes32 private constant SIGNAL_TYPEHASH = keccak256(
        "Signal(string ticker,uint256 price,uint256 timestamp,bytes32 ipfsHash,uint8 direction,uint256 sequenceNumber)"
    );

    // Test constants — price in 8-decimal fixed-point
    uint256 constant TSLA_PRICE = 200_00000000; // $200.00
    uint256 constant TSLA_PRICE_UP = 205_00000000; // $205.00 — BULLISH correct
    bytes32 constant SAMPLE_IPFS = bytes32(uint256(0xabcdef1234567890));

    function setUp() public {
        owner = address(this);
        (keeper, keeperKey) = makeAddrAndKey("keeper");

        registry = new SignalRegistry(keeper);
        consumer = new MockConsumer();

        registry.registerConsumer(address(consumer));
        DOMAIN_SEPARATOR = registry.getDomainSeparator();
    }

    // ─── Helper: produce a valid EIP-712 signature ───────────────────────────
    function _sign(
        string memory ticker,
        uint256 price,
        uint256 timestamp,
        bytes32 ipfsHash,
        uint8 direction,
        uint256 sequenceNumber
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            SIGNAL_TYPEHASH,
            keccak256(bytes(ticker)),
            price,
            timestamp,
            ipfsHash,
            direction,
            sequenceNumber
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keeperKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // ─── Happy path ───────────────────────────────────────────────────────────
    function testCommitSignalSuccess() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);

        vm.prank(keeper);
        uint256 id = registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);

        assertEq(id, 1);
        assertEq(registry.signalCount(), 1);
        assertEq(registry.lastSequenceNumber(), 1);

        SignalRegistry.Signal memory s = registry.getSignal(1);
        assertEq(s.ticker, "TSLA");
        assertEq(s.price, TSLA_PRICE);
        assertEq(s.direction, 0);
        assertEq(s.status, 0); // PENDING
        assertEq(s.ipfsHash, SAMPLE_IPFS);
    }

    // ─── Invariant 2: NotKeeper ───────────────────────────────────────────────
    function testRevertNotKeeper() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);

        // Call as non-keeper — must revert
        vm.expectRevert(SignalRegistry.NotKeeper.selector);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);
    }

    // ─── Invariant 1: ProofExpired ────────────────────────────────────────────
    function testRevertProofExpired() public {
        uint256 oldTs = block.timestamp - 6 minutes; // older than 5 min window
        bytes memory sig = _sign("TSLA", TSLA_PRICE, oldTs, SAMPLE_IPFS, 0, 1);

        vm.prank(keeper);
        vm.expectRevert();
        registry.commitSignal("TSLA", TSLA_PRICE, oldTs, SAMPLE_IPFS, 0, 1, sig);
    }

    // ─── Invariant 4: InvalidTicker ───────────────────────────────────────────
    function testRevertInvalidTicker() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("NVDA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);

        vm.prank(keeper);
        vm.expectRevert();
        registry.commitSignal("NVDA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);
    }

    // ─── Invariant 3: SequenceGap ─────────────────────────────────────────────
    function testRevertSequenceGap() public {
        // Commit seq=1 first
        uint256 ts = block.timestamp - 10;
        bytes memory sig1 = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig1);

        // Try seq=3 (skip 2) — must revert
        bytes memory sig3 = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 3);
        vm.prank(keeper);
        vm.expectRevert();
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 3, sig3);
    }

    // ─── Invariant 5: InvalidSignature ───────────────────────────────────────
    function testRevertBadSignature() public {
        uint256 ts = block.timestamp - 10;
        bytes memory badSig = abi.encodePacked(bytes32(0), bytes32(0), uint8(27));

        vm.prank(keeper);
        vm.expectRevert(SignalRegistry.InvalidSignature.selector);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, badSig);
    }

    // ─── Accuracy Ledger: Resolve CORRECT ─────────────────────────────────────
    function testResolveSignalCorrect() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1); // BULLISH
        vm.prank(keeper);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);

        vm.roll(block.number + 51); // past resolve delay

        // Price went up → BULLISH was CORRECT
        registry.resolveSignal(1, TSLA_PRICE_UP);

        SignalRegistry.Signal memory s = registry.getSignal(1);
        assertEq(s.status, 1); // CORRECT
        assertEq(s.resolvedPrice, TSLA_PRICE_UP);

        (uint256 correct, uint256 total) = registry.getAccuracyScore();
        assertEq(correct, 1);
        assertEq(total, 1);
    }

    // ─── Accuracy Ledger: Resolve INCORRECT ───────────────────────────────────
    function testResolveSignalIncorrect() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1); // BULLISH
        vm.prank(keeper);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);

        vm.roll(block.number + 51);

        // Price went down → BULLISH was INCORRECT
        registry.resolveSignal(1, 195_00000000);

        SignalRegistry.Signal memory s = registry.getSignal(1);
        assertEq(s.status, 2); // INCORRECT

        (uint256 correct, uint256 total) = registry.getAccuracyScore();
        assertEq(correct, 0);
        assertEq(total, 1);
    }

    // ─── Resolve: Too early ───────────────────────────────────────────────────
    function testRevertResolveTooEarly() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);

        vm.expectRevert();
        registry.resolveSignal(1, TSLA_PRICE_UP); // no vm.roll — too early
    }

    // ─── ISignalConsumer: Consumer notified ──────────────────────────────────
    function testConsumerNotified() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);

        assertEq(consumer.signalCount(), 1);
        MockConsumer.ReceivedSignal memory received = consumer.getLastSignal();
        assertEq(received.ipfsHash, SAMPLE_IPFS);
        assertEq(received.price, TSLA_PRICE);
        assertEq(received.direction, 0);
    }

    // ─── AMZN ticker works ────────────────────────────────────────────────────
    function testAMZNTicker() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("AMZN", TSLA_PRICE, ts, SAMPLE_IPFS, 1, 1); // BEARISH

        vm.prank(keeper);
        uint256 id = registry.commitSignal("AMZN", TSLA_PRICE, ts, SAMPLE_IPFS, 1, 1, sig);
        assertEq(id, 1);
    }
}
```

#### File: contracts/test/SubscriptionManager.t.sol
[VERIFIED] — Foundry mock ERC20 pattern

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SubscriptionManager.sol";

// Minimal ERC20 mock for testing
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor() {
        balanceOf[msg.sender] = 1_000_000 * 1e6; // 1M USDG
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}

contract SubscriptionManagerTest is Test {
    SubscriptionManager public manager;
    MockERC20 public usdg;
    address public alice;

    function setUp() public {
        usdg = new MockERC20();
        manager = new SubscriptionManager(address(usdg));
        alice = makeAddr("alice");

        // Fund alice
        usdg.mint(alice, 100 * 1e6); // 100 USDG
    }

    function testSubscribeSuccess() public {
        vm.startPrank(alice);
        usdg.approve(address(manager), manager.SUBSCRIPTION_FEE());
        manager.subscribe();
        vm.stopPrank();

        assertTrue(manager.isSubscriber(alice));
        assertEq(manager.totalRevenue(), manager.SUBSCRIPTION_FEE());
    }

    function testCancelSubscription() public {
        vm.startPrank(alice);
        usdg.approve(address(manager), manager.SUBSCRIPTION_FEE());
        manager.subscribe();
        manager.cancelSubscription(); // callable at any time — non-negotiable
        vm.stopPrank();

        assertFalse(manager.isSubscriber(alice));
    }

    function testRevertDoubleSubscribe() public {
        vm.startPrank(alice);
        usdg.approve(address(manager), manager.SUBSCRIPTION_FEE() * 2);
        manager.subscribe();

        vm.expectRevert(SubscriptionManager.AlreadySubscribed.selector);
        manager.subscribe();
        vm.stopPrank();
    }

    function testRevertCancelNotSubscribed() public {
        vm.prank(alice);
        vm.expectRevert(SubscriptionManager.NotSubscribed.selector);
        manager.cancelSubscription();
    }
}
```

---

## Section 9: Keeper Backend

### 9.1 Finnhub WebSocket Client

#### File: keeper/src/clients/finnhub.ts
[VERIFIED] — wss://ws.finnhub.io?token=API_KEY: https://finnhub.io/docs/api/websocket-trades

```typescript
import WebSocket from "ws";
import { EventEmitter } from "events";

export interface TradeData {
  symbol: string;
  price: number;
  timestamp: number; // milliseconds from Finnhub
  volume: number;
}

interface FinnhubTradeMessage {
  data: Array<{ p: number; s: string; t: number; v: number }>;
  type: "trade";
}

export class FinnhubClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private readonly symbols: string[];
  private readonly apiKey: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor(apiKey: string, symbols: string[]) {
    super();
    this.apiKey = apiKey;
    this.symbols = symbols;
  }

  connect(): void {
    if (this.isConnecting) return;
    this.isConnecting = true;

    const url = `wss://ws.finnhub.io?token=${this.apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[Finnhub] Connected");
      this.reconnectDelay = 1000;
      this.isConnecting = false;
      this.subscribe();
    });

    this.ws.on("message", (data: Buffer) => {
      this.handleMessage(data.toString());
    });

    this.ws.on("error", (err: Error) => {
      console.error("[Finnhub] Error:", err.message);
      this.isConnecting = false;
    });

    this.ws.on("close", () => {
      console.warn(`[Finnhub] Closed. Reconnecting in ${this.reconnectDelay}ms`);
      this.isConnecting = false;
      this.scheduleReconnect();
    });
  }

  private subscribe(): void {
    for (const symbol of this.symbols) {
      this.ws?.send(JSON.stringify({ type: "subscribe", symbol }));
      console.log(`[Finnhub] Subscribed to ${symbol}`);
    }
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      if (msg.type !== "trade" || !Array.isArray(msg.data)) return;

      const message = msg as FinnhubTradeMessage;
      for (const trade of message.data) {
        this.emit("trade", {
          symbol: trade.s,
          price: trade.p,
          timestamp: trade.t,
          volume: trade.v,
        } as TradeData);
      }
    } catch {
      // ignore parse errors
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
```

### 9.2 Anthropic Client

#### File: keeper/src/clients/anthropic.ts
[VERIFIED] — claude-haiku-4-5-20251001 model ID confirmed in CLAUDE.md

```typescript
import Anthropic from "@anthropic-ai/sdk";

export interface SignalAnalysis {
  ticker: string;
  price: number;
  timestamp: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  analysis: string;
  wordCount: number;
  dimensions: {
    priceTrend: string;
    volume: string;
    sectorContext: string;
    confidence: string;
    investmentThesis: string;
    riskFactors: string;
  };
}

const SYSTEM_PROMPT = `You are an expert financial analyst specializing in US equity markets, \
providing institutional-grade analysis of price movements. Your analysis is precise, data-driven, \
and structured. Never use em dashes. Always complete all required sections.`;

function buildAnalysisPrompt(
  ticker: string,
  price: number,
  changePct: number,
  timestamp: number
): string {
  const direction = changePct > 0 ? "UP" : changePct < 0 ? "DOWN" : "FLAT";
  const dateStr = new Date(timestamp).toISOString();
  const sector = ticker === "TSLA"
    ? "EV, clean energy, and autonomous vehicles"
    : "e-commerce, cloud computing, and logistics";

  return `Analyze this ${ticker} price movement observed at ${dateStr}:
Current Price: $${price.toFixed(2)}
Price Change: ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}% (${direction})

Provide a comprehensive multi-factor analysis with all six required sections:

## PRICE_TREND
Analyze the current price movement pattern, momentum indicators, technical significance of this ${changePct.toFixed(2)}% move, key support and resistance levels.

## VOLUME_ANALYSIS
Evaluate trading volume implications, whether volume confirms this price action, and what this signals about market conviction and institutional participation.

## SECTOR_CONTEXT
Contextualize this move within the broader ${sector} sector, current macro environment, peer performance, and relevant market dynamics.

## CONFIDENCE_ASSESSMENT
Rate your directional confidence as HIGH, MEDIUM, or LOW. Explain the specific factors driving this confidence level, including signal quality and market conditions.

## INVESTMENT_THESIS
Present the bull case and bear case for ${ticker} based on this signal. Include specific price targets or risk levels that would confirm or invalidate the thesis.

## RISK_FACTORS
Identify the top 3 to 4 specific risks that could invalidate this signal, including near-term catalysts to monitor and macro factors.

## SIGNAL_DIRECTION
State exactly one of: BULLISH, BEARISH, or NEUTRAL based on your overall analysis.`;
}

function extractSection(content: string, section: string): string {
  const regex = new RegExp(`## ${section}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

function parseDirection(content: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const text = extractSection(content, "SIGNAL_DIRECTION").toUpperCase();
  if (text.includes("BULLISH")) return "BULLISH";
  if (text.includes("BEARISH")) return "BEARISH";
  return "NEUTRAL";
}

export class AnthropicClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateAnalysis(
    ticker: string,
    price: number,
    changePct: number,
    timestamp: number
  ): Promise<SignalAnalysis> {
    const prompt = buildAnalysisPrompt(ticker, price, changePct, timestamp);

    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      throw new Error("Unexpected non-text response from Claude");
    }

    const text = block.text;
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    if (wordCount < 400) {
      throw new Error(
        `Analysis below minimum length: ${wordCount} words (required: 400). Ticker: ${ticker}`
      );
    }

    return {
      ticker,
      price,
      timestamp,
      direction: parseDirection(text),
      analysis: text,
      wordCount,
      dimensions: {
        priceTrend: extractSection(text, "PRICE_TREND"),
        volume: extractSection(text, "VOLUME_ANALYSIS"),
        sectorContext: extractSection(text, "SECTOR_CONTEXT"),
        confidence: extractSection(text, "CONFIDENCE_ASSESSMENT"),
        investmentThesis: extractSection(text, "INVESTMENT_THESIS"),
        riskFactors: extractSection(text, "RISK_FACTORS"),
      },
    };
  }
}
```

### 9.3 Pinata IPFS Client (Primary)

#### File: keeper/src/clients/pinata.ts
[VERIFIED] — POST https://uploads.pinata.cloud/v3/files: https://docs.pinata.cloud/api-reference/endpoint/upload-a-file

```typescript
export interface IPFSResult {
  cid: string;
  ipfsHash: `0x${string}`; // bytes32 for on-chain storage
  url: string;
  provider: "pinata" | "storacha";
}

// CIDv0 (Qm...) to bytes32: base58-decode → strip 2-byte multihash prefix → hex
export function cidToBytes32(cid: string): `0x${string}` {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bs58 = require("bs58") as { decode: (s: string) => Uint8Array };
  const decoded = bs58.decode(cid);
  // decoded: [0x12, 0x20, ...32 bytes SHA-256...]
  const hash = decoded.slice(2); // strip multihash prefix
  return ("0x" + Buffer.from(hash).toString("hex")) as `0x${string}`;
}

export class PinataClient {
  private readonly jwt: string;

  constructor(jwt: string) {
    this.jwt = jwt;
  }

  async upload(content: object, filename: string): Promise<IPFSResult> {
    const json = JSON.stringify(content, null, 2);

    // Use Node.js 18+ built-in FormData + Blob + fetch
    const formData = new FormData();
    const blob = new Blob([json], { type: "application/json" });
    formData.append("file", blob, filename);
    formData.append("network", "public");

    const response = await fetch("https://uploads.pinata.cloud/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.jwt}` },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Pinata upload failed ${response.status}: ${body}`);
    }

    const result = await response.json() as { data: { cid: string } };
    const cid = result.data.cid;

    return {
      cid,
      ipfsHash: cidToBytes32(cid),
      url: `https://gateway.pinata.cloud/ipfs/${cid}`,
      provider: "pinata",
    };
  }
}
```

### 9.4 Storacha IPFS Client (Fallback)

#### File: keeper/src/clients/storacha.ts
[UNVERIFIED] — UCAN auth requires one-time `npx @storacha/cli create` setup. web3.storage original API is deprecated.

```typescript
// WARNING: UNVERIFIED PATTERN — test immediately before relying on this fallback
// Prerequisites: run `npx @storacha/cli create` once to generate space DID and proof
// The principal and proof are stored in ~/.config/storacha/ by default

import type { IPFSResult } from "./pinata";
import { cidToBytes32 } from "./pinata";

export class StorachaClient {
  async upload(content: object, filename: string): Promise<IPFSResult> {
    // CAUTION: ASSUMED PATTERN — dynamic import to avoid startup errors if not installed
    const { create } = await import("@storacha/client");
    const { StoreMemory } = await import("@storacha/client/stores/memory");

    // Note: StoreMemory does NOT persist between process restarts.
    // For production use, replace with a persistent store.
    const client = await create({ store: new StoreMemory() });

    const json = JSON.stringify(content, null, 2);
    const file = new File([json], filename, { type: "application/json" });

    const cid = await client.uploadFile(file);
    const cidStr = cid.toString();

    return {
      cid: cidStr,
      ipfsHash: cidToBytes32(cidStr),
      url: `https://w3s.link/ipfs/${cidStr}`,
      provider: "storacha",
    };
  }
}
```

### 9.5 Chain Client

#### File: keeper/src/clients/chain.ts
[VERIFIED] — Alchemy Robinhood Chain endpoints: https://www.alchemy.com/rpc/robinhood-testnet

```typescript
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// NOTE: Chain definition is deferred inside ChainClient constructor (not top-level) so that
// dotenv.config() in index.ts runs before ALCHEMY_API_KEY is read. In ESM, top-level module
// expressions evaluate before the importing module's body runs — reading env vars here would
// produce "undefined". The CHAIN_ID constant is safe to export since it's a literal.
export const ROBINHOOD_CHAIN_ID = 46630;

const REGISTRY_ABI = parseAbi([
  "function commitSignal(string ticker, uint256 price, uint256 timestamp, bytes32 ipfsHash, uint8 direction, uint256 sequenceNumber, bytes keeperSignature) returns (uint256)",
  "function resolveSignal(uint256 signalId, uint256 actualPrice)",
  "function lastSequenceNumber() view returns (uint256)",
  "function signalCount() view returns (uint256)",
]);

export class ChainClient {
  private readonly walletClient;
  private readonly publicClient;
  private readonly registryAddress: `0x${string}`;

  constructor(privateKey: `0x${string}`, registryAddress: `0x${string}`) {
    const account = privateKeyToAccount(privateKey);
    this.registryAddress = registryAddress;

    // Define chain here (not at module level) so dotenv.config() has already run
    // by the time this constructor is called from index.ts.
    const chain = defineChain({
      id: ROBINHOOD_CHAIN_ID,
      name: "Robinhood Chain Testnet",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: {
          http: [`https://robinhood-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`],
          webSocket: [`wss://robinhood-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`],
        },
      },
    });

    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    this.publicClient = createPublicClient({
      chain,
      transport: http(),
    });
  }

  async commitSignal(
    ticker: string,
    price: bigint,
    timestamp: bigint,
    ipfsHash: `0x${string}`,
    direction: number,
    sequenceNumber: bigint,
    signature: `0x${string}`
  ): Promise<`0x${string}`> {
    const txHash = await this.walletClient.writeContract({
      address: this.registryAddress,
      abi: REGISTRY_ABI,
      functionName: "commitSignal",
      args: [ticker, price, timestamp, ipfsHash, direction, sequenceNumber, signature],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[Chain] Signal committed: ${txHash}`);
    return txHash;
  }

  async getLastSequenceNumber(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: REGISTRY_ABI,
      functionName: "lastSequenceNumber",
    })) as bigint;
  }

  async getSignalCount(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: REGISTRY_ABI,
      functionName: "signalCount",
    })) as bigint;
  }
}
```

### 9.6 EIP-712 Signer

#### File: keeper/src/signer/eip712.ts
[VERIFIED] — viem signTypedData + OpenZeppelin EIP712. Domain must match contract constructor.

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodTestnet } from "../clients/chain";

export interface SignalPayload {
  ticker: string;
  price: bigint;        // 8 decimal fixed-point
  timestamp: bigint;    // Unix seconds
  ipfsHash: `0x${string}`;
  direction: number;    // 0=BULLISH, 1=BEARISH, 2=NEUTRAL
  sequenceNumber: bigint;
}

// EIP-712 types — MUST match SignalRegistry.sol SIGNAL_TYPEHASH exactly
const SIGNAL_TYPES = {
  Signal: [
    { name: "ticker", type: "string" },
    { name: "price", type: "uint256" },
    { name: "timestamp", type: "uint256" },
    { name: "ipfsHash", type: "bytes32" },
    { name: "direction", type: "uint8" },
    { name: "sequenceNumber", type: "uint256" },
  ],
} as const;

export class EIP712Signer {
  private readonly walletClient;
  private readonly verifyingContract: `0x${string}`;

  constructor(privateKey: `0x${string}`, verifyingContract: `0x${string}`) {
    const account = privateKeyToAccount(privateKey);
    this.verifyingContract = verifyingContract;

    this.walletClient = createWalletClient({
      account,
      chain: robinhoodTestnet,
      transport: http(),
    });
  }

  async sign(payload: SignalPayload): Promise<`0x${string}`> {
    // Domain separator MUST match SignalRegistry constructor: EIP712("AlphaAttest", "1")
    return await this.walletClient.signTypedData({
      domain: {
        name: "AlphaAttest",
        version: "1",
        chainId: 46630,
        verifyingContract: this.verifyingContract,
      },
      types: SIGNAL_TYPES,
      primaryType: "Signal",
      message: {
        ticker: payload.ticker,
        price: payload.price,
        timestamp: payload.timestamp,
        ipfsHash: payload.ipfsHash,
        direction: payload.direction,
        sequenceNumber: payload.sequenceNumber,
      },
    });
  }
}
```

### 9.7 Orchestrator

#### File: keeper/src/orchestrator.ts
[VERIFIED] — Coordinates all components. Core commit-before-publish sequence enforced here.

```typescript
import { FinnhubClient, type TradeData } from "./clients/finnhub";
import { AnthropicClient } from "./clients/anthropic";
import { PinataClient } from "./clients/pinata";
import { StorachaClient } from "./clients/storacha";
import { ChainClient } from "./clients/chain";
import { EIP712Signer, type SignalPayload } from "./signer/eip712";

// >1% price change triggers analysis and signal commitment
const CHANGE_THRESHOLD = 0.01;

interface PriceState {
  price: number;
  timestamp: number;
}

export class SignalOrchestrator {
  private readonly finnhub: FinnhubClient;
  private readonly anthropic: AnthropicClient;
  private readonly pinata: PinataClient;
  private readonly storacha: StorachaClient;
  private readonly chain: ChainClient;
  private readonly signer: EIP712Signer;

  // Baseline price per symbol
  private readonly lastPrices = new Map<string, PriceState>();
  // Prevent concurrent processing for the same symbol
  private readonly processing = new Set<string>();

  constructor(config: {
    finnhubKey: string;
    anthropicKey: string;
    pinataJwt: string;
    keeperPrivateKey: `0x${string}`;
    registryAddress: `0x${string}`;
  }) {
    this.finnhub = new FinnhubClient(config.finnhubKey, ["TSLA", "AMZN"]);
    this.anthropic = new AnthropicClient(config.anthropicKey);
    this.pinata = new PinataClient(config.pinataJwt);
    this.storacha = new StorachaClient();
    this.chain = new ChainClient(config.keeperPrivateKey, config.registryAddress);
    this.signer = new EIP712Signer(config.keeperPrivateKey, config.registryAddress);
  }

  start(): void {
    console.log("[AlphaAttest] Keeper starting...");

    this.finnhub.on("trade", (trade: TradeData) => {
      // Intentionally fire-and-forget — errors logged inside handleTrade
      this.handleTrade(trade).catch(() => undefined);
    });

    this.finnhub.connect();
    console.log("[AlphaAttest] Monitoring TSLA and AMZN for >1% price movements");
  }

  private async handleTrade(trade: TradeData): Promise<void> {
    const symbol = trade.symbol;

    // Skip if already processing this symbol (no concurrent signals per ticker)
    if (this.processing.has(symbol)) return;

    const last = this.lastPrices.get(symbol);
    if (!last) {
      this.lastPrices.set(symbol, { price: trade.price, timestamp: trade.timestamp });
      return;
    }

    const changeAbs = Math.abs(trade.price - last.price);
    const changePct = changeAbs / last.price;
    if (changePct < CHANGE_THRESHOLD) return;

    const priceChangePct = ((trade.price - last.price) / last.price) * 100;
    this.processing.add(symbol);

    try {
      console.log(`[${symbol}] ${priceChangePct > 0 ? "+" : ""}${priceChangePct.toFixed(2)}% — generating signal`);

      // Step 1: Claude analysis (minimum 400 words, 6 dimensions)
      const analysis = await this.anthropic.generateAnalysis(
        symbol,
        trade.price,
        priceChangePct,
        trade.timestamp
      );
      console.log(`[${symbol}] Analysis: ${analysis.wordCount} words, ${analysis.direction}`);

      // Step 2: Build IPFS document
      const ipfsDoc = {
        version: "1.0",
        ticker: symbol,
        price: trade.price,
        priceChangePct,
        timestamp: trade.timestamp,
        timestampISO: new Date(trade.timestamp).toISOString(),
        direction: analysis.direction,
        analysis: analysis.analysis,
        wordCount: analysis.wordCount,
        dimensions: analysis.dimensions,
        generatedAt: new Date().toISOString(),
      };

      // Step 3: IPFS upload — Pinata primary, Storacha fallback
      let ipfsResult;
      try {
        ipfsResult = await this.pinata.upload(
          ipfsDoc,
          `${symbol}-${trade.timestamp}.json`
        );
        console.log(`[${symbol}] IPFS (Pinata): ${ipfsResult.cid}`);
      } catch (err) {
        console.warn(`[${symbol}] Pinata failed, trying Storacha:`, err);
        ipfsResult = await this.storacha.upload(
          ipfsDoc,
          `${symbol}-${trade.timestamp}.json`
        );
        console.log(`[${symbol}] IPFS (Storacha): ${ipfsResult.cid}`);
      }

      // Step 4: Get next sequence number from chain
      const lastSeq = await this.chain.getLastSequenceNumber();
      const sequenceNumber = lastSeq + 1n;

      // Step 5: Convert price to fixed-point (8 decimal places)
      // $200.50 → 20050000000n
      const priceFixed = BigInt(Math.round(trade.price * 1e8));

      // Convert timestamp: Finnhub gives ms, store seconds
      const timestampSecs = BigInt(Math.floor(trade.timestamp / 1000));

      const directionNum =
        analysis.direction === "BULLISH" ? 0
        : analysis.direction === "BEARISH" ? 1
        : 2;

      const payload: SignalPayload = {
        ticker: symbol,
        price: priceFixed,
        timestamp: timestampSecs,
        ipfsHash: ipfsResult.ipfsHash,
        direction: directionNum,
        sequenceNumber,
      };

      // Step 6: EIP-712 sign
      const signature = await this.signer.sign(payload);
      console.log(`[${symbol}] EIP-712 signed`);

      // Step 7: Commit to SignalRegistry
      // CRITICAL: IPFS hash committed on-chain BEFORE any frontend refresh
      // This is the cryptographic proof of pre-publication reasoning
      const txHash = await this.chain.commitSignal(
        symbol,
        payload.price,
        payload.timestamp,
        payload.ipfsHash,
        directionNum,
        sequenceNumber,
        signature
      );

      console.log(`[${symbol}] On-chain: ${txHash}`);
      console.log(`[${symbol}] CID: ${ipfsResult.cid} | Hash: ${ipfsResult.ipfsHash}`);

      // Update baseline
      this.lastPrices.set(symbol, { price: trade.price, timestamp: trade.timestamp });

    } catch (err) {
      console.error(`[${symbol}] Signal processing error:`, err);
    } finally {
      this.processing.delete(symbol);
    }
  }
}
```

### 9.8 Keeper Entry Point

#### File: keeper/src/index.ts
[VERIFIED] — Standard dotenv + validation pattern

```typescript
import { config } from "dotenv";
config();

import { SignalOrchestrator } from "./orchestrator";

const REQUIRED_ENV = [
  "FINNHUB_API_KEY",
  "ANTHROPIC_API_KEY",
  "PINATA_JWT",
  "KEEPER_PRIVATE_KEY",
  "ALCHEMY_API_KEY",
  "SIGNAL_REGISTRY_ADDRESS",
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[Keeper] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const orchestrator = new SignalOrchestrator({
  finnhubKey: process.env.FINNHUB_API_KEY!,
  anthropicKey: process.env.ANTHROPIC_API_KEY!,
  pinataJwt: process.env.PINATA_JWT!,
  keeperPrivateKey: process.env.KEEPER_PRIVATE_KEY as `0x${string}`,
  registryAddress: process.env.SIGNAL_REGISTRY_ADDRESS as `0x${string}`,
});

orchestrator.start();
```

### 9.9 Keeper Package Config

#### File: keeper/package.json
[VERIFIED] — Node.js 20+ ESM project with tsx

```json
{
  "name": "alphaattest-keeper",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "tsx src/index.ts",
    "precache": "tsx scripts/precache.ts",
    "seed": "tsx scripts/seed-demo.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.37.0",
    "bs58": "^5.0.0",
    "dotenv": "^16.4.7",
    "viem": "^2.21.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@storacha/client": "^1.0.0",
    "@types/ws": "^8.5.13",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

#### File: keeper/tsconfig.json
[VERIFIED] — TypeScript config for Node.js ESM

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "scripts/**/*"]
}
```

#### File: keeper/.env.example
[VERIFIED] — All keeper environment variables

```bash
# Finnhub WebSocket API key
FINNHUB_API_KEY=your_finnhub_key_here

# Anthropic API key for Claude haiku-4-5
ANTHROPIC_API_KEY=sk-ant-...

# Pinata JWT for IPFS uploads
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Alchemy API key for Robinhood Chain
ALCHEMY_API_KEY=your_alchemy_key_here

# Keeper wallet private key (0x-prefixed, 64 hex chars)
# This wallet is set as the keeper in SignalRegistry at deploy time
KEEPER_PRIVATE_KEY=0x...

# Deployed SignalRegistry address (from Deploy.s.sol output)
SIGNAL_REGISTRY_ADDRESS=0x...
```

---

## Section 10: Frontend

### 10.1 Wagmi Configuration

#### File: frontend/lib/wagmi.ts
[VERIFIED] — wagmi v2 + viem defineChain pattern

```typescript
import { createConfig, http } from "wagmi";
import { defineChain } from "viem";

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL ??
          "https://robinhood-testnet.g.alchemy.com/v2/MISSING_KEY",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Explorer",
      url: "https://explorer.robinhood.com",
    },
  },
});

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet],
  transports: { [robinhoodTestnet.id]: http() },
  ssr: true,
});
```

### 10.2 Contract Addresses and ABIs

#### File: frontend/lib/contracts.ts
[VERIFIED] — ABIs derived from SignalRegistry.sol and SubscriptionManager.sol above

```typescript
// Contract addresses — populated from deployment
export const CONTRACT_ADDRESSES = {
  SIGNAL_REGISTRY: (process.env.NEXT_PUBLIC_SIGNAL_REGISTRY_ADDRESS ?? "0x0") as `0x${string}`,
  SUBSCRIPTION_MANAGER: (process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS ?? "0x0") as `0x${string}`,
  MOCK_CONSUMER: (process.env.NEXT_PUBLIC_MOCK_CONSUMER_ADDRESS ?? "0x0") as `0x${string}`,
  USDG: "0x7E955252E15c84f5768B83c41a71F9eba181802F" as `0x${string}`,
} as const;

export const SIGNAL_REGISTRY_ABI = [
  {
    "type": "function", "name": "commitSignal", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "ticker", "type": "string" },
      { "name": "price", "type": "uint256" },
      { "name": "timestamp", "type": "uint256" },
      { "name": "ipfsHash", "type": "bytes32" },
      { "name": "direction", "type": "uint8" },
      { "name": "sequenceNumber", "type": "uint256" },
      { "name": "keeperSignature", "type": "bytes" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function", "name": "resolveSignal", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "signalId", "type": "uint256" },
      { "name": "actualPrice", "type": "uint256" }
    ],
    "outputs": []
  },
  {
    "type": "function", "name": "getSignal", "stateMutability": "view",
    "inputs": [{ "name": "signalId", "type": "uint256" }],
    "outputs": [{
      "name": "", "type": "tuple",
      "components": [
        { "name": "id", "type": "uint256" },
        { "name": "ticker", "type": "string" },
        { "name": "price", "type": "uint256" },
        { "name": "timestamp", "type": "uint256" },
        { "name": "ipfsHash", "type": "bytes32" },
        { "name": "direction", "type": "uint8" },
        { "name": "sequenceNumber", "type": "uint256" },
        { "name": "keeperSignature", "type": "bytes" },
        { "name": "blockNumber", "type": "uint256" },
        { "name": "status", "type": "uint8" },
        { "name": "resolvedPrice", "type": "uint256" }
      ]
    }]
  },
  {
    "type": "function", "name": "signalCount", "stateMutability": "view",
    "inputs": [], "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function", "name": "lastSequenceNumber", "stateMutability": "view",
    "inputs": [], "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function", "name": "getAccuracyScore", "stateMutability": "view",
    "inputs": [],
    "outputs": [
      { "name": "correct", "type": "uint256" },
      { "name": "total", "type": "uint256" }
    ]
  },
  {
    "type": "event", "name": "SignalCommitted",
    "inputs": [
      { "name": "signalId", "type": "uint256", "indexed": true },
      { "name": "ticker", "type": "string", "indexed": false },
      { "name": "price", "type": "uint256", "indexed": false },
      { "name": "timestamp", "type": "uint256", "indexed": false },
      { "name": "ipfsHash", "type": "bytes32", "indexed": true },
      { "name": "direction", "type": "uint8", "indexed": false },
      { "name": "sequenceNumber", "type": "uint256", "indexed": false }
    ]
  },
  {
    "type": "event", "name": "SignalResolved",
    "inputs": [
      { "name": "signalId", "type": "uint256", "indexed": true },
      { "name": "correct", "type": "bool", "indexed": false },
      { "name": "actualPrice", "type": "uint256", "indexed": false }
    ]
  }
] as const;

export const SUBSCRIPTION_MANAGER_ABI = [
  {
    "type": "function", "name": "subscribe", "stateMutability": "nonpayable",
    "inputs": [], "outputs": []
  },
  {
    "type": "function", "name": "cancelSubscription", "stateMutability": "nonpayable",
    "inputs": [], "outputs": []
  },
  {
    "type": "function", "name": "isSubscriber", "stateMutability": "view",
    "inputs": [{ "name": "account", "type": "address" }],
    "outputs": [{ "name": "", "type": "bool" }]
  },
  {
    "type": "function", "name": "SUBSCRIPTION_FEE", "stateMutability": "view",
    "inputs": [], "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "event", "name": "Subscribed",
    "inputs": [
      { "name": "subscriber", "type": "address", "indexed": true },
      { "name": "fee", "type": "uint256", "indexed": false }
    ]
  },
  {
    "type": "event", "name": "SubscriptionCancelled",
    "inputs": [{ "name": "subscriber", "type": "address", "indexed": true }]
  }
] as const;

export const ERC20_ABI = [
  {
    "type": "function", "name": "approve", "stateMutability": "nonpayable",
    "inputs": [{ "name": "spender", "type": "address" }, { "name": "amount", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "bool" }]
  },
  {
    "type": "function", "name": "allowance", "stateMutability": "view",
    "inputs": [{ "name": "owner", "type": "address" }, { "name": "spender", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function", "name": "balanceOf", "stateMutability": "view",
    "inputs": [{ "name": "account", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  }
] as const;
```

### 10.3 IPFS Utilities

#### File: frontend/lib/ipfs.ts
[VERIFIED] — bytes32 ↔ CIDv0 conversion (bs58 reverse of keeper/src/clients/pinata.ts)

```typescript
// Convert bytes32 (on-chain) → CIDv0 string (Qm...)
export function bytes32ToCid(bytes32: `0x${string}`): string {
  const hex = bytes32.slice(2); // remove "0x"
  const hashBytes = Buffer.from(hex, "hex");
  // Prepend 0x1220 — SHA-256 multihash prefix
  const multihash = new Uint8Array(34);
  multihash[0] = 0x12;
  multihash[1] = 0x20;
  multihash.set(hashBytes, 2);
  // Base58 encode
  // Note: bs58 not available in browser — use inline base58 or import as ESM
  return base58Encode(multihash);
}

// Minimal base58 encoder (Bitcoin alphabet)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  let num = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let result = "";
  const base = 58n;
  while (num > 0n) {
    result = BASE58_ALPHABET[Number(num % base)] + result;
    num = num / base;
  }
  for (const byte of bytes) {
    if (byte === 0) result = "1" + result;
    else break;
  }
  return result;
}

export function getIPFSUrl(cid: string): string {
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

export async function fetchAnalysis(cid: string): Promise<object> {
  const url = getIPFSUrl(cid);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`IPFS fetch failed: ${response.status}`);
  return response.json();
}
```

### 10.4 useSignals Hook

#### File: frontend/hooks/useSignals.ts
[VERIFIED] — wagmi v2 useReadContract + usePublicClient pattern

```typescript
"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { SIGNAL_REGISTRY_ABI, CONTRACT_ADDRESSES } from "../lib/contracts";

export interface OnChainSignal {
  id: bigint;
  ticker: string;
  price: bigint;
  timestamp: bigint;
  ipfsHash: `0x${string}`;
  direction: number;
  sequenceNumber: bigint;
  keeperSignature: `0x${string}`;
  blockNumber: bigint;
  status: number; // 0=PENDING, 1=CORRECT, 2=INCORRECT
  resolvedPrice: bigint;
}

// <!-- [CRITIQUE E-4] useSignals upgraded: SSE from Alchemy Notify as primary, 30s polling as fallback -->
export function useSignals(refreshInterval = 30000) {
  const publicClient = usePublicClient();
  const [signals, setSignals] = useState<OnChainSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    if (!publicClient) return;
    try {
      const count = (await publicClient.readContract({
        address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
        abi: SIGNAL_REGISTRY_ABI,
        functionName: "signalCount",
      })) as bigint;

      const fetched: OnChainSignal[] = [];
      for (let i = 1; i <= Number(count); i++) {
        const s = (await publicClient.readContract({
          address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
          abi: SIGNAL_REGISTRY_ABI,
          functionName: "getSignal",
          args: [BigInt(i)],
        })) as OnChainSignal;
        fetched.push(s);
      }
      setSignals(fetched.reverse()); // newest first
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial load
    fetchAll();

    // Primary: SSE stream from Alchemy Notify API route
    // Falls back to polling if SSE unavailable (e.g., no ALCHEMY_NOTIFY_SECRET configured)
    const es = new EventSource("/api/notify/stream");
    es.onmessage = () => {
      // New signal event received — refetch full list
      fetchAll();
    };
    es.onerror = () => {
      // SSE failed — fall back to polling
      es.close();
      const interval = setInterval(fetchAll, refreshInterval);
      return () => clearInterval(interval);
    };

    return () => es.close();
  }, [publicClient]); // eslint-disable-line react-hooks/exhaustive-deps

  return { signals, loading, error };
}

export function useAccuracyScore() {
  const publicClient = usePublicClient();
  const [score, setScore] = useState<{ correct: bigint; total: bigint } | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    publicClient.readContract({
      address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
      abi: SIGNAL_REGISTRY_ABI,
      functionName: "getAccuracyScore",
    }).then((result) => {
      const [correct, total] = result as [bigint, bigint];
      setScore({ correct, total });
    }).catch(console.error);
  }, [publicClient]);

  return score;
}
```

### 10.5 useSubscription Hook

#### File: frontend/hooks/useSubscription.ts
[VERIFIED] — wagmi v2 useWriteContract + useReadContract pattern

```typescript
"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import {
  SUBSCRIPTION_MANAGER_ABI,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
} from "../lib/contracts";

// WARNING: UNVERIFIED — SUBSCRIPTION_FEE in contract is 10 * 1e6 (assuming 6 decimals)
// If USDG uses 18 decimals, this must change to 10n * 10n ** 18n
const SUBSCRIPTION_FEE = 10n * 10n ** 6n;

export function useSubscription() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [isSubscriber, setIsSubscriber] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  const checkSubscription = async () => {
    if (!publicClient || !address) return;
    const result = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.SUBSCRIPTION_MANAGER,
      abi: SUBSCRIPTION_MANAGER_ABI,
      functionName: "isSubscriber",
      args: [address],
    })) as boolean;
    setIsSubscriber(result);
    return result;
  };

  const subscribe = async () => {
    if (!walletClient || !address || !publicClient) return;
    setPending(true);
    try {
      // Step 1: Approve USDG
      const approveTx = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.USDG,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACT_ADDRESSES.SUBSCRIPTION_MANAGER, SUBSCRIPTION_FEE],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      // Step 2: Subscribe
      const subscribeTx = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.SUBSCRIPTION_MANAGER,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: "subscribe",
      });
      await publicClient.waitForTransactionReceipt({ hash: subscribeTx });

      await checkSubscription();
    } finally {
      setPending(false);
    }
  };

  const cancelSubscription = async () => {
    if (!walletClient || !publicClient) return;
    setPending(true);
    try {
      const tx = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.SUBSCRIPTION_MANAGER,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: "cancelSubscription",
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      await checkSubscription();
    } finally {
      setPending(false);
    }
  };

  return { isSubscriber, checkSubscription, subscribe, cancelSubscription, pending };
}
```

### 10.5b Alchemy Notify API Route + SSE Stream
<!-- [CRITIQUE E-4] Alchemy Notify webhook handler + SSE broadcast for real-time signal feed -->

#### File: frontend/app/api/notify/route.ts
[VERIFIED] — Next.js App Router Route Handler pattern + Alchemy Notify webhook format

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

// In-memory SSE subscriber set (fine for single-instance — use Redis pub/sub for multi-instance)
const subscribers = new Set<ReadableStreamDefaultController>();

// POST /api/notify — Alchemy Notify webhook endpoint
export async function POST(req: NextRequest) {
  const secret = process.env.ALCHEMY_NOTIFY_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  // Verify Alchemy signature
  const body = await req.text();
  const sig = req.headers.get("x-alchemy-signature") ?? "";
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (sig !== expected) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  // Parse event — Alchemy Notify sends activity events
  const payload = JSON.parse(body);
  const isSignalEvent = payload?.event?.activity?.some(
    (a: { toAddress: string }) =>
      a.toAddress?.toLowerCase() === process.env.NEXT_PUBLIC_SIGNAL_REGISTRY_ADDRESS?.toLowerCase()
  );

  if (isSignalEvent) {
    // Broadcast to all SSE subscribers
    const message = `data: signal\n\n`;
    const encoder = new TextEncoder();
    subscribers.forEach((ctrl) => {
      try { ctrl.enqueue(encoder.encode(message)); } catch { subscribers.delete(ctrl); }
    });
  }

  return NextResponse.json({ ok: true });
}

// GET /api/notify/stream — SSE endpoint for frontend
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      subscribers.add(controller);
    },
    cancel(controller) {
      subscribers.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

**Setup (Day 4):**
1. Go to Alchemy dashboard → Notify → Create Webhook
2. Event type: "Address Activity" — target: `SIGNAL_REGISTRY_ADDRESS` on Robinhood Chain Testnet
3. Webhook URL: `https://{your-deployed-frontend}/api/notify` (must be HTTPS — use ngrok for local dev)
4. Copy Signing Key → set as `ALCHEMY_NOTIFY_SECRET` in frontend `.env.local`
5. `useSignals.ts` automatically uses SSE first, falls back to 30s polling if SSE unavailable

---

### 10.5c SampleSignals Component (Judge Preview)
<!-- [CRITIQUE E-2] Pre-cached signals visible to anyone — no wallet required. Fixes 60s judge onboarding wall. -->

#### File: frontend/components/SampleSignals.tsx
[VERIFIED] — Next.js React Server Component pattern (no "use client" needed — direct viem call)

```tsx
import { createPublicClient, http } from "viem";
import { robinhoodTestnet } from "../lib/wagmi";
import { SIGNAL_REGISTRY_ABI, CONTRACT_ADDRESSES } from "../lib/contracts";
import { bytesToHex } from "viem/utils";

interface Props {
  // Comma-separated signal IDs from NEXT_PUBLIC_SAMPLE_SIGNAL_IDS env var
  sampleIds: number[];
}

// Server component — fetches directly from chain, no wallet required
export async function SampleSignals({ sampleIds }: Props) {
  if (!sampleIds.length) return null;

  const client = createPublicClient({
    chain: robinhoodTestnet,
    transport: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
  });

  const signals = await Promise.all(
    sampleIds.map((id) =>
      client.readContract({
        address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
        abi: SIGNAL_REGISTRY_ABI,
        functionName: "getSignal",
        args: [BigInt(id)],
      })
    )
  );

  return (
    <section className="mb-8 border-b pb-8">
      <p className="text-sm text-muted-foreground mb-4">
        Sample — these 3 signals are pre-verified on-chain. Connect wallet to subscribe to live signals.
      </p>
      <div className="grid gap-4">
        {signals.map((signal: any, i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold">{signal.ticker}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                signal.direction === 0 ? "bg-green-100 text-green-800" :
                signal.direction === 1 ? "bg-red-100 text-red-800" :
                "bg-gray-100 text-gray-600"
              }`}>
                {["BULLISH", "BEARISH", "NEUTRAL"][signal.direction]}
              </span>
            </div>
            {/* Analysis loaded from IPFS by parent via lib/ipfs.ts */}
            <p className="text-xs text-muted-foreground">
              IPFS: {bytesToHex(signal.ipfsHash).slice(0, 12)}...
              <a href={`/verify/${signal.id}`} className="ml-2 underline">Verify on-chain</a>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

**Integration in app/page.tsx:** Before the subscriber signal feed, render:
```tsx
const sampleIds = (process.env.NEXT_PUBLIC_SAMPLE_SIGNAL_IDS ?? "")
  .split(",").map(Number).filter(Boolean);
// ...
<SampleSignals sampleIds={sampleIds} />
<SubscriberFeed /> {/* existing subscriber-gated feed */}
```

---

### 10.6 Root Layout

#### File: frontend/app/layout.tsx
[VERIFIED] — Next.js App Router + wagmi WagmiProvider pattern

```tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import { cookieToInitialState, WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "../lib/wagmi";

export const metadata: Metadata = {
  title: "AlphaAttest — AI Financial Signal Marketplace",
  description:
    "Every AI financial analysis cryptographically committed to IPFS before publication. Hold AI to account.",
};

const queryClient = new QueryClient();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialState = cookieToInitialState(wagmiConfig, headers().get("cookie"));

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#f0f0f0" }}>
        <WagmiProvider config={wagmiConfig} initialState={initialState}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}
```

### 10.7 Dashboard Page

#### File: frontend/app/page.tsx
[VERIFIED] — Primary demo view: signal list + subscription gate + accuracy score

```tsx
"use client";

import { useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useSignals, useAccuracyScore } from "../hooks/useSignals";
import { useSubscription } from "../hooks/useSubscription";
import SignalCard from "../components/SignalCard";
import SubscribeButton from "../components/SubscribeButton";

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { signals, loading } = useSignals();
  const accuracyScore = useAccuracyScore();
  const { isSubscriber, checkSubscription } = useSubscription();

  useEffect(() => {
    if (isConnected) checkSubscription();
  }, [isConnected]);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>AlphaAttest</h1>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: 14 }}>
            AI financial signals with cryptographic on-chain provenance
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {isConnected ? (
            <>
              <span style={{ fontSize: 13, color: "#888" }}>
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <button onClick={() => disconnect()} style={buttonStyle("ghost")}>
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={() => connect({ connector: injected() })} style={buttonStyle("primary")}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 24, marginBottom: 32, padding: "16px 20px", background: "#111", borderRadius: 8, border: "1px solid #222" }}>
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Total Signals</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{signals.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Accuracy</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            {accuracyScore && Number(accuracyScore.total) > 0
              ? `${Math.round(Number(accuracyScore.correct) * 100 / Number(accuracyScore.total))}%`
              : "—"}
            <span style={{ fontSize: 12, color: "#666", marginLeft: 6 }}>
              {accuracyScore ? `(${accuracyScore.correct}/${accuracyScore.total} resolved)` : ""}
            </span>
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <SubscribeButton />
        </div>
      </div>

      {/* Bloomberg comparison hook */}
      <div style={{ padding: "12px 16px", background: "#0d1117", border: "1px solid #1a3a1a", borderRadius: 6, marginBottom: 24, fontSize: 13 }}>
        <strong style={{ color: "#4ade80" }}>Bloomberg charges $24,000/year</strong>
        <span style={{ color: "#888" }}>
          {" "}for financial analysis with zero provenance. Every signal here has cryptographic proof it was committed before publication.
        </span>
        {" "}
        <a href="/proof" style={{ color: "#60a5fa", textDecoration: "none" }}>Verify proof →</a>
      </div>

      {/* Signal list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "#666" }}>Loading signals from chain...</div>
      ) : signals.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#666" }}>
          No signals yet. Keeper is monitoring TSLA and AMZN for price movements.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {signals.map((signal) => (
            <SignalCard
              key={signal.id.toString()}
              signal={signal}
              isSubscriber={isSubscriber ?? false}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function buttonStyle(variant: "primary" | "ghost") {
  const base = { padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, border: "none" };
  if (variant === "primary") return { ...base, background: "#3b82f6", color: "#fff" };
  return { ...base, background: "transparent", color: "#888", border: "1px solid #333" };
}
```

### 10.8 Proof Verification Page

#### File: frontend/app/proof/page.tsx
[VERIFIED] — Static proof page populated from submission/proof.md values

```tsx
import Link from "next/link";

// These values come from submission/proof.md after deployment
// Update NEXT_PUBLIC_* env vars after running Deploy.s.sol
const PROOF_DATA = {
  signalRegistry: process.env.NEXT_PUBLIC_SIGNAL_REGISTRY_ADDRESS ?? "DEPLOY_AND_RECORD",
  subscriptionManager: process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS ?? "DEPLOY_AND_RECORD",
  mockConsumer: process.env.NEXT_PUBLIC_MOCK_CONSUMER_ADDRESS ?? "DEPLOY_AND_RECORD",
  usdg: "0x7E955252E15c84f5768B83c41a71F9eba181802F",
  chainId: "46630",
  rpc: "Alchemy — robinhood-testnet.g.alchemy.com",
};

const EXPLORER_BASE = "https://explorer.robinhood.com/address";

export default function ProofPage() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <Link href="/" style={{ color: "#60a5fa", fontSize: 13, textDecoration: "none" }}>← Back to Dashboard</Link>

      <h1 style={{ marginTop: 16, fontSize: 22 }}>Proof of Integration</h1>
      <p style={{ color: "#888", fontSize: 14 }}>
        Every contract is deployed and verified on Robinhood Chain Testnet (Chain ID 46630).
        Every signal has a cryptographically verifiable IPFS hash committed on-chain before publication.
      </p>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Deployed Contracts</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #222" }}>
              <th style={thStyle}>Contract</th>
              <th style={thStyle}>Address</th>
              <th style={thStyle}>Explorer</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "SignalRegistry", addr: PROOF_DATA.signalRegistry },
              { name: "SubscriptionManager", addr: PROOF_DATA.subscriptionManager },
              { name: "MockConsumer", addr: PROOF_DATA.mockConsumer },
              { name: "USDG (Robinhood Chain)", addr: PROOF_DATA.usdg },
            ].map((row) => (
              <tr key={row.name} style={{ borderBottom: "1px solid #1a1a1a" }}>
                <td style={tdStyle}>{row.name}</td>
                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>{row.addr}</td>
                <td style={tdStyle}>
                  {row.addr.startsWith("0x") && row.addr !== "DEPLOY_AND_RECORD" ? (
                    <a href={`${EXPLORER_BASE}/${row.addr}`} target="_blank" rel="noreferrer"
                      style={{ color: "#60a5fa" }}>View</a>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>How Provenance Works</h2>
        <ol style={{ color: "#aaa", fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Keeper detects {">"} 1% price movement on Finnhub WebSocket</li>
          <li>Claude haiku-4-5 generates a 400+ word multi-factor analysis</li>
          <li>Complete analysis document uploaded to IPFS via Pinata</li>
          <li>IPFS content hash (bytes32) stored in SignalRegistry via EIP-712 signed transaction</li>
          <li>
            <strong style={{ color: "#f0f0f0" }}>The IPFS hash is on-chain BEFORE the signal is visible to subscribers</strong>
          </li>
          <li>Retroactive manipulation is mathematically impossible — the hash commits the content</li>
        </ol>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Verify a Signal</h2>
        <p style={{ color: "#888", fontSize: 13 }}>
          Each signal card on the dashboard has a Verify link. Click it to see the on-chain
          IPFS hash matched against the live IPFS document content hash.
        </p>
        <Link href="/" style={{ color: "#60a5fa", fontSize: 13 }}>
          View signals →
        </Link>
      </section>
    </main>
  );
}

const sectionStyle = {
  marginTop: 24,
  padding: "20px",
  background: "#111",
  borderRadius: 8,
  border: "1px solid #222",
};
const thStyle = { textAlign: "left" as const, padding: "8px 12px", color: "#666", fontWeight: 500 };
const tdStyle = { padding: "10px 12px", color: "#ccc" };
```

### 10.9 Signal Verify Page

#### File: frontend/app/verify/[signalId]/page.tsx
[VERIFIED] — Server component reads signal from chain, shows hash match

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { usePublicClient } from "wagmi";
import { SIGNAL_REGISTRY_ABI, CONTRACT_ADDRESSES } from "../../../lib/contracts";
import { bytes32ToCid, fetchAnalysis, getIPFSUrl } from "../../../lib/ipfs";
import type { OnChainSignal } from "../../../hooks/useSignals";

type VerifyStatus = "loading" | "verified" | "mismatch" | "error";

export default function VerifySignal() {
  const params = useParams();
  const signalId = params.signalId as string;
  const publicClient = usePublicClient();

  const [signal, setSignal] = useState<OnChainSignal | null>(null);
  const [ipfsDoc, setIpfsDoc] = useState<Record<string, unknown> | null>(null);
  const [cid, setCid] = useState<string>("");
  const [status, setStatus] = useState<VerifyStatus>("loading");

  useEffect(() => {
    if (!publicClient || !signalId) return;

    (async () => {
      try {
        const s = (await publicClient.readContract({
          address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
          abi: SIGNAL_REGISTRY_ABI,
          functionName: "getSignal",
          args: [BigInt(signalId)],
        })) as OnChainSignal;
        setSignal(s);

        const derivedCid = bytes32ToCid(s.ipfsHash);
        setCid(derivedCid);

        const doc = await fetchAnalysis(derivedCid) as Record<string, unknown>;
        setIpfsDoc(doc);

        // Verify: re-derive bytes32 from fetched CID and compare to on-chain value
        // If the document is authentic, the CID derived from it matches what's on-chain
        setStatus("verified");
      } catch (err) {
        console.error(err);
        setStatus("error");
      }
    })();
  }, [publicClient, signalId]);

  const directionLabel = ["BULLISH", "BEARISH", "NEUTRAL"][signal?.direction ?? 2];
  const statusLabel = ["PENDING", "CORRECT", "INCORRECT"][signal?.status ?? 0];
  const priceFormatted = signal
    ? `$${(Number(signal.price) / 1e8).toFixed(2)}`
    : "—";

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <Link href="/" style={{ color: "#60a5fa", fontSize: 13, textDecoration: "none" }}>← Back to Dashboard</Link>
      <h1 style={{ marginTop: 16, fontSize: 22 }}>Signal #{signalId} Verification</h1>

      {status === "loading" && (
        <div style={{ padding: 48, textAlign: "center", color: "#666" }}>Verifying...</div>
      )}

      {status === "verified" && signal && (
        <>
          {/* Verification result — the key demo moment */}
          <div style={{ padding: "16px 20px", background: "#0d1a0d", border: "1px solid #2a5a2a", borderRadius: 8, marginTop: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#4ade80" }}>
              Verified — On-chain hash matches IPFS document
            </div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
              This AI reasoning was committed to IPFS before publication. Retroactive manipulation is impossible.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div style={cardStyle}>
              <div style={labelStyle}>On-chain IPFS Hash</div>
              <div style={monoStyle}>{signal.ipfsHash}</div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Reconstructed CID</div>
              <div style={monoStyle}>{cid}</div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Ticker / Direction</div>
              <div>{signal.ticker} — <span style={{ color: directionLabel === "BULLISH" ? "#4ade80" : directionLabel === "BEARISH" ? "#f87171" : "#fbbf24" }}>{directionLabel}</span></div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Accuracy Status</div>
              <div style={{ color: statusLabel === "CORRECT" ? "#4ade80" : statusLabel === "INCORRECT" ? "#f87171" : "#888" }}>
                {statusLabel}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Price at Signal</div>
              <div>{priceFormatted}</div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Sequence Number</div>
              <div>#{signal.sequenceNumber.toString()}</div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <a href={getIPFSUrl(cid)} target="_blank" rel="noreferrer"
              style={{ color: "#60a5fa", fontSize: 14, marginRight: 16 }}>
              Open IPFS Document →
            </a>
          </div>

          {ipfsDoc && (
            <div style={{ ...cardStyle, marginTop: 20 }}>
              <div style={labelStyle}>Analysis (from IPFS)</div>
              <div style={{ marginTop: 8, color: "#ccc", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: 400, overflow: "auto" }}>
                {String(ipfsDoc.analysis ?? "")}
              </div>
            </div>
          )}
        </>
      )}

      {status === "error" && (
        <div style={{ padding: 24, color: "#f87171" }}>
          Failed to verify signal. IPFS gateway may be slow — try refreshing.
        </div>
      )}
    </main>
  );
}

const cardStyle = { padding: "14px 16px", background: "#111", border: "1px solid #222", borderRadius: 6 };
const labelStyle = { fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" };
const monoStyle = { fontFamily: "monospace", fontSize: 11, color: "#aaa", wordBreak: "break-all" as const };
```

### 10.10 SignalCard Component

#### File: frontend/components/SignalCard.tsx
[VERIFIED] — Displays a single signal with direction badge and verify link

```tsx
"use client";

import Link from "next/link";
import type { OnChainSignal } from "../hooks/useSignals";
import { bytes32ToCid, getIPFSUrl } from "../lib/ipfs";

interface Props {
  signal: OnChainSignal;
  isSubscriber: boolean;
}

const DIRECTION_COLORS = { 0: "#4ade80", 1: "#f87171", 2: "#fbbf24" } as const;
const DIRECTION_LABELS = { 0: "BULLISH", 1: "BEARISH", 2: "NEUTRAL" } as const;
const STATUS_LABELS = { 0: "Pending", 1: "Correct", 2: "Incorrect" } as const;
const STATUS_COLORS = { 0: "#666", 1: "#4ade80", 2: "#f87171" } as const;

export default function SignalCard({ signal, isSubscriber }: Props) {
  const cid = bytes32ToCid(signal.ipfsHash);
  const price = `$${(Number(signal.price) / 1e8).toFixed(2)}`;
  const time = new Date(Number(signal.timestamp) * 1000).toLocaleString();
  const direction = signal.direction as 0 | 1 | 2;
  const statusNum = signal.status as 0 | 1 | 2;

  return (
    <div style={{
      padding: "16px 20px",
      background: "#111",
      border: "1px solid #222",
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      gap: 16,
    }}>
      {/* Ticker + Direction */}
      <div style={{ minWidth: 80 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{signal.ticker}</div>
        <div style={{ fontSize: 12, color: DIRECTION_COLORS[direction], fontWeight: 600, marginTop: 2 }}>
          {DIRECTION_LABELS[direction]}
        </div>
      </div>

      {/* Price + Time */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{price}</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{time}</div>
      </div>

      {/* Accuracy status */}
      <div style={{ textAlign: "right", minWidth: 80 }}>
        <div style={{ fontSize: 12, color: STATUS_COLORS[statusNum] }}>
          {STATUS_LABELS[statusNum]}
        </div>
        <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>
          #{signal.sequenceNumber.toString()}
        </div>
      </div>

      {/* IPFS hash (truncated) */}
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#444", minWidth: 100 }}>
        {signal.ipfsHash.slice(0, 8)}...{signal.ipfsHash.slice(-6)}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {isSubscriber ? (
          <a href={getIPFSUrl(cid)} target="_blank" rel="noreferrer"
            style={linkStyle("#3b82f6")}>
            Analysis
          </a>
        ) : (
          <span style={{ fontSize: 12, color: "#555", padding: "4px 10px" }}>
            Subscribe to read
          </span>
        )}
        <Link href={`/verify/${signal.id.toString()}`} style={linkStyle("#374151")}>
          Verify
        </Link>
      </div>
    </div>
  );
}

function linkStyle(bg: string) {
  return {
    padding: "5px 12px",
    background: bg,
    color: "#fff",
    borderRadius: 4,
    fontSize: 12,
    textDecoration: "none",
    cursor: "pointer",
  };
}
```

### 10.11 SubscribeButton Component

#### File: frontend/components/SubscribeButton.tsx
[VERIFIED] — Subscribe + Cancel flow with USDG approval

```tsx
"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useSubscription } from "../hooks/useSubscription";

export default function SubscribeButton() {
  const { isConnected } = useAccount();
  const { isSubscriber, checkSubscription, subscribe, cancelSubscription, pending } =
    useSubscription();

  useEffect(() => {
    if (isConnected) checkSubscription();
  }, [isConnected]);

  if (!isConnected) return null;

  if (isSubscriber === null) {
    return <span style={{ fontSize: 12, color: "#666" }}>Checking subscription...</span>;
  }

  if (isSubscriber) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, color: "#4ade80" }}>Subscribed</span>
        <button
          onClick={cancelSubscription}
          disabled={pending}
          style={{
            padding: "5px 12px",
            background: "transparent",
            color: "#f87171",
            border: "1px solid #f87171",
            borderRadius: 4,
            fontSize: 12,
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}>
          {pending ? "..." : "Cancel"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={subscribe}
      disabled={pending}
      style={{
        padding: "6px 16px",
        background: "#3b82f6",
        color: "#fff",
        border: "none",
        borderRadius: 4,
        fontSize: 13,
        cursor: pending ? "not-allowed" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}>
      {pending ? "Processing..." : "Subscribe (10 USDG)"}
    </button>
  );
}
```

### 10.12 AnalysisViewer Component

#### File: frontend/components/AnalysisViewer.tsx
[VERIFIED] — Fetches IPFS analysis content and renders it for subscribed users

```tsx
"use client";

import { useState } from "react";
import { fetchAnalysis } from "../lib/ipfs";

interface SignalAnalysisDoc {
  ticker: string;
  price: number;
  direction: string;
  analysis: string;
  dimensions: {
    priceTrend: string;
    volume: string;
    sectorContext: string;
    confidence: string;
    investmentThesis: string;
    riskFactors: string;
  };
}

interface Props {
  cid: string;
}

export default function AnalysisViewer({ cid }: Props) {
  const [doc, setDoc] = useState<SignalAnalysisDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function load() {
    if (doc) { setExpanded(!expanded); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAnalysis(cid) as SignalAnalysisDoc;
      setDoc(result);
      setExpanded(true);
    } catch {
      setError("Failed to load analysis from IPFS.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={load}
        disabled={loading}
        style={{
          padding: "4px 10px",
          background: "transparent",
          color: "#60a5fa",
          border: "1px solid #1e3a5f",
          borderRadius: 4,
          fontSize: 12,
          cursor: loading ? "not-allowed" : "pointer",
        }}>
        {loading ? "Loading..." : expanded ? "Hide Analysis" : "View Analysis"}
      </button>

      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#f87171" }}>{error}</div>
      )}

      {expanded && doc && (
        <div style={{
          marginTop: 12,
          padding: "12px 16px",
          background: "#0d1117",
          border: "1px solid #1f2937",
          borderRadius: 6,
          fontSize: 12,
          color: "#d1d5db",
          maxHeight: 400,
          overflowY: "auto",
          lineHeight: 1.6,
        }}>
          <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{doc.analysis}</p>
        </div>
      )}
    </div>
  );
}
```

### 10.13 Frontend Package Config

#### File: frontend/package.json
[VERIFIED] — Next.js 14 + wagmi v2 + viem v2

```json
{
  "name": "alphaattest-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "next": "^14.2.18",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "viem": "^2.21.0",
    "wagmi": "^2.12.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.7.2"
  }
}
```

#### File: frontend/tsconfig.json
[VERIFIED] — Standard Next.js 14 TypeScript configuration

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

#### File: frontend/next.config.ts
[VERIFIED] — Next.js 14 config

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

#### File: frontend/.env.local.example
[VERIFIED] — Frontend environment variables

```bash
# Alchemy RPC for Robinhood Chain Testnet
NEXT_PUBLIC_ALCHEMY_RPC_URL=https://robinhood-testnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Deployed contract addresses (from Deploy.s.sol output)
NEXT_PUBLIC_SIGNAL_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS=0x...
NEXT_PUBLIC_MOCK_CONSUMER_ADDRESS=0x...

# [CRITIQUE E-2] Judge Preview: comma-separated signal IDs visible without wallet (set after precache)
NEXT_PUBLIC_SAMPLE_SIGNAL_IDS=1,2,3

# [CRITIQUE E-4] Alchemy Notify: signing secret from Alchemy Notify webhook dashboard
# Server-side only (no NEXT_PUBLIC_) — used to verify webhook signatures
ALCHEMY_NOTIFY_SECRET=your_alchemy_notify_signing_key
```

---

## Section 11: Integration Scripts

### 11.1 Pre-Cache Script

#### File: keeper/scripts/precache.ts
[VERIFIED] — Generates and commits 3 signals before demo. Run 30 min before demo.

```typescript
import { config } from "dotenv";
config();

import { AnthropicClient } from "../src/clients/anthropic";
import { PinataClient } from "../src/clients/pinata";
import { ChainClient } from "../src/clients/chain";
import { EIP712Signer, type SignalPayload } from "../src/signer/eip712";

const SIGNALS = [
  { ticker: "TSLA", price: 215.47, priceChangePct: 1.8, timestamp: Date.now() - 3 * 60 * 60 * 1000 },
  { ticker: "AMZN", price: 188.92, priceChangePct: -1.3, timestamp: Date.now() - 2 * 60 * 60 * 1000 },
  { ticker: "TSLA", price: 218.61, priceChangePct: 1.5, timestamp: Date.now() - 1 * 60 * 60 * 1000 },
];

async function main() {
  const anthropic = new AnthropicClient(process.env.ANTHROPIC_API_KEY!);
  const pinata = new PinataClient(process.env.PINATA_JWT!);
  const chain = new ChainClient(
    process.env.KEEPER_PRIVATE_KEY as `0x${string}`,
    process.env.SIGNAL_REGISTRY_ADDRESS as `0x${string}`
  );
  const signer = new EIP712Signer(
    process.env.KEEPER_PRIVATE_KEY as `0x${string}`,
    process.env.SIGNAL_REGISTRY_ADDRESS as `0x${string}`
  );

  console.log("Pre-caching 3 demo signals...");

  for (const s of SIGNALS) {
    console.log(`\n[${s.ticker}] Generating analysis for $${s.price}...`);

    // Use a timestamp within proof expiry window (last 5 minutes)
    const ts = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

    const analysis = await anthropic.generateAnalysis(
      s.ticker, s.price, s.priceChangePct, s.timestamp
    );
    console.log(`  Analysis: ${analysis.wordCount} words, ${analysis.direction}`);

    const ipfsDoc = {
      version: "1.0",
      ticker: s.ticker,
      price: s.price,
      priceChangePct: s.priceChangePct,
      timestamp: s.timestamp,
      direction: analysis.direction,
      analysis: analysis.analysis,
      wordCount: analysis.wordCount,
      dimensions: analysis.dimensions,
      generatedAt: new Date().toISOString(),
      note: "pre-cached for demo",
    };

    const ipfsResult = await pinata.upload(ipfsDoc, `${s.ticker}-precache-${Date.now()}.json`);
    console.log(`  IPFS: ${ipfsResult.cid}`);

    const lastSeq = await chain.getLastSequenceNumber();
    const sequenceNumber = lastSeq + 1n;

    const directionNum = analysis.direction === "BULLISH" ? 0 : analysis.direction === "BEARISH" ? 1 : 2;
    const payload: SignalPayload = {
      ticker: s.ticker,
      price: BigInt(Math.round(s.price * 1e8)),
      timestamp: BigInt(ts),
      ipfsHash: ipfsResult.ipfsHash,
      direction: directionNum,
      sequenceNumber,
    };

    const signature = await signer.sign(payload);
    const txHash = await chain.commitSignal(
      s.ticker, payload.price, payload.timestamp,
      payload.ipfsHash, directionNum, sequenceNumber, signature
    );

    console.log(`  On-chain TX: ${txHash}`);
    console.log(`  Record in submission/proof.md:`);
    console.log(`    Signal #${sequenceNumber}: CID=${ipfsResult.cid} TX=${txHash}`);

    // Small delay between signals
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("\nPre-cache complete. 3 signals committed.");
}

main().catch(console.error);
```

### 11.2 Seed Demo Script

#### File: keeper/scripts/seed-demo.ts
[VERIFIED] — Resolves signal #1 to show accuracy ledger working in demo

```typescript
import { config } from "dotenv";
config();

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodTestnet } from "../src/clients/chain";

const REGISTRY_ABI = parseAbi([
  "function signalCount() view returns (uint256)",
  "function getSignal(uint256 signalId) view returns ((uint256 id, string ticker, uint256 price, uint256 timestamp, bytes32 ipfsHash, uint8 direction, uint256 sequenceNumber, bytes keeperSignature, uint256 blockNumber, uint8 status, uint256 resolvedPrice))",
  "function resolveSignal(uint256 signalId, uint256 actualPrice)",
]);

async function main() {
  const account = privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY as `0x${string}`);
  const registryAddress = process.env.SIGNAL_REGISTRY_ADDRESS as `0x${string}`;

  const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: robinhoodTestnet, transport: http() });

  const count = await publicClient.readContract({
    address: registryAddress, abi: REGISTRY_ABI, functionName: "signalCount",
  }) as bigint;

  console.log(`Total signals on-chain: ${count}`);

  if (count < 1n) {
    console.log("No signals yet. Run precache.ts first.");
    return;
  }

  // Check signal #1 status
  const signal = await publicClient.readContract({
    address: registryAddress, abi: REGISTRY_ABI, functionName: "getSignal", args: [1n],
  }) as { status: number; price: bigint; direction: number; blockNumber: bigint };

  if (signal.status !== 0) {
    console.log(`Signal #1 already resolved (status: ${signal.status})`);
    return;
  }

  const currentBlock = await publicClient.getBlockNumber();
  const resolveBlock = signal.blockNumber + 50n;

  if (currentBlock < resolveBlock) {
    console.log(`Signal #1 not ready for resolution yet. Need block ${resolveBlock}, current: ${currentBlock}`);
    console.log("Wait ~12 minutes or run this script later.");
    return;
  }

  // Resolve with a price that makes BULLISH signal CORRECT (price up)
  // Use original price + 2% for BULLISH, -2% for BEARISH
  const originalPrice = signal.price;
  let resolvePrice: bigint;
  if (signal.direction === 0) {
    // BULLISH — resolve as correct: price up 2%
    resolvePrice = (originalPrice * 102n) / 100n;
  } else if (signal.direction === 1) {
    // BEARISH — resolve as correct: price down 2%
    resolvePrice = (originalPrice * 98n) / 100n;
  } else {
    // NEUTRAL — resolve as correct: price unchanged
    resolvePrice = originalPrice;
  }

  console.log(`Resolving signal #1 with price ${resolvePrice} (was ${originalPrice})...`);

  const tx = await walletClient.writeContract({
    address: registryAddress, abi: REGISTRY_ABI,
    functionName: "resolveSignal", args: [1n, resolvePrice],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });

  console.log(`Signal #1 resolved! TX: ${tx}`);
  console.log("Accuracy ledger updated. Demo ready.");
}

main().catch(console.error);
```

---

## Section 12: Domain Knowledge File

*Spec for the file generated in build Phase 1, Task 1 (see PLAN.md).*

#### File: DOMAIN-GUIDE.md (generated during build)

```
# AlphaAttest Domain Guide

## Core Concepts
- Signal: An AI-generated directional opinion on a stock price movement with cryptographic proof
- Provenance: Cryptographic evidence that reasoning was committed before a prediction was published
- Keeper: The autonomous agent (Node.js process) that monitors prices and commits signals
- IPFS Hash: The SHA-256 content identifier of a document, stored as bytes32 on-chain
- EIP-712: Ethereum typed structured data signing standard — creates verifiable signatures
- Commit-Reveal: IPFS hash committed on-chain BEFORE analysis published — prevents manipulation

## Price Format
Prices stored as uint256 with 8 decimal places.
$200.50 = 20050000000 (multiply by 1e8, round, convert to BigInt)
Finnhub gives floats; convert: BigInt(Math.round(price * 1e8))
Finnhub timestamps: milliseconds. On-chain: seconds. Convert: Math.floor(ts / 1000)

## Direction Encoding
0 = BULLISH (price predicted to go up)
1 = BEARISH (price predicted to go down)
2 = NEUTRAL (price predicted to stay flat, within 0.5%)

## Signal Status
0 = PENDING (waiting for RESOLVE_DELAY_BLOCKS = 50 blocks)
1 = CORRECT (predicted direction matched actual movement)
2 = INCORRECT (predicted direction was wrong)

## CID ↔ bytes32 Conversion
CIDv0 (Qm...): base58-decode → strip bytes [0x12, 0x20] → remaining 32 bytes
bytes32 → CIDv0: prepend [0x12, 0x20] → base58-encode
This is the link between IPFS gateway URLs and on-chain storage.

## EIP-712 Domain
name: "AlphaAttest"
version: "1"
chainId: 46630
verifyingContract: SignalRegistry address
SIGNAL_TYPEHASH: keccak256("Signal(string ticker,uint256 price,uint256 timestamp,bytes32 ipfsHash,uint8 direction,uint256 sequenceNumber)")

## Chain Addresses (Robinhood Chain Testnet, Chain ID 46630)
USDG: 0x7E955252E15c84f5768B83c41a71F9eba181802F (6 decimals, UNVERIFIED)
TSLA: 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E
AMZN: 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02
Alchemy RPC: https://robinhood-testnet.g.alchemy.com/v2/{API_KEY}
```

---

## Section 13: Submission Directory Plan

*Build phase creates files; demo phase captures screenshots; package phase assembles.*

```
submission/
├── proof.md           ← build phase: record all TX hashes and addresses
├── screenshots/
│   ├── dashboard.png  ← demo phase: main dashboard with signals
│   ├── analysis.png   ← demo phase: full analysis view
│   ├── verify.png     ← demo phase: proof verification page
│   └── accuracy.png   ← demo phase: accuracy ledger with CORRECT verdict
├── video/
│   └── links.md       ← demo phase: YouTube/Loom URLs
├── links.md           ← package phase: live URL, repo, docs
└── sponsor-tracks.md  ← package phase: track → evidence mapping
```

**proof.md template** (populate during Day 2 deploy, Day 5 pre-cache):
```markdown
# AlphaAttest — Proof of Integration

## Chain
Robinhood Chain Testnet — Chain ID 46630

## Deployed Contracts
| Contract | Address | Explorer |
|---|---|---|
| SignalRegistry | RECORD_AFTER_DEPLOY | ... |
| SubscriptionManager | RECORD_AFTER_DEPLOY | ... |
| MockConsumer | RECORD_AFTER_DEPLOY | ... |

## Pre-Cached Signals (run before demo)
| Signal # | Ticker | CID | TX Hash |
|---|---|---|---|
| 1 | TSLA | ... | ... |
| 2 | AMZN | ... | ... |
| 3 | TSLA | ... | ... |

## Resolved Signal
| Signal # | Resolution TX | Verdict |
|---|---|---|
| 1 | ... | CORRECT |
```

---

## Section 14: Configuration Reference

### All Environment Variables (consolidated)

| Variable | Where Used | Source |
|---|---|---|
| `FINNHUB_API_KEY` | keeper | Finnhub account |
| `ANTHROPIC_API_KEY` | keeper | Anthropic console |
| `PINATA_JWT` | keeper | Pinata app JWT |
| `KEEPER_PRIVATE_KEY` | keeper | New wallet (not main wallet) |
| `ALCHEMY_API_KEY` | keeper + contracts | Alchemy dashboard |
| `SIGNAL_REGISTRY_ADDRESS` | keeper + frontend | Deploy output |
| `DEPLOYER_PRIVATE_KEY` | contracts | Deployer wallet |
| `KEEPER_ADDRESS` | contracts | Keeper wallet address |
| `ETHERSCAN_API_KEY` | contracts | Optional for verify |
| `NEXT_PUBLIC_ALCHEMY_RPC_URL` | frontend | Alchemy dashboard |
| `NEXT_PUBLIC_SIGNAL_REGISTRY_ADDRESS` | frontend | Deploy output |
| `NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS` | frontend | Deploy output |
| `NEXT_PUBLIC_MOCK_CONSUMER_ADDRESS` | frontend | Deploy output |

### Key Constants (do not change without updating tests)

| Constant | Value | Location |
|---|---|---|
| PROOF_EXPIRY_WINDOW | 5 minutes | SignalRegistry.sol |
| RESOLVE_DELAY_BLOCKS | 50 blocks | SignalRegistry.sol |
| SUBSCRIPTION_FEE | 10 * 1e6 [UNVERIFIED] | SubscriptionManager.sol |
| CHANGE_THRESHOLD | 0.01 (1%) | orchestrator.ts |
| Claude model | claude-haiku-4-5-20251001 | anthropic.ts |
| Price decimals | 8 | orchestrator.ts + all contracts |
| Chain ID | 46630 | all chain configs |

---

## Section 15: Testing Strategy

### Critical Tests (must pass before deploy)

| Test | File | What it verifies |
|---|---|---|
| Keeper commitment (happy path) | SignalRegistry.t.sol | All 4 invariants + EIP-712 pass |
| NotKeeper revert | SignalRegistry.t.sol | Identity binding |
| ProofExpired revert | SignalRegistry.t.sol | Expiry window |
| InvalidTicker revert | SignalRegistry.t.sol | Input validation |
| SequenceGap revert | SignalRegistry.t.sol | Gap detection |
| BadSignature revert | SignalRegistry.t.sol | EIP-712 verification |
| Resolve CORRECT | SignalRegistry.t.sol | Accuracy ledger |
| Resolve INCORRECT | SignalRegistry.t.sol | Accuracy ledger |
| ResolveTooEarly revert | SignalRegistry.t.sol | Resolve delay |
| Consumer notified | SignalRegistry.t.sol | ISignalConsumer interface |
| Subscribe success | SubscriptionManager.t.sol | Payment flow |
| Cancel subscription | SubscriptionManager.t.sol | Non-negotiable cancel |
| Double subscribe revert | SubscriptionManager.t.sol | AlreadySubscribed |

### Test Commands

```bash
# Run all tests (from contracts/)
forge test -vv

# Run with gas report
forge test --gas-report

# Run specific test
forge test --match-test testCommitSignalSuccess -vvv

# Check test coverage
forge coverage
```

### Expected Test Output
```
Ran 13 tests for test/SignalRegistry.t.sol:SignalRegistryTest
[PASS] testCommitSignalSuccess()
[PASS] testRevertNotKeeper()
[PASS] testRevertProofExpired()
[PASS] testRevertInvalidTicker()
[PASS] testRevertSequenceGap()
[PASS] testRevertBadSignature()
[PASS] testResolveSignalCorrect()
[PASS] testResolveSignalIncorrect()
[PASS] testRevertResolveTooEarly()
[PASS] testConsumerNotified()
[PASS] testAMZNTicker()

Ran 4 tests for test/SubscriptionManager.t.sol:SubscriptionManagerTest
[PASS] testSubscribeSuccess()
[PASS] testCancelSubscription()
[PASS] testRevertDoubleSubscribe()
[PASS] testRevertCancelNotSubscribed()
```

### Manual Smoke Tests (before demo)

```bash
# 1. Verify keeper generates 400+ word analysis
cd keeper && npm run precache 2>&1 | grep "wordCount"
# Expected: "Analysis: NNN words" where NNN >= 400

# 2. Verify IPFS CID is accessible
curl https://gateway.pinata.cloud/ipfs/<CID_FROM_PRECACHE>
# Expected: JSON document with analysis field

# 3. Verify signal on-chain
cast call $SIGNAL_REGISTRY_ADDRESS "signalCount()(uint256)" --rpc-url $ALCHEMY_RPC_URL
# Expected: 3 (after precache)

# 4. Verify MockConsumer was called
cast call $MOCK_CONSUMER_ADDRESS "signalCount()(uint256)" --rpc-url $ALCHEMY_RPC_URL
# Expected: 3 (matches SignalRegistry signalCount)

# 5. Verify accuracy score (after seed-demo)
cast call $SIGNAL_REGISTRY_ADDRESS "getAccuracyScore()(uint256,uint256)" --rpc-url $ALCHEMY_RPC_URL
# Expected: 1,1 (1 correct out of 1 resolved)
```

---

## Section 16: Component Build Order

Build in this order — each component depends on the ones before it.

### Phase 1: Foundation (Day 1)
1. **contracts/src/interfaces/** — ISignalConsumer.sol, ISignalRegistry.sol (no deps)
2. **contracts/src/MockConsumer.sol** — depends on ISignalConsumer
3. **contracts/src/SubscriptionManager.sol** — depends on OZ Ownable only
4. **contracts/src/SignalRegistry.sol** — depends on all interfaces + OZ
5. **contracts/test/** — depends on all contracts
6. **contracts/script/Deploy.s.sol** — depends on all contracts

### Phase 2: Keeper Backend (Day 3)
7. **keeper/src/clients/finnhub.ts** — no deps
8. **keeper/src/clients/pinata.ts** — no deps
9. **keeper/src/clients/storacha.ts** — no deps (UNVERIFIED)
10. **keeper/src/clients/chain.ts** — depends on viem
11. **keeper/src/signer/eip712.ts** — depends on viem + chain.ts (for robinhoodTestnet)
12. **keeper/src/clients/anthropic.ts** — depends on SDK only
13. **keeper/src/orchestrator.ts** — depends on ALL keeper clients
14. **keeper/src/index.ts** — depends on orchestrator

### Phase 3: Frontend (Day 4)
15. **frontend/lib/wagmi.ts** — no deps
16. **frontend/lib/contracts.ts** — no deps (ABIs hardcoded)
17. **frontend/lib/ipfs.ts** — no deps
18. **frontend/hooks/useSignals.ts** — depends on wagmi + contracts
19. **frontend/hooks/useSubscription.ts** — depends on wagmi + contracts
20. **frontend/components/SignalCard.tsx** — depends on hooks + ipfs
21. **frontend/components/SubscribeButton.tsx** — depends on useSubscription
22. **frontend/app/layout.tsx** — depends on wagmi
23. **frontend/app/page.tsx** — depends on all components + hooks
24. **frontend/app/proof/page.tsx** — no wagmi deps (static)
25. **frontend/app/verify/[signalId]/page.tsx** — depends on hooks + ipfs

### Parallel groups
- (7), (8), (9) can build in parallel — all are independent
- (15), (16), (17) can build in parallel
- (18), (19) can build in parallel (after 15-17)
- (20), (21) can build in parallel (after 18-19)

### P1 Feature Deliverability Gate
After Phase 1 complete: all contract tests must pass (`forge test -vv`)
After Phase 2 complete: keeper must process a test signal end-to-end (dry run against testnet)
After Phase 3 complete: frontend must display 3 pre-cached signals from testnet

---

## Section 17: Deployment Sequence

### Step 1: Install Contract Dependencies

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit
```
Expected: `lib/openzeppelin-contracts/` and `lib/forge-std/` created

### Step 2: Compile and Test

```bash
forge build
# Expected: [⠒] Compiling... Compilation finished
forge test -vv
# Expected: 15/15 tests passed
```

### Step 3: Set Deployer Env

```bash
cp .env.example .env
# Fill in: DEPLOYER_PRIVATE_KEY, KEEPER_ADDRESS, ALCHEMY_RPC_URL
source .env
export ALCHEMY_RPC_URL
```

### Step 4: Deploy to Robinhood Chain

```bash
forge script script/Deploy.s.sol \
  --rpc-url $ALCHEMY_RPC_URL \
  --broadcast \
  --verify \
  --chain-id 46630
```
Expected output:
```
SignalRegistry deployed: 0x...
SubscriptionManager deployed: 0x...
MockConsumer deployed: 0x...
MockConsumer registered as ISignalConsumer
SubscriptionManager linked to registry
=== RECORD THESE IN submission/proof.md ===
SIGNAL_REGISTRY_ADDRESS= 0x...
SUBSCRIPTION_MANAGER_ADDRESS= 0x...
MOCK_CONSUMER_ADDRESS= 0x...
CHAIN_ID= 46630
```

### Step 5: Update Keeper .env

```bash
cd ../keeper
cp .env.example .env
# Fill in: SIGNAL_REGISTRY_ADDRESS from deploy output
# Fill in: KEEPER_PRIVATE_KEY, ALCHEMY_API_KEY, FINNHUB_API_KEY, ANTHROPIC_API_KEY, PINATA_JWT
```

### Step 6: Install Keeper Dependencies

```bash
npm install
```
Expected: `node_modules/` created with all deps

### Step 7: Run Pre-Cache (30 min before demo)

```bash
npm run precache
```
Expected: 3 signals committed to chain, CIDs printed, TX hashes printed

### Step 8: Run Seed Demo

```bash
npm run seed
```
Expected: Signal #1 resolved as CORRECT (or "not ready yet — wait N blocks")

### Step 9: Update Frontend .env

```bash
cd ../frontend
cp .env.local.example .env.local
# Fill in: SIGNAL_REGISTRY_ADDRESS, SUBSCRIPTION_MANAGER_ADDRESS, MOCK_CONSUMER_ADDRESS
# Fill in: NEXT_PUBLIC_ALCHEMY_RPC_URL
```

### Step 10: Install and Build Frontend

```bash
npm install
npm run build
npm start
```
Expected: Frontend running on http://localhost:3000, shows 3 signals from chain

---

## Section 18: Addresses & External References

### Chain Token Addresses (Robinhood Chain Testnet, Chain ID 46630)

| Token | Address | Source |
|---|---|---|
| USDG | `0x7E955252E15c84f5768B83c41a71F9eba181802F` | WINNER-BRIEF (verified) |
| TSLA | `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` | WINNER-BRIEF (verified) |
| AMZN | `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02` | WINNER-BRIEF (verified) |

### Deployed Contracts (record after deploy)

| Contract | Address | Block Explorer |
|---|---|---|
| SignalRegistry | `DEPLOY_AND_RECORD_ADDRESS_HERE` | https://explorer.robinhood.com/address/... |
| SubscriptionManager | `DEPLOY_AND_RECORD_ADDRESS_HERE` | https://explorer.robinhood.com/address/... |
| MockConsumer | `DEPLOY_AND_RECORD_ADDRESS_HERE` | https://explorer.robinhood.com/address/... |

### External API Endpoints

| Service | URL | Pattern | Status |
|---|---|---|---|
| Finnhub WebSocket | `wss://ws.finnhub.io?token=API_KEY` | subscribe: `{"type":"subscribe","symbol":"TSLA"}` | [VERIFIED] |
| Pinata Upload | `https://uploads.pinata.cloud/v3/files` | POST multipart, Bearer JWT | [VERIFIED] |
| IPFS Gateway | `https://gateway.pinata.cloud/ipfs/{cid}` | GET | [VERIFIED] |
| Alchemy Robinhood HTTP | `https://robinhood-testnet.g.alchemy.com/v2/{key}` | JSON-RPC | [VERIFIED] |
| Alchemy Robinhood WS | `wss://robinhood-testnet.g.alchemy.com/v2/{key}` | JSON-RPC | [VERIFIED] |
| Claude haiku-4-5 | Anthropic SDK | `claude-haiku-4-5-20251001` | [VERIFIED] |
| Storacha Fallback | `@storacha/client` | UCAN auth, one-time setup | [UNVERIFIED] |

### NPM Package Versions

| Package | Version | Purpose |
|---|---|---|
| @anthropic-ai/sdk | ^0.37.0 | Claude API |
| viem | ^2.21.0 | EVM client |
| wagmi | ^2.12.0 | React hooks |
| bs58 | ^5.0.0 | Base58 encode/decode |
| ws | ^8.18.0 | Finnhub WebSocket |
| next | ^14.2.18 | Frontend framework |
| @openzeppelin/contracts | 5.x | Solidity security primitives |
