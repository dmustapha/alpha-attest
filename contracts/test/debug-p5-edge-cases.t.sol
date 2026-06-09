// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SignalRegistry.sol";
import "../src/SubscriptionManager.sol";
import "../src/MockConsumer.sol";

/// @notice Minimal mocks
contract MockTSLAEdge {
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function totalSupply() external pure returns (uint256) { return 0; }
    function transfer(address, uint256) external pure returns (bool) { return false; }
    function allowance(address, address) external pure returns (uint256) { return 0; }
    function approve(address, uint256) external pure returns (bool) { return false; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return false; }
}

contract MockUSDGEdge {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount);
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "insufficient");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @title Debug Phase 5 — Edge Cases + Security Inputs
/// @notice Boundary values, zero values, max values, unauthorized callers
contract DebugEdgeCasesTest is Test {
    SignalRegistry public registry;
    SubscriptionManager public subManager;
    MockConsumer public consumer;
    MockTSLAEdge public tsla;
    MockUSDGEdge public usdg;

    address public owner;
    address public keeper;
    uint256 public keeperKey;

    bytes32 private constant SIGNAL_TYPEHASH = keccak256(
        "Signal(string ticker,uint256 price,uint256 timestamp,bytes32 ipfsHash,uint8 direction,uint256 sequenceNumber)"
    );

    function setUp() public {
        vm.warp(1_700_000_000);
        owner = address(this);
        (keeper, keeperKey) = makeAddrAndKey("keeper");
        tsla = new MockTSLAEdge();
        usdg = new MockUSDGEdge();
        registry = new SignalRegistry(keeper);
        subManager = new SubscriptionManager(address(usdg));
        consumer = new MockConsumer(address(tsla));
        registry.registerConsumer(address(consumer));
    }

    function _sign(
        string memory ticker, uint256 price, uint256 timestamp,
        bytes32 ipfsHash, uint8 direction, uint256 seq
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            SIGNAL_TYPEHASH, keccak256(bytes(ticker)),
            price, timestamp, ipfsHash, direction, seq
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", registry.getDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keeperKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // ─── ZERO VALUES ─────────────────────────────────────────────────────────

    /// @notice price=0 must revert with InvalidPrice
    function testZeroPriceReverts() public {
        bytes memory sig = _sign("TSLA", 0, block.timestamp - 1, bytes32(0), 0, 1);
        vm.prank(keeper);
        vm.expectRevert(SignalRegistry.InvalidPrice.selector);
        registry.commitSignal("TSLA", 0, block.timestamp - 1, bytes32(0), 0, 1, sig);
    }

    /// @notice Empty ticker must revert with InvalidTicker
    function testEmptyTickerReverts() public {
        bytes memory sig = _sign("", 100e8, block.timestamp - 1, bytes32(0), 0, 1);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SignalRegistry.InvalidTicker.selector, ""));
        registry.commitSignal("", 100e8, block.timestamp - 1, bytes32(0), 0, 1, sig);
    }

    /// @notice keeper=address(0) in constructor reverts
    function testKeeperZeroAddressReverts() public {
        vm.expectRevert("Keeper cannot be zero address");
        new SignalRegistry(address(0));
    }

    /// @notice updateKeeper(address(0)) reverts
    function testUpdateKeeperZeroReverts() public {
        vm.expectRevert("Keeper cannot be zero address");
        registry.updateKeeper(address(0));
    }

    // ─── MAX VALUES ───────────────────────────────────────────────────────────

    /// @notice Max uint256 price is accepted (no overflow)
    function testMaxPriceAccepted() public {
        uint256 maxPrice = type(uint256).max;
        bytes memory sig = _sign("TSLA", maxPrice, block.timestamp - 1, bytes32(0), 0, 1);
        vm.prank(keeper);
        // Should not revert (no overflow in storage)
        registry.commitSignal("TSLA", maxPrice, block.timestamp - 1, bytes32(0), 0, 1, sig);
        SignalRegistry.Signal memory s = registry.getSignal(1);
        assertEq(s.price, maxPrice);
    }

    // ─── BOUNDARY: RESOLVE TIMING ─────────────────────────────────────────────

    /// @notice Resolve at exactly RESOLVE_DELAY_BLOCKS - 1 reverts with ResolveTooEarly
    function testResolveOneBlockEarlyReverts() public {
        bytes memory sig = _sign("TSLA", 200e8, block.timestamp - 1, bytes32(uint256(1)), 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", 200e8, block.timestamp - 1, bytes32(uint256(1)), 0, 1, sig);

        // Read signal to get actual stored blockNumber (avoids block.number capture timing issues)
        SignalRegistry.Signal memory s = registry.getSignal(1);
        uint256 expectedEarliest = s.blockNumber + registry.RESOLVE_DELAY_BLOCKS();

        // Roll to one block before earliest allowed
        vm.roll(expectedEarliest - 1);
        vm.expectRevert(
            abi.encodeWithSelector(SignalRegistry.ResolveTooEarly.selector, 1, expectedEarliest)
        );
        registry.resolveSignal(1, 210e8);
    }

    /// @notice Resolve at exactly RESOLVE_DELAY_BLOCKS succeeds
    function testResolveAtExactBlockSucceeds() public {
        bytes memory sig = _sign("TSLA", 200e8, block.timestamp - 1, bytes32(uint256(1)), 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", 200e8, block.timestamp - 1, bytes32(uint256(1)), 0, 1, sig);
        uint256 signalBlock = block.number;

        vm.roll(signalBlock + registry.RESOLVE_DELAY_BLOCKS());
        registry.resolveSignal(1, 210e8); // should succeed (no revert)
    }

    // ─── UNAUTHORIZED CALLERS ─────────────────────────────────────────────────

    /// @notice Non-keeper cannot commit signal
    function testNonKeeperCannotCommit() public {
        address attacker = address(0xDEAD);
        bytes memory sig = _sign("TSLA", 200e8, block.timestamp - 1, bytes32(0), 0, 1);
        vm.prank(attacker);
        vm.expectRevert(SignalRegistry.NotKeeper.selector);
        registry.commitSignal("TSLA", 200e8, block.timestamp - 1, bytes32(0), 0, 1, sig);
    }

    /// @notice Non-owner cannot register consumer
    function testNonOwnerCannotRegisterConsumer() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        registry.registerConsumer(address(0x1234));
    }

    /// @notice Non-owner cannot update keeper
    function testNonOwnerCannotUpdateKeeper() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        registry.updateKeeper(address(0x1234));
    }

    /// @notice Non-owner cannot set subscription manager
    function testNonOwnerCannotSetSubscriptionManager() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        registry.setSubscriptionManager(address(subManager));
    }

    // ─── WRONG STATE ─────────────────────────────────────────────────────────

    /// @notice resolveSignal on already-resolved signal reverts
    function testDoubleResolveReverts() public {
        bytes memory sig = _sign("TSLA", 200e8, block.timestamp - 1, bytes32(uint256(1)), 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", 200e8, block.timestamp - 1, bytes32(uint256(1)), 0, 1, sig);
        vm.roll(block.number + 51);
        registry.resolveSignal(1, 210e8);

        vm.expectRevert(abi.encodeWithSelector(SignalRegistry.SignalNotPending.selector, 1));
        registry.resolveSignal(1, 210e8);
    }

    /// @notice resolveSignal on nonexistent signalId reverts
    function testResolveNonexistentSignalReverts() public {
        vm.expectRevert(abi.encodeWithSelector(SignalRegistry.SignalNotFound.selector, 999));
        registry.resolveSignal(999, 100e8);
    }

    /// @notice resolveSignal(0, ...) reverts (signalId=0 is invalid by design)
    function testResolveSignalIdZeroReverts() public {
        vm.expectRevert(abi.encodeWithSelector(SignalRegistry.SignalNotFound.selector, 0));
        registry.resolveSignal(0, 100e8);
    }

    // ─── PROOF EXPIRY BOUNDARY ────────────────────────────────────────────────

    /// @notice Timestamp one second before the window (expired) reverts
    /// @dev Contract condition is `timestamp < (block.timestamp - PROOF_EXPIRY_WINDOW)` — exclusive bound
    ///      windowStart = block.timestamp - PROOF_EXPIRY_WINDOW; timestamp == windowStart is ACCEPTED
    ///      timestamp == windowStart - 1 is REJECTED
    function testTimestampOneSecondExpiredReverts() public {
        uint256 windowStart = block.timestamp - registry.PROOF_EXPIRY_WINDOW();
        uint256 expiredTs = windowStart - 1;
        bytes memory sig = _sign("TSLA", 200e8, expiredTs, bytes32(0), 0, 1);
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(SignalRegistry.ProofExpired.selector, expiredTs, windowStart)
        );
        registry.commitSignal("TSLA", 200e8, expiredTs, bytes32(0), 0, 1, sig);
    }

    /// @notice Timestamp exactly at windowStart (inclusive boundary) is ACCEPTED
    function testTimestampAtWindowStartAccepted() public {
        uint256 windowStart = block.timestamp - registry.PROOF_EXPIRY_WINDOW();
        bytes memory sig = _sign("TSLA", 200e8, windowStart, bytes32(0), 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", 200e8, windowStart, bytes32(0), 0, 1, sig); // should not revert
    }

    /// @notice Timestamp one second inside the window should succeed
    function testTimestampJustInsideWindowSucceeds() public {
        uint256 ts = block.timestamp - registry.PROOF_EXPIRY_WINDOW() + 1;
        bytes memory sig = _sign("TSLA", 200e8, ts, bytes32(0), 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", 200e8, ts, bytes32(0), 0, 1, sig);
    }

    // ─── SUBSCRIPTION EDGE CASES ─────────────────────────────────────────────

    /// @notice Subscribe with insufficient USDG balance reverts
    function testSubscribeInsufficientBalanceReverts() public {
        address poor = address(0x700a);
        vm.startPrank(poor);
        usdg.approve(address(subManager), type(uint256).max);
        vm.expectRevert();
        subManager.subscribe();
        vm.stopPrank();
    }

    /// @notice Subscribe with zero allowance reverts
    function testSubscribeZeroAllowanceReverts() public {
        address user = address(0x700b);
        usdg.mint(user, subManager.SUBSCRIPTION_FEE());
        // No approval
        vm.prank(user);
        vm.expectRevert();
        subManager.subscribe();
    }

    /// @notice withdrawFees with zero balance reverts
    function testWithdrawFeesZeroBalanceReverts() public {
        vm.expectRevert("No fees to withdraw");
        subManager.withdrawFees();
    }

    // ─── NEUTRAL SIGNAL BOUNDARY ─────────────────────────────────────────────

    /// @notice NEUTRAL: exactly 0.5% move is INCORRECT (threshold is < 0.5%, not <=)
    function testNeutralBoundaryExactlyHalfPercent() public {
        uint256 price = 200_00000000; // $200 in 8-decimal fixed point
        bytes memory sig = _sign("TSLA", price, block.timestamp - 1, bytes32(uint256(0xdead)), 2, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", price, block.timestamp - 1, bytes32(uint256(0xdead)), 2, 1, sig);
        vm.roll(block.number + 51);

        // 0.5% of $200 = $1.00 => actualPrice = 201_00000000
        // movement * 1000 / originalPrice = 100000000 * 1000 / 20000000000 = 5
        // condition: 5 < 5 => false => INCORRECT
        registry.resolveSignal(1, 201_00000000);
        (uint256 correct, uint256 total) = registry.getAccuracyScore();
        assertEq(correct, 0); // INCORRECT
        assertEq(total, 1);
    }

    /// @notice NEUTRAL: 0.499% move is CORRECT (just under threshold)
    function testNeutralBoundaryJustUnderHalfPercent() public {
        uint256 price = 200_00000000;
        bytes memory sig = _sign("TSLA", price, block.timestamp - 1, bytes32(uint256(0xbeef)), 2, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", price, block.timestamp - 1, bytes32(uint256(0xbeef)), 2, 1, sig);
        vm.roll(block.number + 51);

        // 0.499% of 200 * 1e8 = ~99800000 => actualPrice = 200_99800000
        // movement = 99800000, movement * 1000 = 99800000000, / 20000000000 = 4 (integer div) < 5 => CORRECT
        registry.resolveSignal(1, 200_99800000);
        (uint256 correct,) = registry.getAccuracyScore();
        assertEq(correct, 1); // CORRECT
    }
}
