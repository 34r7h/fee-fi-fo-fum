// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The slice of Uniswap's Continuous Clearing Auction v2.1.0 that Castle and JackHook use.
/// @dev Factory 0x000000001F26a0044BaA66024e7b6599c61963F8 (Uniswap/continuous-clearing-auction tag v2.1.0).
///      Prices are Q96 fixed point, raw currency per raw token: with currency USDC and token WETH that is the same
///      unit as Castle's anchor (raw USDC per raw WETH times 2**96).
struct AuctionParameters {
    address currency; // token raised; address(0) for ETH
    address tokensRecipient; // receives unsold tokens
    address fundsRecipient; // receives the raised currency
    uint64 startBlock;
    uint64 endBlock;
    uint64 claimBlock;
    uint256 tickSpacing; // Q96; every tick price is a multiple of it
    address validationHook; // called before every bid
    uint256 floorPrice; // Q96, a multiple of tickSpacing
    uint128 requiredCurrencyRaised; // graduation threshold
    bytes auctionStepsData; // packed (uint24 mps, uint40 blockDelta) steps; sum(mps * blockDelta) == 1e7
}

interface ICCAFactory {
    /// @param configData abi.encode(AuctionParameters)
    function create(address token, uint256 amount, bytes calldata configData, bytes32 salt)
        external
        returns (address auction);
}

interface ICCA {
    function onTokensReceived() external;
    function clearingPrice() external view returns (uint256);
    function currencyRaised() external view returns (uint256);
    function isGraduated() external view returns (bool);
    function endBlock() external view returns (uint64);
    function sweepCurrency() external;
    function sweepUnsoldTokens() external;
}

/// @notice The CCA's bid validation hook.
interface IValidationHook {
    /// @dev MUST revert if the bid is invalid.
    function validate(uint256 maxPrice, uint128 amount, address owner, address sender, bytes calldata hookData) external;
}
