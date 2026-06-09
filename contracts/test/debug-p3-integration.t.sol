// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SignalRegistry.sol";
import "../src/SubscriptionManager.sol";
import "../src/MockConsumer.sol";

/// @notice Minimal mock TSLA token so MockConsumer.onSignalPublished() can balanceOf without reverting
contract MockTSLA is IERC20 {
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function totalSupply() external pure returns (uint256) { return 0; }
    function transfer(address, uint256) external pure returns (bool) { return false; }
    function allowance(address, address) external pure returns (uint256) { return 0; }
    function approve(address, uint256) external pure returns (bool) { return false; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return false; }
}

/// @notice Mock USDG for subscription tests
contract MockUSDG {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
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

/// @title Debug Phase 3 — Integration Tests
/// @notice Tests contract-contract connections: SignalRegistry ↔ MockConsumer ↔ SubscriptionManager
contract DebugIntegrationTest is Test {
    SignalRegistry public registry;
    SubscriptionManager public subManager;
    MockConsumer public consumer;
    MockTSLA public tsla;
    MockUSDG public usdg;

    address public owner;
    address public keeper;
    uint256 public keeperKey;
    address public subscriber = address(0xBEEF);

    bytes32 private constant SIGNAL_TYPEHASH = keccak256(
        "Signal(string ticker,uint256 price,uint256 timestamp,bytes32 ipfsHash,uint8 direction,uint256 sequenceNumber)"
    );

    function setUp() public {
        vm.warp(1_700_000_000);
        owner = address(this);
        (keeper, keeperKey) = makeAddrAndKey("keeper");

        tsla = new MockTSLA();
        usdg = new MockUSDG();

        registry = new SignalRegistry(keeper);
        subManager = new SubscriptionManager(address(usdg));
        consumer = new MockConsumer(address(tsla));

        registry.registerConsumer(address(consumer));
        registry.setSubscriptionManager(address(subManager));
    }

    // ─── Helper ──────────────────────────────────────────────────────────────
    function _sign(
        string memory ticker, uint256 price, uint256 timestamp,
        bytes32 ipfsHash, uint8 direction, uint256 seq
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            SIGNAL_TYPEHASH,
            keccak256(bytes(ticker)),
            price, timestamp, ipfsHash, direction, seq
        ));
        bytes32 digest = _hashTypedData(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keeperKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", registry.getDomainSeparator(), structHash));
    }

    function _commitSignal(uint8 direction, uint256 seqNum) internal returns (uint256 signalId) {
        uint256 price = 200_00000000;
        uint256 ts = block.timestamp - 1;
        bytes32 ipfs = bytes32(uint256(0xdead0000 + seqNum));
        bytes memory sig = _sign("TSLA", price, ts, ipfs, direction, seqNum);
        vm.prank(keeper);
        signalId = registry.commitSignal("TSLA", price, ts, ipfs, direction, seqNum, sig);
    }

    // ─── CONTRACT-CONTRACT: SignalRegistry → MockConsumer ────────────────────

    /// @notice Signal commit triggers MockConsumer.onSignalPublished correctly
    function testMockConsumerReceivesSignal() public {
        assertEq(consumer.signalCount(), 0);
        _commitSignal(0, 1); // BULLISH
        assertEq(consumer.signalCount(), 1);
        MockConsumer.ReceivedSignal memory last = consumer.getLastSignal();
        assertEq(last.direction, 0); // BULLISH
        assertEq(last.price, 200_00000000);
    }

    /// @notice Multiple consumers: all receive the signal
    function testMultipleConsumersAllReceive() public {
        MockConsumer consumer2 = new MockConsumer(address(tsla));
        registry.registerConsumer(address(consumer2));

        _commitSignal(1, 1); // BEARISH
        assertEq(consumer.signalCount(), 1);
        assertEq(consumer2.signalCount(), 1);
    }

    /// @notice Bad consumer that reverts does NOT block other consumers
    function testBadConsumerDoesNotBlockOthers() public {
        // Deploy a consumer that always reverts
        RevertingConsumer bad = new RevertingConsumer();
        registry.registerConsumer(address(bad));

        // Registry should still process successfully despite the reverting consumer
        _commitSignal(2, 1); // NEUTRAL
        // If we got here without revert — pass
        assertEq(consumer.signalCount(), 1);
    }

    /// @notice Duplicate consumer registration reverts
    function testDuplicateConsumerReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(SignalRegistry.ConsumerAlreadyRegistered.selector, address(consumer))
        );
        registry.registerConsumer(address(consumer));
    }

    // ─── CONTRACT-CONTRACT: SignalRegistry → SubscriptionManager ─────────────

    /// @notice setSubscriptionManager correctly links the two contracts
    function testSubscriptionManagerLinked() public {
        assertEq(registry.subscriptionManager(), address(subManager));
    }

    /// @notice Subscribe → isSubscriber → cancel → not subscriber
    function testSubscribeAndCancelIntegration() public {
        uint256 fee = subManager.SUBSCRIPTION_FEE();
        usdg.mint(subscriber, fee);

        vm.startPrank(subscriber);
        usdg.approve(address(subManager), fee);
        subManager.subscribe();
        assertTrue(subManager.isSubscriber(subscriber));

        subManager.cancelSubscription();
        assertFalse(subManager.isSubscriber(subscriber));
        vm.stopPrank();
    }

    /// @notice Owner can withdraw fees after subscriptions
    function testFeeWithdrawalAfterSubscriptions() public {
        uint256 fee = subManager.SUBSCRIPTION_FEE();
        usdg.mint(subscriber, fee);
        vm.startPrank(subscriber);
        usdg.approve(address(subManager), fee);
        subManager.subscribe();
        vm.stopPrank();

        assertEq(subManager.totalRevenue(), fee);
        uint256 ownerBefore = usdg.balanceOf(owner);
        subManager.withdrawFees();
        assertEq(usdg.balanceOf(owner), ownerBefore + fee);
    }

    // ─── ACCURACY LEDGER ─────────────────────────────────────────────────────

    /// @notice After resolve, accuracy score correctly reflects result
    function testAccuracyLedgerCorrectSignal() public {
        _commitSignal(0, 1); // BULLISH TSLA
        vm.roll(block.number + 51);
        // BULLISH correct: price went up
        registry.resolveSignal(1, 210_00000000);
        (uint256 correct, uint256 total) = registry.getAccuracyScore();
        assertEq(correct, 1);
        assertEq(total, 1);
    }

    function testAccuracyLedgerIncorrectSignal() public {
        _commitSignal(0, 1); // BULLISH TSLA
        vm.roll(block.number + 51);
        // BULLISH incorrect: price went down
        registry.resolveSignal(1, 190_00000000);
        (uint256 correct, uint256 total) = registry.getAccuracyScore();
        assertEq(correct, 0);
        assertEq(total, 1);
    }

    /// @notice NEUTRAL: price barely moved → correct
    function testNeutralCorrectWithSmallMove() public {
        uint256 seq = 1;
        uint256 price = 200_00000000;
        bytes32 ipfs = bytes32(uint256(0xdead0001));
        bytes memory sig = _sign("TSLA", price, block.timestamp - 1, ipfs, 2, seq);
        vm.prank(keeper);
        registry.commitSignal("TSLA", price, block.timestamp - 1, ipfs, 2, seq, sig);
        vm.roll(block.number + 51);
        // 0.1% move — well under 0.5% threshold
        registry.resolveSignal(1, 200_20000000); // +0.1%
        (uint256 correct, uint256 total) = registry.getAccuracyScore();
        assertEq(correct, 1);
        assertEq(total, 1);
    }

    /// @notice getConsumers returns all registered consumers
    function testGetConsumers() public {
        address[] memory c = registry.getConsumers();
        assertEq(c.length, 1);
        assertEq(c[0], address(consumer));
    }
}

/// @notice Consumer that always reverts — used to test try/catch in _notifyConsumers
contract RevertingConsumer is ISignalConsumer {
    function onSignalPublished(bytes32, uint256, uint8) external pure override {
        revert("RevertingConsumer: always fails");
    }
}
