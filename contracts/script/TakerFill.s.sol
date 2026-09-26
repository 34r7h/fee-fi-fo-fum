// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";

/// @notice A taker fill against one of Castle's strategies: quote, then swap exact-in, and require swap == quote.
/// @dev STRATEGY is the `strategy` bytes of Aqua's Shipped(maker, app, strategyHash, strategy) event, i.e.
///      abi.encode(ISwapVM.Order). TOKEN_IN / TOKEN_OUT / AMOUNT_IN pick the direction; TAKER_PK signs.
contract TakerFill is Script {
    function run() external returns (uint256 amountIn, uint256 amountOut) {
        string memory network = vm.envOr("NETWORK", string("sepolia"));
        string memory ext = vm.readFile(string.concat("deployments/", network, ".json"));
        AquaSwapVMRouter router =
            AquaSwapVMRouter(payable(vm.parseJsonAddress(ext, ".contracts.aquaSwapVMRouter.address")));
        ISwapVM.Order memory order = abi.decode(vm.envBytes("STRATEGY"), (ISwapVM.Order));
        address tokenIn = vm.envAddress("TOKEN_IN");
        address tokenOut = vm.envAddress("TOKEN_OUT");
        uint256 amount = vm.envUint("AMOUNT_IN");
        uint256 pk = vm.envUint("TAKER_PK");
        address taker = vm.addr(pk);
        bytes memory takerData = _takerData(taker);

        (, uint256 quoted,) = router.quote(order, tokenIn, tokenOut, amount, takerData);
        console2.log("quote out", quoted);
        vm.startBroadcast(pk);
        if (IERC20(tokenIn).allowance(taker, address(router)) < amount) {
            IERC20(tokenIn).approve(address(router), amount);
        }
        (amountIn, amountOut,) = router.swap(order, tokenIn, tokenOut, amount, takerData);
        vm.stopBroadcast();
        require(amountOut == quoted, "swap != quote");
        console2.log("swap in", amountIn);
        console2.log("swap out", amountOut);
    }

    function _takerData(address taker) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: true,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: true,
                threshold: "",
                to: address(0),
                deadline: 0,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: ""
            })
        );
    }
}
