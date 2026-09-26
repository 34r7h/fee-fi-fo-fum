// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";

/// @notice Deploys 1inch's AquaSwapVMRouter (swap-vm release/1.0.2) bound to the official Aqua.
/// @dev Inputs come from deployments/<network>.json (NETWORK env, default "sepolia"); the deployer key from
///      DEPLOYER_PK in the environment, never from a file in the repo. The deployer becomes the router owner,
///      whose only power is rescuing tokens sent to the router by mistake.
contract DeployRouter is Script {
    string internal constant NAME = "AquaSwapVMRouter";
    string internal constant VERSION = "1.0.2";

    function run() external returns (AquaSwapVMRouter router) {
        string memory network = vm.envOr("NETWORK", string("sepolia"));
        string memory json = vm.readFile(string.concat("deployments/", network, ".json"));
        address aqua = vm.parseJsonAddress(json, ".external.aqua");
        address weth = vm.parseJsonAddress(json, ".external.weth");
        require(aqua.code.length > 0, "aqua has no code on this chain");
        require(weth.code.length > 0, "weth has no code on this chain");

        uint256 pk = vm.envUint("DEPLOYER_PK");
        address owner = vm.addr(pk);
        vm.startBroadcast(pk);
        router = new AquaSwapVMRouter(aqua, weth, owner, NAME, VERSION);
        vm.stopBroadcast();

        require(address(router.AQUA()) == aqua, "router bound to the wrong aqua");
        console2.log("AquaSwapVMRouter", address(router));
        console2.log("aqua", aqua);
        console2.log("weth", weth);
        console2.log("owner", owner);
    }
}
