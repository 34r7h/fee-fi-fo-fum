// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SwapQuery, SwapRegisters } from "@1inch/swap-vm/src/libs/VM.sol";

interface IQuoteSigner {
    /// @notice The key whose EIP-712 Quote prices this maker's RFQ strategies (CastleVault: fi).
    function fi() external view returns (address);
}

/// @title PriceExtruction, fi's word is the price
/// @notice A SwapVM Extruction that prices a fill from a quote fi signed off-chain, so re-pricing costs no gas and a
///         stale quote cannot fill. The taker brings the quote (found through CCIP-Read on quote.feefifofum.eth) as
///         its instruction args, abi.encode(Quote, bytes sig). The quote names the strategy, the pair and the
///         direction, a price, a per-fill size limit and an expiry. priceQ96 is raw tokenOut per raw tokenIn times
///         2**96. Exact-in only: amountOut = amountIn * priceQ96 >> 96, rounded down.
/// @dev The signer must be query.maker's fi() at fill time, so rotating fi on the vault kills every outstanding quote.
///      Stateless: a quote may fill more than once before validUntil, each fill at most maxAmountIn; the strategy's
///      Aqua allocation (fum's cap) bounds the total, and MAX_QUOTE_TTL bounds how long a price can live. One `view`
///      function serves both IExtruction (swap) and IStaticExtruction (quote), so ROUTER.quote and ROUTER.swap cannot
///      diverge.
contract PriceExtruction {
    struct Quote {
        bytes32 strategyHash;
        address tokenIn;
        address tokenOut;
        uint256 priceQ96; // tokenOut per tokenIn in raw units, Q96
        uint256 maxAmountIn; // per fill
        uint64 validUntil; // unix seconds
    }

    /// @notice The quote's validUntil has passed.
    error QuoteExpired(uint64 validUntil);
    /// @notice The quote was not signed by the maker's fi (or the signature is malformed or malleable).
    error BadQuoteSigner(address recovered);
    /// @notice The quote's strategyHash, tokenIn or tokenOut differ from the swap's.
    error QuoteMismatch();
    /// @notice The fill takes more than the quote allows.
    error QuoteTooLarge(uint256 amountIn, uint256 maxAmountIn);
    /// @notice The quote reaches further ahead than MAX_QUOTE_TTL.
    error QuoteTooLong(uint64 validUntil);
    /// @notice The taker data does not start with a standard abi.encode(Quote, bytes).
    error MissingQuote(uint256 length);
    /// @notice Quotes price exact-in fills only.
    error ExactOutNotSupported();

    string public constant NAME = "feefifofum PriceExtruction";
    string public constant VERSION = "1";
    /// @notice The furthest ahead a quote may be valid (the gateway signs now + 30 s).
    uint64 public constant MAX_QUOTE_TTL = 300;
    /// @dev abi.encode(Quote, bytes): the static Quote (6 words), then the offset of `sig`, which must be 7 words.
    uint256 internal constant SIG_OFFSET = 7 * 32;

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 strategyHash,address tokenIn,address tokenOut,uint256 priceQ96,uint256 maxAmountIn,uint64 validUntil)"
    );
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @param nextPC    the program counter after this instruction, returned unchanged
    /// @param query     the swap; query.maker's fi() must have signed the quote
    /// @param swap      the registers; this sets amountOut
    /// @param takerData the taker's instruction args, starting with abi.encode(Quote, bytes sig)
    /// @return updatedNextPC nextPC
    /// @return choppedLength the length of abi.encode(Quote, sig): the quote is consumed
    /// @return updatedSwap   `swap` with amountOut filled in
    function extruction(
        bool, /* isStaticContext */
        uint256 nextPC,
        SwapQuery calldata query,
        SwapRegisters calldata swap,
        bytes calldata, /* args */
        bytes calldata takerData
    ) external view returns (uint256 updatedNextPC, uint256 choppedLength, SwapRegisters memory updatedSwap) {
        if (!query.isExactIn) revert ExactOutNotSupported();
        if (takerData.length < SIG_OFFSET + 32 || uint256(bytes32(takerData[192:224])) != SIG_OFFSET) {
            revert MissingQuote(takerData.length);
        }
        (Quote memory q, bytes memory sig) = abi.decode(takerData, (Quote, bytes));
        if (q.strategyHash != query.orderHash || q.tokenIn != query.tokenIn || q.tokenOut != query.tokenOut) {
            revert QuoteMismatch();
        }
        if (q.validUntil < block.timestamp) revert QuoteExpired(q.validUntil);
        if (q.validUntil > block.timestamp + MAX_QUOTE_TTL) revert QuoteTooLong(q.validUntil);
        if (swap.amountIn > q.maxAmountIn) revert QuoteTooLarge(swap.amountIn, q.maxAmountIn);

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(quoteDigest(q), sig);
        if (err != ECDSA.RecoverError.NoError || recovered != IQuoteSigner(query.maker).fi()) {
            revert BadQuoteSigner(recovered);
        }

        updatedSwap = swap;
        updatedSwap.amountOut = Math.mulDiv(swap.amountIn, q.priceQ96, 1 << 96);
        return (nextPC, SIG_OFFSET + 32 + (sig.length + 31) / 32 * 32, updatedSwap);
    }

    /// @notice This contract's EIP-712 domain separator (name "feefifofum PriceExtruction", version "1").
    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(NAME)), keccak256(bytes(VERSION)), block.chainid, address(this))
        );
    }

    /// @notice The EIP-712 digest fi signs for a quote.
    function quoteDigest(Quote memory q) public view returns (bytes32) {
        return MessageHashUtils.toTypedDataHash(
            domainSeparator(),
            keccak256(
                abi.encode(
                    QUOTE_TYPEHASH, q.strategyHash, q.tokenIn, q.tokenOut, q.priceQ96, q.maxAmountIn, q.validUntil
                )
            )
        );
    }
}
