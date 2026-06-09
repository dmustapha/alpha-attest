// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SignalRegistry.sol";
import "../src/MockConsumer.sol";

/// @notice Minimal ERC20 so MockConsumer.onSignalPublished() can call balanceOf without reverting.
contract MockTSLA {
    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}

contract SignalRegistryTest is Test {
    SignalRegistry public registry;
    MockConsumer public consumer;
    MockTSLA public mockTSLA;

    address public owner;
    address public keeper;
    uint256 public keeperKey;

    bytes32 private DOMAIN_SEPARATOR;
    bytes32 private constant SIGNAL_TYPEHASH = keccak256(
        "Signal(string ticker,uint256 price,uint256 timestamp,bytes32 ipfsHash,uint8 direction,uint256 sequenceNumber)"
    );

    // Test constants — price in 8-decimal fixed-point
    uint256 constant TSLA_PRICE = 200_00000000; // $200.00
    uint256 constant TSLA_PRICE_UP = 205_00000000; // $205.00 — BULLISH correct
    bytes32 constant SAMPLE_IPFS = bytes32(uint256(0xabcdef1234567890));

    function setUp() public {
        // Warp to a real timestamp so `block.timestamp - 10` doesn't underflow
        vm.warp(1_700_000_000);

        owner = address(this);
        (keeper, keeperKey) = makeAddrAndKey("keeper");

        registry = new SignalRegistry(keeper);
        mockTSLA = new MockTSLA();
        consumer = new MockConsumer(address(mockTSLA));

        registry.registerConsumer(address(consumer));
        DOMAIN_SEPARATOR = registry.getDomainSeparator();
    }

    // ─── Helper: produce a valid EIP-712 signature ───────────────────────────
    function _sign(
        string memory ticker,
        uint256 price,
        uint256 timestamp,
        bytes32 ipfsHash,
        uint8 direction,
        uint256 sequenceNumber
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            SIGNAL_TYPEHASH,
            keccak256(bytes(ticker)),
            price,
            timestamp,
            ipfsHash,
            direction,
            sequenceNumber
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keeperKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // ─── Happy path ───────────────────────────────────────────────────────────
    function testCommitSignalSuccess() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);

        vm.prank(keeper);
        uint256 id = registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);

        assertEq(id, 1);
        assertEq(registry.signalCount(), 1);
        assertEq(registry.lastSequenceNumber(), 1);

        SignalRegistry.Signal memory s = registry.getSignal(1);
        assertEq(s.ticker, "TSLA");
        assertEq(s.price, TSLA_PRICE);
        assertEq(s.direction, 0);
        assertEq(s.status, 0); // PENDING
        assertEq(s.ipfsHash, SAMPLE_IPFS);
    }

    // ─── Invariant 2: NotKeeper ───────────────────────────────────────────────
    function testRevertNotKeeper() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);

        // Call as non-keeper — must revert
        vm.expectRevert(SignalRegistry.NotKeeper.selector);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);
    }

    // ─── Invariant 1: ProofExpired ────────────────────────────────────────────
    function testRevertProofExpired() public {
        uint256 oldTs = block.timestamp - 6 minutes; // older than 5 min window
        bytes memory sig = _sign("TSLA", TSLA_PRICE, oldTs, SAMPLE_IPFS, 0, 1);

        vm.prank(keeper);
        vm.expectRevert();
        registry.commitSignal("TSLA", TSLA_PRICE, oldTs, SAMPLE_IPFS, 0, 1, sig);
    }

    // ─── Invariant 4: InvalidTicker ───────────────────────────────────────────
    function testRevertInvalidTicker() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("NVDA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);

        vm.prank(keeper);
        vm.expectRevert();
        registry.commitSignal("NVDA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);
    }

    // ─── Invariant 3: SequenceGap ─────────────────────────────────────────────
    function testRevertSequenceGap() public {
        // Commit seq=1 first
        uint256 ts = block.timestamp - 10;
        bytes memory sig1 = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig1);

        // Try seq=3 (skip 2) — must revert
        bytes memory sig3 = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 3);
        vm.prank(keeper);
        vm.expectRevert();
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 3, sig3);
    }

    // ─── Invariant 5: InvalidSignature ───────────────────────────────────────
    function testRevertBadSignature() public {
        uint256 ts = block.timestamp - 10;
        bytes memory badSig = abi.encodePacked(bytes32(0), bytes32(0), uint8(27));

        vm.prank(keeper);
        // OZ v5 ECDSA throws ECDSAInvalidSignature before our check — any revert is correct
        vm.expectRevert();
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, badSig);
    }

    // ─── Accuracy Ledger: Resolve CORRECT ─────────────────────────────────────
    function testResolveSignalCorrect() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1); // BULLISH
        vm.prank(keeper);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);

        vm.roll(block.number + 51); // past resolve delay

        // Price went up → BULLISH was CORRECT
        registry.resolveSignal(1, TSLA_PRICE_UP);

        SignalRegistry.Signal memory s = registry.getSignal(1);
        assertEq(s.status, 1); // CORRECT
        assertEq(s.resolvedPrice, TSLA_PRICE_UP);

        (uint256 correct, uint256 total) = registry.getAccuracyScore();
        assertEq(correct, 1);
        assertEq(total, 1);
    }

    // ─── Accuracy Ledger: Resolve INCORRECT ───────────────────────────────────
    function testResolveSignalIncorrect() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1); // BULLISH
        vm.prank(keeper);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);

        vm.roll(block.number + 51);

        // Price went down → BULLISH was INCORRECT
        registry.resolveSignal(1, 195_00000000);

        SignalRegistry.Signal memory s = registry.getSignal(1);
        assertEq(s.status, 2); // INCORRECT

        (uint256 correct, uint256 total) = registry.getAccuracyScore();
        assertEq(correct, 0);
        assertEq(total, 1);
    }

    // ─── Resolve: Too early ───────────────────────────────────────────────────
    function testRevertResolveTooEarly() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);

        vm.expectRevert();
        registry.resolveSignal(1, TSLA_PRICE_UP); // no vm.roll — too early
    }

    // ─── ISignalConsumer: Consumer notified ──────────────────────────────────
    function testConsumerNotified() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1);
        vm.prank(keeper);
        registry.commitSignal("TSLA", TSLA_PRICE, ts, SAMPLE_IPFS, 0, 1, sig);

        assertEq(consumer.signalCount(), 1);
        MockConsumer.ReceivedSignal memory received = consumer.getLastSignal();
        assertEq(received.ipfsHash, SAMPLE_IPFS);
        assertEq(received.price, TSLA_PRICE);
        assertEq(received.direction, 0);
    }

    // ─── AMZN ticker works ────────────────────────────────────────────────────
    function testAMZNTicker() public {
        uint256 ts = block.timestamp - 10;
        bytes memory sig = _sign("AMZN", TSLA_PRICE, ts, SAMPLE_IPFS, 1, 1); // BEARISH

        vm.prank(keeper);
        uint256 id = registry.commitSignal("AMZN", TSLA_PRICE, ts, SAMPLE_IPFS, 1, 1, sig);
        assertEq(id, 1);
    }
}
