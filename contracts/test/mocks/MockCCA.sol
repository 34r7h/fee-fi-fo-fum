// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { AuctionParameters } from "../../src/interfaces/ICCA.sol";

/// @notice The slice of CCA v2.1.0 behaviour Castle relies on: recipient-only sweeps after endBlock, the token
///         balance check in onTokensReceived, and settable results. The fork suite runs the real factory.
contract MockCCA {
    address public immutable token;
    uint256 public immutable totalSupply;
    AuctionParameters internal _p;
    bool public tokensReceived;
    uint256 public clearingPrice;
    uint256 public currencyRaised;
    uint256 public unsold;
    bool public currencySwept;
    bool public tokensSwept;

    error NotAuthorized(address authorized, address caller);
    error AuctionIsNotOver();
    error InvalidTokenAmountReceived();

    constructor(address token_, uint256 amount, AuctionParameters memory p) {
        (token, totalSupply) = (token_, amount);
        _p = p;
        clearingPrice = p.floorPrice;
        unsold = amount;
    }

    function params() external view returns (AuctionParameters memory) {
        return _p;
    }

    function endBlock() external view returns (uint64) {
        return _p.endBlock;
    }

    function isGraduated() external view returns (bool) {
        return currencyRaised >= _p.requiredCurrencyRaised;
    }

    function onTokensReceived() external {
        if (IERC20(token).balanceOf(address(this)) < totalSupply) revert InvalidTokenAmountReceived();
        tokensReceived = true;
    }

    /// @dev Test hook: bidders paid `raised` currency for `sold` tokens at `price` (claimed only if it graduates).
    function fill(uint256 raised, uint256 sold, uint256 price) external {
        (currencyRaised, unsold, clearingPrice) = (raised, totalSupply - sold, price);
        if (raised >= _p.requiredCurrencyRaised) IERC20(token).transfer(msg.sender, sold);
    }

    function sweepCurrency() external {
        if (block.number < _p.endBlock) revert AuctionIsNotOver();
        if (msg.sender != _p.fundsRecipient) revert NotAuthorized(_p.fundsRecipient, msg.sender);
        currencySwept = true;
        // not graduated: nothing to sweep, every bid is refunded to its bidder
        if (currencyRaised >= _p.requiredCurrencyRaised) {
            IERC20(_p.currency).transfer(_p.fundsRecipient, IERC20(_p.currency).balanceOf(address(this)));
        }
    }

    function sweepUnsoldTokens() external {
        if (block.number < _p.endBlock) revert AuctionIsNotOver();
        if (msg.sender != _p.tokensRecipient) revert NotAuthorized(_p.tokensRecipient, msg.sender);
        tokensSwept = true;
        IERC20(token).transfer(_p.tokensRecipient, currencyRaised >= _p.requiredCurrencyRaised ? unsold : totalSupply);
    }
}

contract MockCCAFactory {
    event AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData);

    function create(address token, uint256 amount, bytes calldata configData, bytes32 salt)
        external
        returns (address auction)
    {
        AuctionParameters memory p = abi.decode(configData, (AuctionParameters));
        auction = address(new MockCCA{ salt: keccak256(abi.encode(msg.sender, salt)) }(token, amount, p));
        emit AuctionCreated(auction, token, amount, configData);
    }
}
