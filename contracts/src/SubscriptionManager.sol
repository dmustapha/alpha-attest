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

        // CEI: update state BEFORE external call to prevent reentrancy
        _subscribers[msg.sender] = true;
        totalRevenue += SUBSCRIPTION_FEE;

        bool success = usdg.transferFrom(msg.sender, address(this), SUBSCRIPTION_FEE);
        if (!success) revert PaymentFailed();

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
