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
