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

    // ─── v1.1: timed subscriptions (B6) ──────────────────────────────────────

    function testSubscriptionExpiresAfter30Days() public {
        vm.startPrank(alice);
        usdg.approve(address(manager), manager.SUBSCRIPTION_FEE());
        manager.subscribe();
        vm.stopPrank();

        assertTrue(manager.isSubscriber(alice));
        vm.warp(block.timestamp + 31 days);
        assertFalse(manager.isSubscriber(alice));
    }

    function testRenewalExtendsFromCurrentExpiry() public {
        vm.startPrank(alice);
        usdg.approve(address(manager), manager.SUBSCRIPTION_FEE() * 2);
        manager.subscribe();
        uint256 firstExpiry = manager.subscriptionExpiry(alice);

        // Renew mid-period: expiry extends from the existing expiry, not from now
        vm.warp(block.timestamp + 10 days);
        manager.subscribe();
        vm.stopPrank();

        assertEq(manager.subscriptionExpiry(alice), firstExpiry + manager.SUBSCRIPTION_PERIOD());
        assertEq(manager.totalRevenue(), manager.SUBSCRIPTION_FEE() * 2);
    }

    function testResubscribeAfterLapseStartsFromNow() public {
        vm.startPrank(alice);
        usdg.approve(address(manager), manager.SUBSCRIPTION_FEE() * 2);
        manager.subscribe();

        vm.warp(block.timestamp + 60 days); // lapsed
        assertFalse(manager.isSubscriber(alice));

        manager.subscribe();
        vm.stopPrank();

        assertEq(manager.subscriptionExpiry(alice), block.timestamp + manager.SUBSCRIPTION_PERIOD());
        assertTrue(manager.isSubscriber(alice));
    }

    function testRevertCancelNotSubscribed() public {
        vm.prank(alice);
        vm.expectRevert(SubscriptionManager.NotSubscribed.selector);
        manager.cancelSubscription();
    }

    function testIsSubscriberFalseBeforeSubscribe() public view {
        assertFalse(manager.isSubscriber(alice));
    }
}
