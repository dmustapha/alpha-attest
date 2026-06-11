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
    /// @dev Keeper-only (testnet trust model — see SignalRegistry.resolveSignal NatSpec).
    ///      Compares predicted direction to actual movement.
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
