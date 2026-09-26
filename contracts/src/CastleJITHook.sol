// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { BeforeSwapDelta, toBeforeSwapDelta } from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

import { CastleVault } from "./CastleVault.sol";

/// @title CastleJITHook, the hen lays just in time
/// @notice A Uniswap v4 hook whose pool holds no liquidity: every exact-in swap is filled in beforeSwap from the
///         Castle's `hen` strategy, with this hook acting as a SwapVM taker. The PoolManager's input is taken, sold to
///         the Castle through ROUTER (Aqua pushes it into the Castle and pulls the output out of it), and the output
///         is settled back, so one v4 Swap and the Castle's Aqua Pulled/Pushed land in the same tx.
/// @dev Flags: BEFORE_ADD_LIQUIDITY (reverts: the only liquidity is the Castle's), BEFORE_SWAP and
///      BEFORE_SWAP_RETURNS_DELTA. The hook's specified delta takes the whole input, so the pool's own swap step runs
///      with amountToSwap = 0 and never needs liquidity. The fee is hen's SwapVM flatFee; the pool's fee is 0.
///      The hook never touches the Castle's tokens itself: every movement is an Aqua pull or push on hen, so fum's
///      cap and leverage bound what a v4 swap can take. Between calls it holds nothing; its only allowances are to
///      ROUTER, which pulls only from its msg.sender (this hook, during a PoolManager-called beforeSwap).
contract CastleJITHook is IHooks {
    using SafeERC20 for IERC20;

    IPoolManager public immutable POOL_MANAGER;
    ISwapVM public immutable ROUTER;
    CastleVault public immutable VAULT;
    /// @notice The vault slot `hen` ships into; a re-shipped hen moves the hook automatically.
    uint8 public immutable HEN_SLOT;
    address public immutable WETH;
    address public immutable USDC;

    /// @notice A v4 swap filled from the Castle: the input sold to hen and the output paid to the pool.
    event JitFill(
        PoolId indexed poolId,
        bytes32 indexed strategyHash,
        address indexed sender,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOut
    );

    error NotPoolManager(address caller);
    error BadConfig();
    error ExactOutNotSupported();
    error LiquidityNotAllowed();
    error NotCastlePool();
    error NoHen();
    error TooLittleOut(uint256 amountOut, uint256 minAmountOut);
    error HookNotImplemented();

    modifier onlyPoolManager() {
        if (msg.sender != address(POOL_MANAGER)) revert NotPoolManager(msg.sender);
        _;
    }

    constructor(IPoolManager pm, ISwapVM router, CastleVault vault, uint8 henSlot) {
        if (address(vault.ROUTER()) != address(router) || henSlot >= vault.MAX_SLOTS()) revert BadConfig();
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
        POOL_MANAGER = pm;
        ROUTER = router;
        VAULT = vault;
        HEN_SLOT = henSlot;
        (WETH, USDC) = (address(vault.WETH()), address(vault.USDC()));
        IERC20(WETH).forceApprove(address(router), type(uint256).max);
        IERC20(USDC).forceApprove(address(router), type(uint256).max);
    }

    /// @notice The flags this hook's address must carry.
    function getHookPermissions() public pure returns (Hooks.Permissions memory p) {
        p.beforeAddLiquidity = true;
        p.beforeSwap = true;
        p.beforeSwapReturnDelta = true;
    }

    /// @notice Fill an exact-in swap from hen. hookData may carry abi.encode(uint256 minAmountOut).
    function beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        (Currency cIn, Currency cOut) =
            params.zeroForOne ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        (address tokenIn, address tokenOut) = (Currency.unwrap(cIn), Currency.unwrap(cOut));
        if (!((tokenIn == USDC && tokenOut == WETH) || (tokenIn == WETH && tokenOut == USDC))) revert NotCastlePool();
        if (params.amountSpecified >= 0) revert ExactOutNotSupported();
        uint256 amountIn = uint256(-params.amountSpecified);

        bytes32 hen = VAULT.strategyIn(HEN_SLOT);
        if (hen == bytes32(0)) revert NoHen();
        ISwapVM.Order memory order = VAULT.orderOf(hen);

        POOL_MANAGER.take(cIn, address(this), amountIn);
        (, uint256 amountOut,) = ROUTER.swap(order, tokenIn, tokenOut, amountIn, _takerData());
        if (hookData.length >= 32) {
            uint256 minOut = abi.decode(hookData, (uint256));
            if (amountOut < minOut) revert TooLittleOut(amountOut, minOut);
        }
        POOL_MANAGER.sync(cOut);
        IERC20(tokenOut).safeTransfer(address(POOL_MANAGER), amountOut);
        POOL_MANAGER.settle();

        emit JitFill(key.toId(), hen, sender, tokenIn, amountIn, amountOut);
        return (
            IHooks.beforeSwap.selector,
            toBeforeSwapDelta(SafeCast.toInt128(int256(amountIn)), -SafeCast.toInt128(int256(amountOut))),
            0
        );
    }

    /// @notice The pool takes no LP liquidity: the Castle is its only market maker.
    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        revert LiquidityNotAllowed();
    }

    /// @dev Exact-in, tokenIn pulled from this hook and pushed into the Castle through Aqua, tokenOut to this hook.
    function _takerData() internal pure returns (bytes memory) {
        TakerTraitsLib.Args memory a;
        a.isExactIn = true;
        a.useTransferFromAndAquaPush = true;
        return TakerTraitsLib.build(a);
    }

    // ------------------------------------------------------------------------------------------------
    // Hooks this address does not flag: the PoolManager never calls them
    // ------------------------------------------------------------------------------------------------

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function afterSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, int128)
    {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
