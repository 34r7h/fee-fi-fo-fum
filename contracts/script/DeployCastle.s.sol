// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";

import { Castle } from "../src/Castle.sol";
import { FeeFiFoFumExtruction } from "../src/FeeFiFoFumExtruction.sol";
import { JackHook } from "../src/JackHook.sol";
import { IENSv2Registry } from "../src/interfaces/IENSv2.sol";

/// @notice Deploys the fence, JackHook (unless JACK_HOOK names a live one to reuse) and Castle, then runs the owner
///         steps that need no ENS role (setCrew for fee and fi, setAuctioneer fum). The registry admin grants Castle
///         its root roles next (the same as v2): REGISTRAR | RENEW on the registry, LINK | SET_DATA on
///         the resolver. Only then can the owner seed the anchor (setAnchorPrice needs SET_DATA on the resolver).
/// @dev Addresses come from deployments/<network>.json and deployments/ens-agents.<network>.json; the crew and fo from
///      the environment (defaults: agents/crew.json). The key comes from DEPLOYER_PK, never a file in the repo.
contract DeployCastle is Script {
    uint64 internal constant LEASE_PERIOD = 1 days; // v3: one renew a day; heartbeats carry liveness
    uint32 internal constant WIND_DOWN_FEE_BPS = 5e7; // 5%
    uint16 internal constant DECAY_PERIOD = 60;
    uint64 internal constant DISSOLVE_GRACE = 1800; // owner-tunable later within [120s, 1 day]

    function run() external returns (FeeFiFoFumExtruction fence, JackHook jackHook, Castle castle) {
        string memory network = vm.envOr("NETWORK", string("sepolia"));
        string memory ext = vm.readFile(string.concat("deployments/", network, ".json"));
        string memory ens = vm.readFile(string.concat("deployments/ens-agents.", network, ".json"));
        address registry = vm.parseJsonAddress(ens, ".agentRegistry");
        address resolver = vm.parseJsonAddress(ens, ".resolver");
        address fee = vm.envOr("FEE_ADDRESS", address(0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538));
        address fi = vm.envOr("FI_ADDRESS", address(0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2));
        address fo = vm.envOr("FO_ADDRESS", address(0x8689a407A2488A5b2f2De05d2C6978a798f93D56));
        address fum = vm.envOr("FUM_ADDRESS", address(0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2));

        Castle.Config memory c = Castle.Config({
            aqua: vm.parseJsonAddress(ext, ".external.aqua"),
            router: vm.parseJsonAddress(ext, ".contracts.aquaSwapVMRouter.address"),
            fence: address(0),
            registry: registry,
            resolver: resolver,
            weth: vm.parseJsonAddress(ext, ".external.weth"),
            usdc: vm.parseJsonAddress(ext, ".external.usdc"),
            fo: fo,
            owner: address(0),
            label: "castle",
            dnsName: abi.encodePacked(uint8(6), "castle", uint8(10), "feefifofum", uint8(3), "eth", uint8(0)),
            leasePeriod: LEASE_PERIOD,
            registryEpoch: true,
            windDownFeeBps: WIND_DOWN_FEE_BPS,
            decayPeriod: DECAY_PERIOD,
            ccaFactory: vm.parseJsonAddress(ext, ".external.ccaFactory"),
            jackHook: address(0),
            dissolveGrace: DISSOLVE_GRACE
        });
        require(c.router.code.length > 0 && registry.code.length > 0 && resolver.code.length > 0, "missing code");
        require(c.ccaFactory.code.length > 0, "no CCA factory");

        uint256 pk = vm.envUint("DEPLOYER_PK");
        c.owner = vm.addr(pk);
        vm.startBroadcast(pk);
        fence = new FeeFiFoFumExtruction();
        address liveHook = vm.envOr("JACK_HOOK", address(0));
        jackHook = liveHook == address(0) ? new JackHook(IENSv2Registry(registry)) : JackHook(liveHook);
        require(address(jackHook.REGISTRY()) == registry, "JackHook reads another registry");
        c.fence = address(fence);
        c.jackHook = address(jackHook);
        castle = new Castle(c);
        castle.setCrew(fee, "fee");
        castle.setCrew(fi, "fi");
        castle.setAuctioneer(fum);
        vm.stopBroadcast();

        require(castle.NODE() == vm.ensNamehash("castle.feefifofum.eth"), "node");
        require(castle.isCrew(fee) && castle.isCrew(fi), "crew names must be live in the agent registry");
        console2.log("FeeFiFoFumExtruction", address(fence));
        console2.log("JackHook", address(jackHook));
        console2.log("Castle", address(castle));
        console2.log("owner", c.owner);
    }
}
