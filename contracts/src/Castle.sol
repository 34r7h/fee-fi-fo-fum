// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
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
import { AuctionParameters, ICCAFactory, ICCA } from "./interfaces/ICCA.sol";

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
///        fencing epoch FeeFiFoFumExtruction checks at fill time (the tag regenerates ids; Castle requires it);
///      The holder's key alone must not be able to drain the hoard, so the holder chooses nothing that moves value:
///      - claim() is crew-only: an owner-approved crew label that the caller owns, unexpired, in REGISTRY;
///      - the app is pinned to ROUTER and the tokens to [WETH, USDC]; Castle builds every program itself, fenced
///        and centred on the ENS anchor price; the holder picks only amounts, fee and band within hard bounds;
///      - multicall accepts only claim, renew, relink, ship, dock and openAuction (delegatecall to self; no external
///        target); relink() can only point castle.<parent> at the holder's own crew name;
///      - the anchor is written only by Castle: the owner's genesis seed, then each settled auction's clearing price.
///      The only exit for inventory is a Uniswap CCA (JackHook-gated, floor tied to the anchor, proceeds and unsold
///      WETH returned to Castle): a shift-change auction of WETH no live strategy claims, or, if nobody claims the
///      castle within dissolveGrace of expiry, a permissionless dissolution that docks the book and auctions it all.
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
    /// @notice Live (undocked) strategies at once; bounds every loop over them.
    uint256 public constant MAX_ACTIVE_STRATEGIES = 4;
    /// @notice CCA length in blocks: one step selling 400_000 mps per block (25 * 400_000 = the CCA's 1e7 MPS).
    uint64 public constant AUCTION_BLOCKS = 25;
    uint24 internal constant AUCTION_MPS = 400_000;
    /// @notice CCA floor = 80% of the anchor; tick spacing = floor / 100 (1% of the floor), so the floor is a tick.
    uint256 public constant FLOOR_PCT = 80;
    uint256 public constant TICKS_PER_FLOOR = 100;
    /// @notice An auction graduates (and may move the anchor) only if it raises at least this share of the lot's
    ///         value at the floor; otherwise every bid is refunded, all the WETH returns, and the anchor stays. Without
    ///         it, a 1-USDC bid one tick above the floor would clear at the floor and cut the anchor by 20% per round.
    uint256 public constant GRADUATION_PCT = 50;
    /// @notice Bounds for the owner-tunable dissolution grace.
    uint64 public constant MIN_DISSOLVE_GRACE = 120;
    uint64 public constant MAX_DISSOLVE_GRACE = 1 days;
    /// @notice How long a challenged holder has to respond() on-chain before claim() opens early.
    uint64 public constant RESPONSE_WINDOW = 60;
    /// @notice After a response, how long before the next challenge, so crew cannot tax a live holder's gas.
    uint64 public constant CHALLENGE_COOLDOWN = 600;

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
    uint64 internal immutable LEASE_PERIOD;
    /// @notice The epoch is always the registry token id. v2's fallback counter is gone: the tag regenerates ids on
    ///         every re-registration (probed live and covered by the fork suite), and Config.registryEpoch must be true.
    bool public constant registryEpoch = true;
    /// @notice The flat fee on the wind-down branch (the wide spread of an expired shift).
    uint32 public immutable WIND_DOWN_FEE_BPS;
    /// @notice DecayXD period on the live branch, in seconds (Mooniswap-style offsets against back-running).
    uint16 public immutable DECAY_PERIOD;
    /// @notice Uniswap CCA factory (v2.1.0) and the bid validation hook every Castle auction uses.
    ICCAFactory public immutable CCA_FACTORY;
    address public immutable JACK_HOOK;

    string public label;
    /// @notice DNS-encoded castle.<parent>.
    bytes public dnsName;

    address public fo;
    /// @notice Crew label (e.g. "fee" for fee.<parent>) per account; empty = not crew.
    mapping(address account => string) public crewLabelOf;
    /// @notice Programs shipped so far; salts every program so no two strategies share a hash.
    uint64 public shipNonce;
    /// @notice The epoch each strategy was shipped under; 0 if never shipped here.
    mapping(bytes32 strategyHash => uint256) public shippedEpoch;
    /// @notice Strategies shipped and not yet docked (at most MAX_ACTIVE_STRATEGIES).
    bytes32[] internal _active;
    /// @notice fum: may open shift-change auctions besides the live holder.
    address public auctioneer;
    /// @notice The auction Castle opened and has not settled yet; address(0) if none.
    address public auction;
    uint64 public auctionNonce;
    /// @notice Seconds after an unclaimed expiry before anyone may dissolve the book (owner-tunable within bounds).
    uint64 public dissolveGrace;
    /// @notice The open or unanswered challenge's response deadline; 0 = none. Cleared by respond() and claim().
    uint64 public challengeDeadline;
    /// @notice No challenge before this: set by respond() to now + CHALLENGE_COOLDOWN.
    uint64 public challengeCooldownUntil;
    /// @notice The epoch the challenge was opened in.
    uint256 public challengedEpoch;
    /// @notice The last epoch that was dissolved: at most one dissolution per epoch.
    uint256 public dissolvedEpoch;

    /// @notice What the holder chooses when shipping; everything else is fixed by Castle.
    /// @param maxWeth  most WETH to commit (clamped to what no active strategy claims)
    /// @param maxUsdc  most USDC to commit (clamped to what no active strategy claims)
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
    event AuctioneerSet(address indexed auctioneer);
    event DissolveGraceSet(uint64 grace);
    event AuctionOpened(
        address indexed auction,
        uint256 indexed epoch,
        uint256 amount,
        uint256 floorQ96,
        uint64 endBlock,
        bool dissolution
    );
    event AuctionSettled(address indexed auction, uint256 clearingPriceQ96, uint256 currencyRaised, bool priceWritten);
    event Dissolved(uint256 indexed epoch, uint256 strategiesDocked, uint256 weth);

    error NotCrew(address caller);
    error EpochNotRegenerated(uint256 epoch);
    error ZeroAddress();
    error BadConfig();
    error UnexpectedStrategyHash();
    error SelectorNotAllowed(bytes4 selector);
    error NoAnchor();
    error BadShipParams();
    error EmptyBook();
    error TooManyStrategies();
    error AuctionRunning(address auction);
    error NoAuction();
    error AuctionNotOver(uint64 endBlock);
    error NotDissolvable(uint256 at);
    error BadAuctionAmount();
    error CannotChallengeSelf();
    error AlreadyDissolved(uint256 epoch);

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
        address ccaFactory;
        address jackHook;
        uint64 dissolveGrace;
    }

    constructor(Config memory c) EIP712(CastleLeaseTypes.NAME, CastleLeaseTypes.VERSION) Ownable(c.owner) {
        if (
            c.aqua == address(0) || c.router == address(0) || c.fence == address(0) || c.registry == address(0)
                || c.resolver == address(0) || c.weth == address(0) || c.usdc == address(0) || c.fo == address(0)
        ) revert ZeroAddress();
        if (
            IAquaApp(c.router).AQUA() != c.aqua || c.fence.code.length == 0 || c.weth == c.usdc
                || c.windDownFeeBps < MIN_FEE_BPS || c.windDownFeeBps > MAX_WIND_DOWN_FEE_BPS || c.decayPeriod == 0
                || c.leasePeriod == 0 || !c.registryEpoch || c.dnsName.length < 2 || c.ccaFactory.code.length == 0
                || c.jackHook.code.length == 0
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
        WIND_DOWN_FEE_BPS = c.windDownFeeBps;
        DECAY_PERIOD = c.decayPeriod;
        CCA_FACTORY = ICCAFactory(c.ccaFactory);
        JACK_HOOK = c.jackHook;
        _setDissolveGrace(c.dissolveGrace);
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
        return REGISTRY.getTokenId(LABEL_ID);
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

    /// @inheritdoc ICastleLease
    function fenceState() external view returns (uint256, address, address) {
        return (epoch(), REGISTRY.getOwner(LABEL_ID), fo);
    }

    /// @inheritdoc ICastleLease
    function heartbeatDigest(uint256 ep, uint64 validUntil) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CastleLeaseTypes.HEARTBEAT_TYPEHASH, ep, validUntil)));
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
        _checkLiveHolder();
        uint64 current = expiry();
        if (block.timestamp > deadline) revert AttestationExpired(deadline);
        uint64 max = uint64(block.timestamp) + LEASE_PERIOD;
        // newExpiry must move forward, so an attestation that was already used can never be used again.
        if (newExpiry <= current || newExpiry > max) revert BadExpiry(newExpiry, current, max);
        uint256 ep = epoch();
        bytes32 digest = _digest(ep, newExpiry, deadline);
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, foSig);
        if (err != ECDSA.RecoverError.NoError || signer != fo) revert BadAttestation(signer);
        REGISTRY.renew(LABEL_ID, newExpiry);
        emit Renewed(ep, msg.sender, newExpiry, digest);
    }

    /// @inheritdoc ICastleLease
    /// @dev Crew only: otherwise any taker who waits out a lease becomes holder. While the ENS lease is live, only an
    ///      unanswered challenge opens it, and Castle ends the lease (unregister) before re-registering it.
    function claim() external returns (uint256 newEpoch) {
        if (!isCrew(msg.sender)) revert NotCrew(msg.sender);
        uint64 current = expiry();
        uint256 prevEpoch = epoch();
        if (block.timestamp < current) {
            if (!_unanswered()) revert LeaseStillLive(current);
            REGISTRY.unregister(LABEL_ID);
        }
        (challengeDeadline, challengeCooldownUntil) = (0, 0);
        uint64 newExpiry = uint64(block.timestamp) + LEASE_PERIOD;
        // No roles for the holder: it cannot renew, transfer or re-point the name except through Castle.
        REGISTRY.register(label, msg.sender, address(0), address(RESOLVER), 0, newExpiry);
        newEpoch = epoch();
        // The very first registration (expiry 0) mints the name; every later claim must fence the old shift.
        if (current != 0 && newEpoch == prevEpoch) revert EpochNotRegenerated(newEpoch);
        emit Claimed(newEpoch, msg.sender, newExpiry, prevEpoch);
    }

    /// @inheritdoc ICastleLease
    function challenge() external returns (uint64 deadline) {
        if (!isCrew(msg.sender)) revert NotCrew(msg.sender);
        if (msg.sender == holder()) revert CannotChallengeSelf();
        uint64 current = expiry();
        if (block.timestamp >= current) revert LeaseExpired(current); // nothing to challenge: claim() is open
        uint256 ep = epoch();
        if (challengeDeadline != 0 && challengedEpoch == ep) revert ChallengePending(challengeDeadline);
        if (block.timestamp < challengeCooldownUntil) revert ChallengeCooldown(challengeCooldownUntil);
        deadline = uint64(block.timestamp) + RESPONSE_WINDOW;
        (challengedEpoch, challengeDeadline) = (ep, deadline);
        emit Challenged(ep, msg.sender, deadline);
    }

    /// @inheritdoc ICastleLease
    /// @dev msg.sender must be the holder: a heartbeat signed before the challenge would still be valid, so only an
    ///      on-chain call proves the holder is alive now. At the deadline itself the window is closed and claim() wins.
    function respond() external {
        address h = holder();
        if (msg.sender != h) revert NotHolder(msg.sender, h);
        uint64 d = challengeDeadline;
        if (d == 0 || challengedEpoch != epoch()) revert NoChallenge();
        if (block.timestamp >= d) revert HolderUnresponsive(d);
        uint64 until = uint64(block.timestamp) + CHALLENGE_COOLDOWN;
        (challengeDeadline, challengeCooldownUntil) = (0, until);
        emit Responded(challengedEpoch, h, until);
    }

    /// @dev A challenge in the current epoch whose response window has closed.
    function _unanswered() internal view returns (bool) {
        uint64 d = challengeDeadline;
        return d != 0 && block.timestamp >= d && challengedEpoch == epoch();
    }

    // ------------------------------------------------------------------------------------------------
    // The book (Aqua maker) and the name's records: live holder only
    // ------------------------------------------------------------------------------------------------

    modifier onlyLiveHolder() {
        _checkLiveHolder();
        _;
    }

    function _checkLiveHolder() internal view {
        address h = holder();
        if (msg.sender != h) revert NotHolder(msg.sender, h);
        uint64 current = expiry();
        if (block.timestamp >= current) revert LeaseExpired(current);
        if (_unanswered()) revert HolderUnresponsive(challengeDeadline);
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
            p.feeBps < MIN_FEE_BPS || p.feeBps > MAX_FEE_BPS || p.feeBps > WIND_DOWN_FEE_BPS
                || p.rangeBps < MIN_RANGE_BPS || p.rangeBps > MAX_RANGE_BPS
        ) {
            revert BadShipParams();
        }
        if (_active.length >= MAX_ACTIVE_STRATEGIES) revert TooManyStrategies();
        uint256 anchor = anchorPriceQ96();
        if (anchor == 0) revert NoAnchor();
        (uint256 sqrtMin, uint256 sqrtMax, uint256 wethAmt, uint256 usdcAmt) = _book(p, anchor);

        uint256 ep = epoch();
        order = MakerTraitsLib.build(_makerArgs(_program(ep, p.feeBps, sqrtMin, sqrtMax, ++shipNonce)));
        bytes memory strategy = abi.encode(order);
        strategyHash = keccak256(strategy);
        shippedEpoch[strategyHash] = ep;
        _active.push(strategyHash);

        (address[] memory tokens, uint256[] memory amounts) = (new address[](2), new uint256[](2));
        (tokens[0], tokens[1]) = (address(WETH), address(USDC));
        (amounts[0], amounts[1]) = (wethAmt, usdcAmt);
        if (AQUA.ship(ROUTER, strategy, tokens, amounts) != strategyHash) revert UnexpectedStrategyHash();
        emit Shipped(strategyHash, ep, anchor, wethAmt, usdcAmt);
    }

    /// @notice Dock a strategy (any epoch's): the new shift uses this to clear a stale shift's book.
    function dock(bytes32 strategyHash) external onlyLiveHolder {
        uint256 n = _active.length;
        for (uint256 i; i < n; ++i) {
            if (_active[i] == strategyHash) {
                _active[i] = _active[n - 1];
                _active.pop();
                break;
            }
        }
        _dock(strategyHash);
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
                    && selector != this.openAuction.selector
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

    /// @notice Strategies shipped and not yet docked.
    function activeStrategies() external view returns (bytes32[] memory) {
        return _active;
    }

    /// @notice How much of `token` the active strategies may still pull (their Aqua virtual balances).
    function committed(IERC20 token) public view returns (uint256 sum) {
        for (uint256 i; i < _active.length; ++i) {
            (uint248 bal,) = AQUA.rawBalances(address(this), ROUTER, _active[i], address(token));
            sum += bal;
        }
    }

    /// @notice Castle's balance of `token` that no active strategy claims: what may ship or go to auction.
    function freeBalance(IERC20 token) public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        uint256 c = committed(token);
        return bal > c ? bal - c : 0;
    }

    // ------------------------------------------------------------------------------------------------
    // The exit: Uniswap CCA auctions of the WETH inventory (JackHook-gated, proceeds back to Castle)
    // ------------------------------------------------------------------------------------------------

    /// @notice Shift-change auction of WETH the book does not need, opened by the live holder or the auctioneer (fum).
    ///         Only WETH no active strategy claims can go in, so live fills never hit an over-committed balance.
    function openAuction(uint128 amount) external returns (address) {
        if (msg.sender != auctioneer) _checkLiveHolder();
        if (amount == 0 || amount > freeBalance(WETH)) revert BadAuctionAmount();
        return _openAuction(amount, false);
    }

    /// @notice Dissolution: if nobody has claimed the castle dissolveGrace after the lease lapsed, ANYONE may dock the
    ///         whole book and auction all the WETH. fum is only the default caller.
    /// @dev At most once per epoch and never while an auction runs: otherwise, after settleAuction returned the unsold
    ///      WETH, anyone could dissolve again and each graduated round would write an anchor 20% lower.
    ///      A challenge the holder left unanswered counts as the lease ending at its deadline.
    function dissolve() external returns (address a) {
        if (auction != address(0)) revert AuctionRunning(auction);
        uint256 ep = epoch();
        if (dissolvedEpoch == ep) revert AlreadyDissolved(ep);
        uint64 exp = expiry();
        uint256 at = uint256(exp) + dissolveGrace;
        uint64 d = challengeDeadline;
        if (d != 0 && challengedEpoch == ep && uint256(d) + dissolveGrace < at) at = uint256(d) + dissolveGrace;
        if (exp == 0 || block.timestamp < at) revert NotDissolvable(at);
        dissolvedEpoch = ep;
        uint256 n = _active.length;
        while (_active.length != 0) {
            bytes32 h = _active[_active.length - 1];
            _active.pop();
            _dock(h);
        }
        uint256 amount = WETH.balanceOf(address(this));
        emit Dissolved(ep, n, amount);
        if (amount != 0) a = _openAuction(SafeCast.toUint128(amount), true);
    }

    /// @notice Once the auction has ended, anyone settles it: Castle sweeps the USDC raised and the unsold WETH home
    ///         and, if the auction graduated, writes the clearing price to ENS as the next shift's anchor.
    function settleAuction() external returns (uint256 clearingQ96) {
        address a = auction;
        if (a == address(0)) revert NoAuction();
        uint64 end = ICCA(a).endBlock();
        if (block.number < end) revert AuctionNotOver(end);
        auction = address(0);
        ICCA(a).sweepCurrency();
        ICCA(a).sweepUnsoldTokens();
        bool graduated = ICCA(a).isGraduated();
        uint256 raised = graduated ? ICCA(a).currencyRaised() : 0;
        clearingQ96 = ICCA(a).clearingPrice();
        bool written = graduated && raised != 0 && clearingQ96 != 0;
        if (written) _writePrice(clearingQ96);
        emit AuctionSettled(a, clearingQ96, raised, written);
    }

    // ------------------------------------------------------------------------------------------------
    // Admin (the operator): crew, fo, the auctioneer and the genesis anchor
    // ------------------------------------------------------------------------------------------------

    function setDissolveGrace(uint64 grace) external onlyOwner {
        _setDissolveGrace(grace);
    }

    function _setDissolveGrace(uint64 grace) internal {
        if (grace < MIN_DISSOLVE_GRACE || grace > MAX_DISSOLVE_GRACE) revert BadConfig();
        dissolveGrace = grace;
        emit DissolveGraceSet(grace);
    }

    function setAuctioneer(address auctioneer_) external onlyOwner {
        auctioneer = auctioneer_;
        emit AuctioneerSet(auctioneer_);
    }

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

    /// @notice Seed or correct the anchor; after that, settled auctions write it.
    function setAnchorPrice(uint256 priceQ96) external onlyOwner {
        _writePrice(priceQ96);
    }

    // ------------------------------------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------------------------------------

    /// @dev Auction params are all Castle's: USDC for WETH, 25 blocks, floor 80% of the anchor on a 1%-of-floor tick,
    ///      JackHook-gated, graduating at GRADUATION_PCT of the lot's value at the floor, tokens and funds to Castle.
    function _openAuction(uint128 amount, bool dissolution) internal returns (address a) {
        if (auction != address(0)) revert AuctionRunning(auction);
        uint256 anchor = anchorPriceQ96();
        if (anchor == 0) revert NoAnchor();
        uint256 tick = anchor * FLOOR_PCT / 100 / TICKS_PER_FLOOR;
        uint256 floor = tick * TICKS_PER_FLOOR;
        uint64 start = uint64(block.number);
        AuctionParameters memory p = AuctionParameters({
            currency: address(USDC),
            tokensRecipient: address(this),
            fundsRecipient: address(this),
            startBlock: start,
            endBlock: start + AUCTION_BLOCKS,
            claimBlock: start + AUCTION_BLOCKS,
            tickSpacing: tick,
            validationHook: JACK_HOOK,
            floorPrice: floor,
            requiredCurrencyRaised: SafeCast.toUint128(Math.mulDiv(amount, floor, Q96) * GRADUATION_PCT / 100),
            auctionStepsData: abi.encodePacked(AUCTION_MPS, uint40(AUCTION_BLOCKS))
        });
        a = CCA_FACTORY.create(address(WETH), amount, abi.encode(p), bytes32(uint256(++auctionNonce)));
        auction = a;
        WETH.safeTransfer(a, amount);
        ICCA(a).onTokensReceived();
        emit AuctionOpened(a, epoch(), amount, p.floorPrice, p.endBlock, dissolution);
    }

    function _dock(bytes32 strategyHash) internal {
        address[] memory tokens = new address[](2);
        (tokens[0], tokens[1]) = (address(WETH), address(USDC));
        AQUA.dock(ROUTER, strategyHash, tokens);
        emit Docked(strategyHash, shippedEpoch[strategyHash], msg.sender);
    }

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

        uint256 availWeth = Math.min(p.maxWeth, freeBalance(WETH));
        uint256 availUsdc = Math.min(p.maxUsdc, freeBalance(USDC));
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
    ///   W=158  DecayXD(DECAY_PERIOD)                wind-down: same Decay and curve, wide fee, reduce-only
    ///      162  XYCConcentrateGrowLiquidity2D(band)
    ///      228  FlatFeeAmountInXD(WIND_DOWN_FEE_BPS)
    ///      234  XYCSwapXD
    ///      236  Salt(shipNonce)
    ///  END=246
    ///      The taker picks wind-down by leaving out the heartbeat, so wind-down must never price better than live:
    ///      it shares the live branch's Decay state (same order) and its fee is never below the live fee.
    function _program(uint256 ep, uint32 feeBps, uint256 sqrtMin, uint256 sqrtMax, uint64 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes memory concentrate = abi.encodePacked(OP_CONCENTRATE, uint8(64), sqrtMin, sqrtMax);
        bytes memory swap = abi.encodePacked(OP_XYC_SWAP, uint8(0));
        bytes memory decay = abi.encodePacked(OP_DECAY, uint8(2), DECAY_PERIOD);
        bytes memory live = bytes.concat(decay, concentrate, abi.encodePacked(OP_FLAT_FEE_IN, uint8(4), feeBps), swap);
        bytes memory windDown =
            bytes.concat(decay, concentrate, abi.encodePacked(OP_FLAT_FEE_IN, uint8(4), WIND_DOWN_FEE_BPS), swap);
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
