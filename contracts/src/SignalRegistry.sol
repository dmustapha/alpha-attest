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
    event SubscriptionManagerSet(address indexed subscriptionManager);

    // ─── Errors ───────────────────────────────────────────────────────────────
    error NotKeeper();
    error ProofExpired(uint256 providedTimestamp, uint256 windowStart);
    error ProofFromFuture(uint256 providedTimestamp, uint256 nowPlusTolerance);
    error InvalidDirection(uint8 direction);
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
        // Upper bound: 60s tolerance absorbs keeper/chain clock skew
        if (timestamp > block.timestamp + 60) {
            revert ProofFromFuture(timestamp, block.timestamp + 60);
        }

        // ── Invariant 4: Input schema validation ──────────────────────────────
        bytes32 tickerHash = keccak256(bytes(ticker));
        if (tickerHash != TSLA_HASH && tickerHash != AMZN_HASH) {
            revert InvalidTicker(ticker);
        }
        if (price == 0) revert InvalidPrice();
        if (direction > 2) revert InvalidDirection(direction);

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
        _notifyConsumers(signalId, ticker, ipfsHash, price, direction);

        emit SignalCommitted(signalId, ticker, price, timestamp, ipfsHash, direction, sequenceNumber);
    }

    // ─── Accuracy Ledger: Resolve Signal ─────────────────────────────────────
    /// @notice Resolve a pending signal against the observed market price.
    /// @dev TRUST MODEL (testnet): resolution price is supplied by the keeper from the
    ///      same Finnhub feed that triggered the signal. Robinhood Chain testnet has no
    ///      canonical price oracle to read trustlessly; on mainnet this becomes an
    ///      oracle read (e.g. EquityPriceOracle) and loses the keeper trust assumption.
    ///      Keeper-only beats permissionless here: an open resolver with caller-supplied
    ///      price lets anyone permanently falsify the ledger.
    function resolveSignal(uint256 signalId, uint256 actualPrice) external {
        if (msg.sender != keeper) revert NotKeeper();
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
            // movement * 10_000 / originalPrice < 50 means < 0.5% (0.01% granularity)
            correct = (movement * 10_000 / originalPrice) < 50;
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
        emit SubscriptionManagerSet(_subscriptionManager);
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
    function _notifyConsumers(
        uint256 signalId,
        string calldata ticker,
        bytes32 ipfsHash,
        uint256 price,
        uint8 direction
    ) internal {
        for (uint256 i = 0; i < consumers.length; i++) {
            // try/catch: one bad consumer cannot block all others
            try ISignalConsumer(consumers[i]).onSignalPublished(signalId, ticker, ipfsHash, price, direction) {
                // success
            } catch {
                // consumer reverted — continue silently
            }
        }
    }
}
