// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { XYCConcentrateArgsBuilder } from "@1inch/swap-vm/src/instructions/XYCConcentrate.sol";

import { ICastleLease, CastleLeaseTypes } from "./interfaces/ICastleLease.sol";
import { IENSv2Registry, IENSv2Resolver, IDataResolver } from "./interfaces/IENSv2.sol";

interface IAquaApp {
    function AQUA() external view returns (address);
}

/// @title Castle, the giant's castle
/// @notice The desk treasury, the Aqua maker and the ENSv2 lease of fee-fi-fo-fum, in one contract.
/// @dev The book is this contract, not an agent's wallet: Aqua keys virtual balances to the maker and pulls
///      real tokens from the maker, so the maker must outlive every shift. The lease is the ENSv2 name
///      `castle.<parent>` in REGISTRY (handoff's agent registry), where Castle holds root REGISTRAR and RENEW:
///      - the holder is the name's owner, registered with no roles, so it cannot renew or transfer by itself;
///      - renew() needs the holder's call AND fo's EIP-712 attestation;
///      - claim() after expiry re-registers the name to a crew member, which regenerates its token id: the
///        fencing epoch FeeFiFoFumExtruction checks at fill time. With `registryEpoch == false` (fallback for a
///        deployment that does not regenerate ids) the epoch is Castle's own counter.
///      The holder's key alone must not be able to drain the hoard, so the holder chooses nothing that moves value:
///      - claim() is crew-only: an owner-approved crew label that the caller owns, unexpired, in REGISTRY;
///      - the app is pinned to ROUTER and the tokens to [WETH, USDC]; Castle builds every program itself, fenced
///        and centred on the ENS anchor price; the holder picks only amounts, fee and band within hard bounds;
///      - multicall accepts only claim, renew, relink, ship and dock (delegatecall to self; no external target);
///      - relink() can only point castle.<parent> at the holder's own crew name;
///      - the anchor is written only by Castle (the owner's seed now, the CCA clearing price in p4).
contract Castle is ICastleLease, EIP712, Ownable2Step {
    using SafeERC20 for IERC20;

    /// @notice The ENSv2 data key the anchor price lives under: abi.encode(uint256 priceQ96), where priceQ96 is
    ///         raw USDC per raw WETH times 2**96 (the Uniswap CCA clearingPrice convention: currency per token).
    string public constant PRICE_KEY = "handoff-price";

    /// @notice SwapVM fee unit (1e9 = 100%).
    uint256 public constant BPS = 1e9;
    uint32 public constant MIN_FEE_BPS = 1e5; // 0.01%
    uint32 public constant MAX_FEE_BPS = 5e7; // 5%
    uint32 public constant MIN_RANGE_BPS = 1e6; // band [P/1.001, P*1.001]
    uint32 public constant MAX_RANGE_BPS = 1e9; // band [P/2, P*2]
    uint32 public constant MAX_WIND_DOWN_FEE_BPS = 2e8; // 20%

    /// @dev AquaOpcodes indices of swap-vm 1.0.2; the program test checks them against the router's table.
    uint8 internal constant OP_JUMP = 10;
    uint8 internal constant OP_XYC_SWAP = 17;
    uint8 internal constant OP_CONCENTRATE = 18;
    uint8 internal constant OP_DECAY = 19;
    uint8 internal constant OP_SALT = 20;
    uint8 internal constant OP_FLAT_FEE_IN = 21;
    uint8 internal constant OP_EXTRUCTION = 32;
    /// @dev opcode(1) + argsLength(1) + fence(20) + epoch(32) + windDownPC(2) + reduceOnlyTokenIn(20)
    uint256 internal constant FENCE_INSTRUCTION_LENGTH = 76;
    /// @dev opcode(1) + argsLength(1) + nextPC(2)
    uint256 internal constant JUMP_INSTRUCTION_LENGTH = 4;
    uint256 internal constant Q96 = 1 << 96;

    IAqua public immutable AQUA;
    /// @notice The AquaSwapVMRouter every strategy is shipped to: the only app that may pull the hoard.
    address public immutable ROUTER;
    /// @notice FeeFiFoFumExtruction, the first instruction of every program.
    address public immutable FENCE;
    IENSv2Registry public immutable REGISTRY;
    IENSv2Resolver public immutable RESOLVER;
    IERC20 public immutable WETH;
    IERC20 public immutable USDC;
    /// @notice labelhash of the lease label, the `anyId` for REGISTRY.
    uint256 public immutable LABEL_ID;
    /// @notice namehash of castle.<parent>.
    bytes32 public immutable NODE;
    /// @notice namehash of <parent>, under which the crew names live.
    bytes32 public immutable PARENT_NODE;
    uint64 public immutable LEASE_PERIOD;
    /// @notice True: the epoch is the registry token id. False: the fallback counter below.
    bool public immutable registryEpoch;
    /// @notice The flat fee on the wind-down branch (the wide spread of an expired shift).
    uint32 public immutable WIND_DOWN_FEE_BPS;
    /// @notice DecayXD period on the live branch, in seconds (Mooniswap-style offsets against back-running).
    uint16 public immutable DECAY_PERIOD;

    string public label;
    /// @notice DNS-encoded castle.<parent>.
    bytes public dnsName;

    address public fo;
    /// @notice Crew label (e.g. "fee" for fee.<parent>) per account; empty = not crew.
    mapping(address account => string) public crewLabelOf;
    /// @notice Fallback epoch counter, used only when registryEpoch is false.
    uint256 internal _epochCounter;
    /// @notice Programs shipped so far; salts every program so no two strategies share a hash.
    uint64 public shipNonce;
    /// @notice The epoch each strategy was shipped under; 0 if never shipped here.
    mapping(bytes32 strategyHash => uint256) public shippedEpoch;

    /// @notice What the holder chooses when shipping; everything else is fixed by Castle.
    /// @param maxWeth  most WETH to commit (clamped to Castle's balance)
    /// @param maxUsdc  most USDC to commit (clamped to Castle's balance)
    /// @param feeBps   live flat fee on amountIn, in BPS units, within [MIN_FEE_BPS, MAX_FEE_BPS]
    /// @param rangeBps band half-width: prices [P/(1+r), P*(1+r)] around the anchor P, within [MIN, MAX]_RANGE_BPS
    struct ShipParams {
        uint256 maxWeth;
        uint256 maxUsdc;
        uint32 feeBps;
        uint32 rangeBps;
    }

    event Relinked(bytes32 indexed node, bytes32 indexed holderNode, string holderLabel);
    event Shipped(bytes32 indexed strategyHash, uint256 indexed epoch, uint256 anchorQ96, uint256 weth, uint256 usdc);
    event Docked(bytes32 indexed strategyHash, uint256 indexed epoch, address indexed dockedBy);
    event PriceWritten(uint256 priceQ96);
    event CrewSet(address indexed account, string crewLabel);
    event FoSet(address indexed fo);

    error NotCrew(address caller);
    error EpochNotRegenerated(uint256 epoch);
    error ZeroAddress();
    error BadConfig();
    error UnexpectedStrategyHash();
    error SelectorNotAllowed(bytes4 selector);
    error NoAnchor();
    error BadShipParams();
    error EmptyBook();

    struct Config {
        address aqua;
        address router;
        address fence;
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
        uint32 windDownFeeBps;
        uint16 decayPeriod;
    }

    constructor(Config memory c) EIP712(CastleLeaseTypes.NAME, CastleLeaseTypes.VERSION) Ownable(c.owner) {
        if (
            c.aqua == address(0) || c.router == address(0) || c.fence == address(0) || c.registry == address(0)
                || c.resolver == address(0) || c.weth == address(0) || c.usdc == address(0) || c.fo == address(0)
        ) revert ZeroAddress();
        if (
            IAquaApp(c.router).AQUA() != c.aqua || c.fence.code.length == 0 || c.weth == c.usdc
                || c.windDownFeeBps < MIN_FEE_BPS || c.windDownFeeBps > MAX_WIND_DOWN_FEE_BPS || c.decayPeriod == 0
                || c.leasePeriod == 0 || c.dnsName.length < 2
        ) revert BadConfig();
        AQUA = IAqua(c.aqua);
        ROUTER = c.router;
        FENCE = c.fence;
        REGISTRY = IENSv2Registry(c.registry);
        RESOLVER = IENSv2Resolver(c.resolver);
        WETH = IERC20(c.weth);
        USDC = IERC20(c.usdc);
        LABEL_ID = uint256(keccak256(bytes(c.label)));
        NODE = _namehash(c.dnsName, 0);
        PARENT_NODE = _namehash(c.dnsName, 1 + uint8(c.dnsName[0]));
        if (NODE != keccak256(abi.encodePacked(PARENT_NODE, bytes32(LABEL_ID)))) revert BadConfig();
        LEASE_PERIOD = c.leasePeriod;
        registryEpoch = c.registryEpoch;
        WIND_DOWN_FEE_BPS = c.windDownFeeBps;
        DECAY_PERIOD = c.decayPeriod;
        label = c.label;
        dnsName = c.dnsName;
        fo = c.fo;
        emit FoSet(c.fo);
        // Aqua pulls the maker's real tokens on every fill, for the pinned ROUTER's strategies only.
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

    /// @notice True if `account` has a crew label AND owns that name, unexpired, in REGISTRY right now.
    function isCrew(address account) public view returns (bool) {
        bytes memory l = bytes(crewLabelOf[account]);
        return l.length != 0 && REGISTRY.getOwner(uint256(keccak256(l))) == account;
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
    /// @dev Crew only: otherwise any taker who waits out a lease becomes holder.
    function claim() external returns (uint256 newEpoch) {
        if (!isCrew(msg.sender)) revert NotCrew(msg.sender);
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

    /// @notice Ship a fenced strategy centred on the ENS anchor, with Castle as the Aqua maker and ROUTER as the app.
    /// @return strategyHash Aqua's strategy hash, which is also the SwapVM order hash
    /// @return order        the order takers pass to ROUTER.swap (also in Aqua's Shipped event as abi.encode(order))
    function ship(ShipParams calldata p)
        external
        onlyLiveHolder
        returns (bytes32 strategyHash, ISwapVM.Order memory order)
    {
        if (
            p.feeBps < MIN_FEE_BPS || p.feeBps > MAX_FEE_BPS || p.rangeBps < MIN_RANGE_BPS || p.rangeBps > MAX_RANGE_BPS
        ) {
            revert BadShipParams();
        }
        uint256 anchor = anchorPriceQ96();
        if (anchor == 0) revert NoAnchor();
        (uint256 sqrtMin, uint256 sqrtMax, uint256 wethAmt, uint256 usdcAmt) = _book(p, anchor);

        uint256 ep = epoch();
        order = MakerTraitsLib.build(_makerArgs(_program(ep, p.feeBps, sqrtMin, sqrtMax, ++shipNonce)));
        bytes memory strategy = abi.encode(order);
        strategyHash = keccak256(strategy);
        shippedEpoch[strategyHash] = ep;

        (address[] memory tokens, uint256[] memory amounts) = (new address[](2), new uint256[](2));
        (tokens[0], tokens[1]) = (address(WETH), address(USDC));
        (amounts[0], amounts[1]) = (wethAmt, usdcAmt);
        if (AQUA.ship(ROUTER, strategy, tokens, amounts) != strategyHash) revert UnexpectedStrategyHash();
        emit Shipped(strategyHash, ep, anchor, wethAmt, usdcAmt);
    }

    /// @notice Dock a strategy (any epoch's): the new shift uses this to clear a stale shift's book.
    function dock(bytes32 strategyHash) external onlyLiveHolder {
        address[] memory tokens = new address[](2);
        (tokens[0], tokens[1]) = (address(WETH), address(USDC));
        AQUA.dock(ROUTER, strategyHash, tokens);
        emit Docked(strategyHash, shippedEpoch[strategyHash], msg.sender);
    }

    /// @notice Point castle.<parent> at the holder's own crew name, so resolving castle.* reaches this shift
    ///         (including its ENSIP-26 agent-endpoint records), and carry the anchor price across.
    /// @dev linkToNode makes castle SHARE the holder's record id, so the anchor read through castle would switch to
    ///      whatever the new record holds; Castle re-writes the current anchor into it in the same call.
    function relink() external onlyLiveHolder returns (bytes32 holderNode) {
        string memory holderLabel = crewLabelOf[msg.sender];
        if (bytes(holderLabel).length == 0) revert NotCrew(msg.sender);
        holderNode = keccak256(abi.encodePacked(PARENT_NODE, keccak256(bytes(holderLabel))));
        uint256 price = anchorPriceQ96();
        RESOLVER.linkToNode(dnsName, holderNode);
        _writePrice(price);
        emit Relinked(NODE, holderNode, holderLabel);
    }

    /// @notice multicall, restricted to the lease and book entry points. Every inner call is a delegatecall to
    ///         Castle itself and keeps its own checks; nothing else (no transfer, approve or owner call) gets through.
    function multicall(bytes[] calldata data) external returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i; i < data.length; ++i) {
            bytes4 selector = data[i].length < 4 ? bytes4(0) : bytes4(data[i][:4]);
            if (
                selector != this.claim.selector && selector != this.renew.selector && selector != this.relink.selector
                    && selector != this.ship.selector && selector != this.dock.selector
            ) revert SelectorNotAllowed(selector);
            results[i] = Address.functionDelegateCall(address(this), data[i]);
        }
    }

    /// @notice The price the book centres on: ENS data `handoff-price` resolved through castle.<parent>, 0 if unset.
    function anchorPriceQ96() public view returns (uint256) {
        bytes memory ret = RESOLVER.resolve(dnsName, abi.encodeCall(IDataResolver.data, (NODE, PRICE_KEY)));
        bytes memory raw = abi.decode(ret, (bytes));
        return raw.length == 32 ? abi.decode(raw, (uint256)) : 0;
    }

    // ------------------------------------------------------------------------------------------------
    // Admin (the operator): crew, fo and the genesis anchor
    // ------------------------------------------------------------------------------------------------

    /// @notice Make `account` crew under `crewLabel` (its name <crewLabel>.<parent> in REGISTRY); "" removes it.
    function setCrew(address account, string calldata crewLabel) external onlyOwner {
        if (uint256(keccak256(bytes(crewLabel))) == LABEL_ID) revert BadConfig();
        crewLabelOf[account] = crewLabel;
        emit CrewSet(account, crewLabel);
    }

    function setFo(address fo_) external onlyOwner {
        if (fo_ == address(0)) revert ZeroAddress();
        fo = fo_;
        emit FoSet(fo_);
    }

    /// @notice Seed or correct the anchor. The CCA clearing price replaces this path in p4.
    function setAnchorPrice(uint256 priceQ96) external onlyOwner {
        _writePrice(priceQ96);
    }

    // ------------------------------------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------------------------------------

    function _writePrice(uint256 priceQ96) internal {
        RESOLVER.setData(dnsName, PRICE_KEY, priceQ96 == 0 ? bytes("") : abi.encode(priceQ96));
        emit PriceWritten(priceQ96);
    }

    function _digest(uint256 ep, uint64 exp, uint64 deadline) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CastleLeaseTypes.ATTESTATION_TYPEHASH, ep, exp, deadline)));
    }

    /// @dev Band and amounts: a geometric band [P/(1+r), P*(1+r)] around the anchor keeps the implied spot of the
    ///      shipped balances at the anchor. P is tokenGt per tokenLt, as XYCConcentrate expects.
    function _book(ShipParams calldata p, uint256 anchorQ96)
        internal
        view
        returns (uint256 sqrtMin, uint256 sqrtMax, uint256 wethAmt, uint256 usdcAmt)
    {
        bool usdcIsLt = address(USDC) < address(WETH);
        uint256 sqrtP = usdcIsLt
            ? Math.sqrt(Math.mulDiv(Q96, 1e36, anchorQ96))  // P = WETH per USDC
            : Math.sqrt(Math.mulDiv(anchorQ96, 1e36, Q96)); // P = USDC per WETH
        uint256 band = Math.sqrt((BPS + p.rangeBps) * 1e27); // sqrt(1 + r) in 1e18
        sqrtMin = Math.mulDiv(sqrtP, 1e18, band);
        sqrtMax = Math.mulDiv(sqrtP, band, 1e18);
        if (sqrtMin == 0) revert NoAnchor();

        uint256 availWeth = Math.min(p.maxWeth, WETH.balanceOf(address(this)));
        uint256 availUsdc = Math.min(p.maxUsdc, USDC.balanceOf(address(this)));
        (uint256 l, uint256 amtLt, uint256 amtGt) = XYCConcentrateArgsBuilder.computeLiquidityFromAmounts(
            usdcIsLt ? availUsdc : availWeth, usdcIsLt ? availWeth : availUsdc, sqrtP, sqrtMin, sqrtMax
        );
        if (l == 0 || amtLt == 0 || amtGt == 0) revert EmptyBook();
        (wethAmt, usdcAmt) = usdcIsLt ? (amtGt, amtLt) : (amtLt, amtGt);
    }

    /// @dev The program, by byte offset:
    ///        0  Extruction(FENCE: epoch, W, USDC)   live → next; expired → W (USDC in only); new epoch → revert
    ///       76  DecayXD(DECAY_PERIOD)
    ///       80  XYCConcentrateGrowLiquidity2D(band)
    ///      146  FlatFeeAmountInXD(feeBps)
    ///      152  XYCSwapXD
    ///      154  Jump(END)
    ///   W=158  XYCConcentrateGrowLiquidity2D(band)  wind-down: same curve, wide fee, reduce-only
    ///      224  FlatFeeAmountInXD(WIND_DOWN_FEE_BPS)
    ///      230  XYCSwapXD
    ///      232  Salt(shipNonce)
    ///  END=242
    function _program(uint256 ep, uint32 feeBps, uint256 sqrtMin, uint256 sqrtMax, uint64 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes memory concentrate = abi.encodePacked(OP_CONCENTRATE, uint8(64), sqrtMin, sqrtMax);
        bytes memory swap = abi.encodePacked(OP_XYC_SWAP, uint8(0));
        bytes memory live = bytes.concat(
            abi.encodePacked(OP_DECAY, uint8(2), DECAY_PERIOD),
            concentrate,
            abi.encodePacked(OP_FLAT_FEE_IN, uint8(4), feeBps),
            swap
        );
        bytes memory windDown =
            bytes.concat(concentrate, abi.encodePacked(OP_FLAT_FEE_IN, uint8(4), WIND_DOWN_FEE_BPS), swap);
        bytes memory salt = abi.encodePacked(OP_SALT, uint8(8), nonce);
        uint256 w = FENCE_INSTRUCTION_LENGTH + live.length + JUMP_INSTRUCTION_LENGTH;
        uint256 end = w + windDown.length + salt.length;
        return bytes.concat(
            abi.encodePacked(OP_EXTRUCTION, uint8(74), FENCE, ep, uint16(w), address(USDC)),
            live,
            abi.encodePacked(OP_JUMP, uint8(2), uint16(end)),
            windDown,
            salt
        );
    }

    function _makerArgs(bytes memory program) internal view returns (MakerTraitsLib.Args memory a) {
        a.maker = address(this);
        a.useAquaInsteadOfSignature = true;
        a.program = program;
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
