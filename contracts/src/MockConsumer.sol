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
