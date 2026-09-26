// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";

abstract contract CastleHelpers is Test {
    uint256 internal constant Q96 = 1 << 96;
    /// @dev 3,000 USDC per WETH in raw units, Q96.
    uint256 internal constant ANCHOR_Q96 = 3000e6 * Q96 / 1e18;

    function _takerData(address taker, bool exactIn) internal pure returns (bytes memory) {
        return _takerData(taker, exactIn, "");
    }

    /// @param instructionsArgs what the program's instructions may consume: harp's PriceExtruction takes the quote
    function _takerData(address taker, bool exactIn, bytes memory instructionsArgs)
        internal
        pure
        returns (bytes memory)
    {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: exactIn,
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
                instructionsArgs: instructionsArgs,
                signature: ""
            })
        );
    }
}
