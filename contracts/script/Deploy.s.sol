// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SignalRegistry.sol";
import "../src/SubscriptionManager.sol";
import "../src/MockConsumer.sol";

contract Deploy is Script {
    // Robinhood Chain Testnet — from WINNER-BRIEF
    address constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    // <!-- [CRITIQUE E-1] TSLA address passed to MockConsumer for on-chain equity token read -->
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address keeper = vm.envAddress("KEEPER_ADDRESS");

        require(keeper != address(0), "Set KEEPER_ADDRESS in .env");

        vm.startBroadcast(deployerKey);

        // 1. Deploy SignalRegistry (keeper binds at construction)
        SignalRegistry registry = new SignalRegistry(keeper);
        console.log("SignalRegistry deployed:", address(registry));

        // 2. Deploy SubscriptionManager
        SubscriptionManager subscriptionManager = new SubscriptionManager(USDG);
        console.log("SubscriptionManager deployed:", address(subscriptionManager));

        // 3. Deploy MockConsumer with TSLA token address for on-chain equity read,
        //    bound to the registry so only it can deliver callbacks (v1.1)
        MockConsumer mockConsumer = new MockConsumer(TSLA, address(registry));
        console.log("MockConsumer deployed:", address(mockConsumer));

        // 4. Register MockConsumer with SignalRegistry (demonstrates ISignalConsumer)
        registry.registerConsumer(address(mockConsumer));
        console.log("MockConsumer registered as ISignalConsumer");

        // 5. Link SubscriptionManager reference
        registry.setSubscriptionManager(address(subscriptionManager));
        console.log("SubscriptionManager linked to registry");

        vm.stopBroadcast();

        // Print addresses for submission/proof.md
        console.log("\n=== RECORD THESE IN submission/proof.md ===");
        console.log("SIGNAL_REGISTRY_ADDRESS=", address(registry));
        console.log("SUBSCRIPTION_MANAGER_ADDRESS=", address(subscriptionManager));
        console.log("MOCK_CONSUMER_ADDRESS=", address(mockConsumer));
        console.log("CHAIN_ID=", block.chainid);
    }
}
