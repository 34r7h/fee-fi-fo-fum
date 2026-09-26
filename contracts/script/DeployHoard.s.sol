// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";

import { CastleVault } from "../src/CastleVault.sol";
import { PriceExtruction } from "../src/PriceExtruction.sol";
import { CastleJITHook } from "../src/CastleJITHook.sol";
import { OffchainQuoteResolver } from "../src/OffchainQuoteResolver.sol";

/// @notice c-deploy (docs/SPEC.md): PriceExtruction, CastleVault, OffchainQuoteResolver, CastleJITHook through the
///         CREATE2 deployer at a mined address carrying exactly its flags, and the Castle's v4 pool initialized with no
///         liquidity. Registering `quote` is the registrar's own tx (0x67Cc), sent separately.
/// @dev The deployer keeps no role: the treasury owns the vault and the resolver, fi ships and signs, fum bounds.
///      forge script script/DeployHoard.s.sol --rpc-url <rpc> --account <keystore> --sender <deployer> [--broadcast]
///      (fork rehearsal: --rpc-url <anvil fork> --unlocked --sender <deployer> --broadcast).
contract DeployHoard is Script {
    address internal constant AQUA = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;
    address internal constant ROUTER = 0xeDB6933949dB941D495b23604818F9AbF55e70f9;
    address internal constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address internal constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address internal constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address internal constant OWNER = 0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2;
    address internal constant FI = 0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2;
    address internal constant FUM = 0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2;
    string internal constant GATEWAY = "https://handoff.lol/t/castle/ccip/{sender}/{data}.json";
    uint8 internal constant HEN_SLOT = 1;
    uint160 internal constant FLAGS =
        Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG;

    struct Deployed {
        PriceExtruction priceExtruction;
        CastleVault vault;
        OffchainQuoteResolver resolver;
        CastleJITHook hook;
        PoolId poolId;
        bytes32 hookSalt;
    }

    function run() external returns (Deployed memory d) {
        require(block.chainid == 11155111 || block.chainid == 31337, "Sepolia (or its anvil fork) only");
        for (uint256 i; i < 4; ++i) {
            address a = [AQUA, ROUTER, POOL_MANAGER, CREATE2_FACTORY][i];
            require(a.code.length > 0, "an external contract has no code here");
        }

        vm.startBroadcast();
        d.priceExtruction = new PriceExtruction();
        d.vault = new CastleVault(AQUA, ROUTER, WETH, USDC, OWNER, FI, FUM);
        string[] memory urls = new string[](1);
        urls[0] = GATEWAY;
        address[] memory signers = new address[](1);
        signers[0] = FI;
        d.resolver = new OffchainQuoteResolver(urls, OWNER, signers);

        bytes memory args = abi.encode(IPoolManager(POOL_MANAGER), ISwapVM(ROUTER), d.vault, HEN_SLOT);
        address predicted;
        (d.hookSalt, predicted) = _mine(keccak256(abi.encodePacked(type(CastleJITHook).creationCode, args)));
        d.hook = new CastleJITHook{ salt: d.hookSalt }(IPoolManager(POOL_MANAGER), ISwapVM(ROUTER), d.vault, HEN_SLOT);
        require(address(d.hook) == predicted, "hook landed off the mined address");

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(USDC),
            currency1: Currency.wrap(WETH),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(address(d.hook))
        });
        // raw WETH per raw USDC at 3,000 USDC per WETH: the pool's display price only, hen prices every fill
        IPoolManager(POOL_MANAGER).initialize(key, uint160(Math.sqrt(Math.mulDiv(1e18, 1 << 192, 3_000e6))));
        vm.stopBroadcast();
        d.poolId = key.toId();

        require(d.vault.owner() == OWNER && d.vault.fi() == FI && d.vault.fum() == FUM, "vault roles");
        require(d.resolver.owner() == OWNER && d.resolver.signers(FI), "resolver roles");
        require(uint160(address(d.hook)) & Hooks.ALL_HOOK_MASK == FLAGS, "hook flags");
        console2.log("priceExtruction", address(d.priceExtruction));
        console2.log("castleVault", address(d.vault));
        console2.log("offchainQuoteResolver", address(d.resolver));
        console2.log("castleJITHook", address(d.hook));
        console2.log("hookSalt");
        console2.logBytes32(d.hookSalt);
        console2.log("poolId");
        console2.logBytes32(PoolId.unwrap(d.poolId));
    }

    /// @dev The first salt whose CREATE2 address through the deployer carries exactly FLAGS in its low 14 bits.
    function _mine(bytes32 initHash) internal pure returns (bytes32 salt, address a) {
        for (uint256 i;; ++i) {
            salt = bytes32(i);
            a = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_FACTORY, salt, initHash)))));
            if (uint160(a) & Hooks.ALL_HOOK_MASK == FLAGS) return (salt, a);
        }
    }
}
