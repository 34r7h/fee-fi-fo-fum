// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Multicall } from "@openzeppelin/contracts/utils/Multicall.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";

import { ICastleLease, CastleLeaseTypes } from "./interfaces/ICastleLease.sol";
import { IENSv2Registry, IENSv2Resolver } from "./interfaces/IENSv2.sol";

/// @title Castle, the giant's castle
/// @notice The desk treasury, the Aqua maker and the ENSv2 lease of fee-fi-fo-fum, in one contract.
/// @dev The book is this contract, not an agent's wallet: Aqua keys virtual balances to the maker and pulls
///      real tokens from the maker, so the maker must outlive every shift. The lease is the ENSv2 name
///      `castle.<parent>` in REGISTRY, where Castle holds the root REGISTRAR and RENEW roles:
///      - the holder is the name's owner, registered with no roles, so it cannot renew or transfer by itself;
///      - renew() needs the holder's call AND fo's EIP-712 attestation;
///      - claim() after expiry re-registers the name to a crew member, which regenerates its token id: the
///        fencing epoch that FeeFiFoFumExtruction checks at fill time. With `registryEpoch == false` (the
///        fallback, if the ENSv2 deployment does not regenerate ids) the epoch is Castle's own counter.
///      Only the live holder may ship, dock, relink and multicall. Nothing here is hard-coded: every address,
///      the name and the lease period come from the constructor (read from deployments/<network>.json).
contract Castle is ICastleLease, EIP712, Ownable2Step, Multicall {
    using SafeERC20 for IERC20;

    /// @notice The ENSv2 data key the clearing price is written under (abi.encode(uint256 priceQ96)).
    string public constant PRICE_KEY = "handoff-price";

    IAqua public immutable AQUA;
    IENSv2Registry public immutable REGISTRY;
    IENSv2Resolver public immutable RESOLVER;
    IERC20 public immutable WETH;
    IERC20 public immutable USDC;
    /// @notice labelhash of the lease label, the `anyId` for REGISTRY.
    uint256 public immutable LABEL_ID;
    /// @notice namehash of castle.<parent>.
    bytes32 public immutable NODE;
    uint64 public immutable LEASE_PERIOD;
    /// @notice True: the epoch is the registry token id. False: the fallback counter below.
    bool public immutable registryEpoch;

    string public label;
    /// @notice DNS-encoded castle.<parent>, the alias source for relink().
    bytes public dnsName;

    address public fo;
    mapping(address account => bool) public crew;
    /// @notice Fallback epoch counter, used only when registryEpoch is false.
    uint256 internal _epochCounter;
    /// @notice The epoch each strategy was shipped under; 0 if never shipped here.
    mapping(bytes32 strategyHash => uint256) public shippedEpoch;

    event Relinked(bytes32 indexed node, bytes32 holderNode, bytes holderName);
    event Shipped(bytes32 indexed strategyHash, uint256 indexed epoch, uint256 anchorQ96, uint256 weth, uint256 usdc);
    event Docked(bytes32 indexed strategyHash, uint256 indexed epoch, address indexed dockedBy);
    event PriceWritten(uint256 priceQ96);
    event CrewSet(address indexed account, bool member);
    event FoSet(address indexed fo);

    error NotCrew(address caller);
    error EpochNotRegenerated(uint256 epoch);
    error ZeroAddress();
    error UnexpectedStrategyHash();

    struct Config {
        address aqua;
        address registry;
        address resolver;
        address weth;
        address usdc;
        address fo;
        address owner;
        string label;
        bytes dnsName;
        uint64 leasePeriod;
        bool registryEpoch;
    }

    constructor(Config memory c) EIP712(CastleLeaseTypes.NAME, CastleLeaseTypes.VERSION) Ownable(c.owner) {
        if (
            c.aqua == address(0) || c.registry == address(0) || c.resolver == address(0) || c.weth == address(0)
                || c.usdc == address(0) || c.fo == address(0)
        ) revert ZeroAddress();
        AQUA = IAqua(c.aqua);
        REGISTRY = IENSv2Registry(c.registry);
        RESOLVER = IENSv2Resolver(c.resolver);
        WETH = IERC20(c.weth);
        USDC = IERC20(c.usdc);
        LABEL_ID = uint256(keccak256(bytes(c.label)));
        NODE = _namehash(c.dnsName, 0);
        LEASE_PERIOD = c.leasePeriod;
        registryEpoch = c.registryEpoch;
        label = c.label;
        dnsName = c.dnsName;
        fo = c.fo;
        emit FoSet(c.fo);
        // Aqua pulls the maker's real tokens on every fill: approve it once.
        IERC20(c.weth).forceApprove(c.aqua, type(uint256).max);
        IERC20(c.usdc).forceApprove(c.aqua, type(uint256).max);
    }

    // ------------------------------------------------------------------------------------------------
    // Lease views (ICastleLease)
    // ------------------------------------------------------------------------------------------------

    function holder() public view returns (address) {
        return REGISTRY.latestOwnerOf(REGISTRY.getTokenId(LABEL_ID));
    }

    function epoch() public view returns (uint256) {
        return registryEpoch ? REGISTRY.getTokenId(LABEL_ID) : _epochCounter;
    }

    function expiry() public view returns (uint64) {
        return REGISTRY.getExpiry(LABEL_ID);
    }

    function isLive() public view returns (bool) {
        return block.timestamp < expiry();
    }

    function leasePeriod() external view returns (uint64) {
        return LEASE_PERIOD;
    }

    function attestationDigest(Attestation calldata att) public view returns (bytes32) {
        return _digest(att.epoch, att.expiry, att.deadline);
    }

    // ------------------------------------------------------------------------------------------------
    // Lease transitions
    // ------------------------------------------------------------------------------------------------

    /// @inheritdoc ICastleLease
    function renew(uint64 newExpiry, uint64 deadline, bytes calldata foSig) external {
        address h = holder();
        if (msg.sender != h) revert NotHolder(msg.sender, h);
        uint64 current = expiry();
        if (block.timestamp >= current) revert LeaseExpired(current);
        if (block.timestamp > deadline) revert AttestationExpired(deadline);
        uint64 max = uint64(block.timestamp) + LEASE_PERIOD;
        // newExpiry must move forward, so an attestation that was already used can never be used again.
        if (newExpiry <= current || newExpiry > max) revert BadExpiry(newExpiry, current, max);
        uint256 ep = epoch();
        bytes32 digest = _digest(ep, newExpiry, deadline);
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, foSig);
        if (err != ECDSA.RecoverError.NoError || signer != fo) revert BadAttestation(signer);
        REGISTRY.renew(LABEL_ID, newExpiry);
        emit Renewed(ep, h, newExpiry, digest);
    }

    /// @inheritdoc ICastleLease
    function claim() external returns (uint256 newEpoch) {
        if (!crew[msg.sender]) revert NotCrew(msg.sender);
        uint64 current = expiry();
        if (block.timestamp < current) revert LeaseStillLive(current);
        uint256 prevEpoch = epoch();
        uint64 newExpiry = uint64(block.timestamp) + LEASE_PERIOD;
        if (!registryEpoch) {
            ++_epochCounter; // before the external call: the mint's ERC-1155 receiver hook sees the new epoch
        }
        // No roles for the holder: it cannot renew, transfer or re-point the name except through Castle.
        REGISTRY.register(label, msg.sender, address(0), address(RESOLVER), 0, newExpiry);
        newEpoch = epoch();
        // The very first registration (expiry 0) mints the name; every later claim must fence the old shift.
        if (current != 0 && newEpoch == prevEpoch) revert EpochNotRegenerated(newEpoch);
        emit Claimed(newEpoch, msg.sender, newExpiry, prevEpoch);
    }

    // ------------------------------------------------------------------------------------------------
    // The book (Aqua maker) and the name's records: live holder only
    // ------------------------------------------------------------------------------------------------

    modifier onlyLiveHolder() {
        address h = holder();
        if (msg.sender != h) revert NotHolder(msg.sender, h);
        uint64 current = expiry();
        if (block.timestamp >= current) revert LeaseExpired(current);
        _;
    }

    /// @notice Ship a strategy with Castle as the Aqua maker. For SwapVM, `strategy` is abi.encode(Order)
    ///         with order.maker == address(this), and the program starts with the epoch fence.
    function ship(
        address app,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts
    )
        external
        onlyLiveHolder
        returns (bytes32 strategyHash)
    {
        uint256 ep = epoch();
        strategyHash = keccak256(strategy); // Aqua's strategy hash; for SwapVM it is also the order hash
        shippedEpoch[strategyHash] = ep;
        if (AQUA.ship(app, strategy, tokens, amounts) != strategyHash) revert UnexpectedStrategyHash();
        (uint256 wethAmt, uint256 usdcAmt) = _amountsOf(tokens, amounts);
        emit Shipped(strategyHash, ep, anchorPriceQ96(), wethAmt, usdcAmt);
    }

    /// @notice Dock a strategy (any epoch's): the new shift uses this to clear a stale shift's book.
    function dock(address app, bytes32 strategyHash, address[] calldata tokens) external onlyLiveHolder {
        AQUA.dock(app, strategyHash, tokens);
        emit Docked(strategyHash, shippedEpoch[strategyHash], msg.sender);
    }

    /// @notice Point castle.<parent> at the holder's own name, so resolving castle.* reaches this shift
    ///         (including its ENSIP-26 agent-endpoint records).
    /// @param holderName DNS-encoded name of the holder, e.g. fee.<agent registry>.
    function relink(bytes calldata holderName) external onlyLiveHolder {
        RESOLVER.setAlias(dnsName, holderName);
        emit Relinked(NODE, _namehash(holderName, 0), holderName);
    }

    // multicall (OpenZeppelin) delegatecalls to self, so every inner call keeps msg.sender and its own holder
    // check: fi claims, docks stale strategies and relinks in one tx, and the holder-only calls pass after claim().

    /// @notice The price the next shift centres on: ENS data `handoff-price` on castle.<parent>, 0 if unset.
    function anchorPriceQ96() public view returns (uint256) {
        bytes memory raw = RESOLVER.data(NODE, PRICE_KEY);
        return raw.length == 32 ? abi.decode(raw, (uint256)) : 0;
    }

    // ------------------------------------------------------------------------------------------------
    // Admin (the operator): crew and fo
    // ------------------------------------------------------------------------------------------------

    function setCrew(address account, bool member) external onlyOwner {
        crew[account] = member;
        emit CrewSet(account, member);
    }

    function setFo(address fo_) external onlyOwner {
        if (fo_ == address(0)) revert ZeroAddress();
        fo = fo_;
        emit FoSet(fo_);
    }

    // ------------------------------------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------------------------------------

    function _writePrice(uint256 priceQ96) internal {
        RESOLVER.setData(NODE, PRICE_KEY, abi.encode(priceQ96));
        emit PriceWritten(priceQ96);
    }

    function _digest(uint256 ep, uint64 exp, uint64 deadline) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CastleLeaseTypes.ATTESTATION_TYPEHASH, ep, exp, deadline)));
    }

    function _amountsOf(address[] calldata tokens, uint256[] calldata amounts)
        internal
        view
        returns (uint256 wethAmt, uint256 usdcAmt)
    {
        for (uint256 i; i < tokens.length && i < amounts.length; ++i) {
            if (tokens[i] == address(WETH)) wethAmt = amounts[i];
            else if (tokens[i] == address(USDC)) usdcAmt = amounts[i];
        }
    }

    /// @dev ENS namehash of a DNS-encoded name, from `offset` to the terminating zero label.
    function _namehash(bytes memory name, uint256 offset) internal pure returns (bytes32) {
        uint256 len = uint8(name[offset]);
        if (len == 0) return bytes32(0);
        bytes32 labelHash;
        assembly ("memory-safe") {
            labelHash := keccak256(add(add(name, 33), offset), len)
        }
        return keccak256(abi.encodePacked(_namehash(name, offset + 1 + len), labelHash));
    }
}
