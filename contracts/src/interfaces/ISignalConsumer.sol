// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface for contracts that consume AlphaAttest signals (v1.1).
/// @dev Register with SignalRegistry.registerConsumer(). Called on every commitSignal.
///      v1.1 adds signalId and ticker so real integrators (rebalancers, hedging vaults)
///      know which asset the signal concerns and can look the signal up on the registry.
interface ISignalConsumer {
    /// @notice Called by SignalRegistry on every new signal publication.
    /// @param signalId Registry signal ID (1-indexed) — use getSignal(signalId) for full data
    /// @param ticker Asset ticker the signal concerns ("TSLA" or "AMZN")
    /// @param ipfsHash bytes32 SHA-256 digest of the IPFS analysis document (CIDv1 raw-codec digest)
    /// @param price Signal price in fixed-point with 8 decimal places (e.g., 200_00000000 = $200.00)
    /// @param direction 0=BULLISH, 1=BEARISH, 2=NEUTRAL
    function onSignalPublished(
        uint256 signalId,
        string calldata ticker,
        bytes32 ipfsHash,
        uint256 price,
        uint8 direction
    ) external;
}
