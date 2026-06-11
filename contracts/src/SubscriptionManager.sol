// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title SubscriptionManager
/// @notice Manages USDG-gated monthly subscriptions to AlphaAttest signals.
/// @dev v1.1: subscriptions are timed (30 days) and renewable — renewal extends from
///      max(now, current expiry). cancelSubscription() is callable at any time — per spec.
contract SubscriptionManager is Ownable {
    // USDG (0x7E955252...) verified on-chain: decimals() == 6. Fee = 10 USDG.
    uint256 public constant SUBSCRIPTION_FEE = 10 * 1e6;

    uint256 public constant SUBSCRIPTION_PERIOD = 30 days;

    IERC20Minimal public immutable usdg;

    mapping(address => uint256) private _subscribedUntil;
    uint256 public totalRevenue;

    event Subscribed(address indexed subscriber, uint256 fee);
    event SubscriptionCancelled(address indexed subscriber);
    event FeesWithdrawn(address indexed owner, uint256 amount);

    error NotSubscribed();
    error PaymentFailed();

    constructor(address _usdg) Ownable(msg.sender) {
        require(_usdg != address(0), "USDG cannot be zero address");
        usdg = IERC20Minimal(_usdg);
    }

    /// @notice Pay SUBSCRIPTION_FEE USDG for 30 days of access. Requires prior ERC20 approval.
    /// @dev Renewals stack: extends from current expiry if still active, from now if lapsed.
    function subscribe() external {
        uint256 base = _subscribedUntil[msg.sender] > block.timestamp
            ? _subscribedUntil[msg.sender]
            : block.timestamp;

        // CEI: update state BEFORE external call to prevent reentrancy
        _subscribedUntil[msg.sender] = base + SUBSCRIPTION_PERIOD;
        totalRevenue += SUBSCRIPTION_FEE;

        bool success = usdg.transferFrom(msg.sender, address(this), SUBSCRIPTION_FEE);
        if (!success) revert PaymentFailed();

        emit Subscribed(msg.sender, SUBSCRIPTION_FEE);
    }

    /// @notice Cancel subscription immediately. No refund on testnet. Callable at any time.
    function cancelSubscription() external {
        if (_subscribedUntil[msg.sender] <= block.timestamp) revert NotSubscribed();
        _subscribedUntil[msg.sender] = block.timestamp;
        emit SubscriptionCancelled(msg.sender);
    }

    /// @notice Check if an address has an active subscription.
    function isSubscriber(address account) external view returns (bool) {
        return _subscribedUntil[account] > block.timestamp;
    }

    /// @notice Unix timestamp at which the account's subscription expires (0 = never subscribed).
    function subscriptionExpiry(address account) external view returns (uint256) {
        return _subscribedUntil[account];
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
