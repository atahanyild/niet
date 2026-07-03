// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import { OriginSettler } from "../src/OriginSettler.sol";

/// Deploy Niet's OriginSettler to Base Sepolia.
contract DeployTestnet is Script {
    // Base Sepolia Circle CCTP V2
    address constant TOKEN_MESSENGER_V2 = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    // Stellar CCTP domain
    uint32 constant DEST_DOMAIN = 27;

    // NietSettler on Stellar testnet, as bytes32
    // Stellar address: CAVJPLSNRHZ35GYCQLNGFDUCMGIYHFHI7SOUBBR2ZL7WCWPOQGDW6AX4
    bytes32 constant NIET_SETTLER =
        0x2a97ae4d89f3be9b0282da628e8261918394e8fc9d40863acaff6159ee81876f;

    // Circle CCTP V2 Fast Transfer finality threshold
    uint32 constant FAST_THRESHOLD = 1000;

    function run() external returns (OriginSettler) {
        uint256 deployerKey = vm.envUint("BASE_SEPOLIA_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        OriginSettler settler = new OriginSettler(
            TOKEN_MESSENGER_V2,
            USDC,
            DEST_DOMAIN,
            NIET_SETTLER,
            FAST_THRESHOLD
        );

        vm.stopBroadcast();
        console.log("OriginSettler deployed at:", address(settler));
        return settler;
    }
}
