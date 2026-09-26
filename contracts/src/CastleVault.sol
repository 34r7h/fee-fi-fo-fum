// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";

interface IAquaApp {
    function AQUA() external view returns (address);
}

/// @title CastleVault, the giant's hoard
/// @notice One balance of WETH and USDC, the 1inch Aqua maker behind every strategy the crew ships. fi compiles SwapVM
///         programs and ships them into slots; fum caps what each slot may hold, sets how far the live strategies'
///         promises may exceed the hoard (leverage), and docks on risk; the vault refuses any ship past either limit.
/// @dev Shared liquidity: Aqua keeps per-strategy virtual balances and never checks them against the maker's real
///      balance, so one balance can back several strategies at once. This contract is the only thing bounding that:
///          committed(token) <= balanceOf(token) * leverageBps[token] / 1e4
///      at every ship and withdraw (checked before any Aqua call; it reverts, never clamps). A fill moves real and
///      virtual balances together (Aqua pull debits both, Aqua push credits both), so with leverage above 1x a run of
///      fills against one strategy can leave the others promising more than the vault holds; their fills then revert
///      inside Aqua's transferFrom, and fum docks. That is the shared-liquidity trade, bounded by fum's leverage.
///      The only allowance the vault grants is to Aqua, and it has no ERC-1271, so no signed SwapVM order can pull
///      tokens outside Aqua's accounting: every outflow is an Aqua pull by ROUTER against a shipped strategy.
///      fi supplies the program bytecode, so a slot's cap is the most fi's key can give away through that slot. The
///      vault builds the maker traits itself (maker = vault, Aqua on, no hooks, no custom receiver, no unwrap) and
///      appends its own Salt, so no two ships share a strategy hash and a docked program can be shipped again.
contract CastleVault is Ownable2Step {
    using SafeERC20 for IERC20;

    /// @notice Strategy slots; bounds every loop over live strategies.
    uint8 public constant MAX_SLOTS = 8;
    /// @notice Leverage unit: 1e4 = 1x (committed may equal the balance); uint16 caps it at 6.5535x.
    uint16 public constant LEVERAGE_ONE = 1e4;
    /// @dev AquaOpcodes index of Controls._salt in swap-vm 1.0.2 (checked against the router in the tests).
    uint8 internal constant OP_SALT = 20;

    IAqua public immutable AQUA;
    /// @notice The AquaSwapVMRouter every strategy is shipped to: the only app that may pull the hoard.
    address public immutable ROUTER;
    IERC20 public immutable WETH;
    IERC20 public immutable USDC;

    /// @notice fi, the SwapVM compiler: ships and docks.
    address public fi;
    /// @notice fum, the inventory and risk manager: sets slot caps and docks.
    address public fum;
    /// @notice Programs shipped so far; the salt of every program.
    uint64 public shipNonce;
    /// @dev How far the live strategies' promises of a token may exceed the vault's balance of it (1e4 = 1x).
    mapping(address token => uint16) internal _leverageBps;

    struct Slot {
        uint256 wethCap;
        uint256 usdcCap;
        bytes32 strategyHash; // 0 when empty
    }

    Slot[MAX_SLOTS] internal _slots;
    /// @dev slot + 1 of a live strategy; 0 when not live here.
    mapping(bytes32 strategyHash => uint8) internal _slotOf;
    /// @dev order data (program + salt) of a live strategy.
    mapping(bytes32 strategyHash => bytes) internal _data;

    event FiSet(address indexed fi);
    event FumSet(address indexed fum);
    event CapSet(uint8 indexed slot, uint256 wethCap, uint256 usdcCap);
    event LeverageSet(address indexed token, uint16 bps);
    event Shipped(uint8 indexed slot, bytes32 indexed strategyHash, uint256 weth, uint256 usdc);
    event Docked(bytes32 indexed strategyHash, address indexed by);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error BadConfig();
    error NotFi(address caller);
    error NotFum(address caller);
    error NotCrew(address caller);
    error BadSlot(uint8 slot);
    error SlotBusy(uint8 slot);
    error EmptyProgram();
    error OverCap(uint8 slot, address token, uint256 amount, uint256 cap);
    error OverAllocated(address token, uint256 committedAfter, uint256 limit);
    error BadLeverage(uint16 bps);
    error NotHoardToken(address token);
    error NotLive(bytes32 strategyHash);
    error UnexpectedStrategyHash();

    modifier onlyFi() {
        if (msg.sender != fi) revert NotFi(msg.sender);
        _;
    }

    modifier onlyFum() {
        if (msg.sender != fum) revert NotFum(msg.sender);
        _;
    }

    /// @param aqua   the Aqua the router settles through
    /// @param router the AquaSwapVMRouter strategies ship to
    /// @param weth   WETH, token 0 of every strategy
    /// @param usdc   USDC, token 1 of every strategy
    /// @param owner_ the operator: sets fi and fum, withdraws the free balance
    constructor(address aqua, address router, address weth, address usdc, address owner_, address fi_, address fum_)
        Ownable(owner_)
    {
        if (aqua == address(0) || router == address(0) || weth == address(0) || usdc == address(0)) {
            revert ZeroAddress();
        }
        if (fi_ == address(0) || fum_ == address(0)) revert ZeroAddress();
        if (weth == usdc || IAquaApp(router).AQUA() != aqua) revert BadConfig();
        AQUA = IAqua(aqua);
        ROUTER = router;
        WETH = IERC20(weth);
        USDC = IERC20(usdc);
        fi = fi_;
        fum = fum_;
        emit FiSet(fi_);
        emit FumSet(fum_);
        (_leverageBps[weth], _leverageBps[usdc]) = (LEVERAGE_ONE, LEVERAGE_ONE);
        emit LeverageSet(weth, LEVERAGE_ONE);
        emit LeverageSet(usdc, LEVERAGE_ONE);
        // Aqua pulls the maker's real tokens on every fill, for ROUTER's strategies only.
        IERC20(weth).forceApprove(aqua, type(uint256).max);
        IERC20(usdc).forceApprove(aqua, type(uint256).max);
    }

    // ------------------------------------------------------------------------------------------------
    // fum: caps and leverage
    // ------------------------------------------------------------------------------------------------

    /// @notice Let the live strategies promise up to `bps / 1e4` times the vault's balance of `token` (WETH or USDC).
    ///         Lowering it never touches a live strategy; it bounds the next ship.
    function setLeverage(address token, uint16 bps) external onlyFum {
        if (token != address(WETH) && token != address(USDC)) revert NotHoardToken(token);
        if (bps == 0) revert BadLeverage(bps);
        _leverageBps[token] = bps;
        emit LeverageSet(token, bps);
    }

    /// @notice Cap what the strategy in `slot` may be shipped with. A lower cap never touches a live strategy: fum
    ///         docks it if the risk calls for that.
    function setCap(uint8 slot, uint256 wethCap, uint256 usdcCap) external onlyFum {
        if (slot >= MAX_SLOTS) revert BadSlot(slot);
        Slot storage s = _slots[slot];
        (s.wethCap, s.usdcCap) = (wethCap, usdcCap);
        emit CapSet(slot, wethCap, usdcCap);
    }

    // ------------------------------------------------------------------------------------------------
    // fi: ship; fi, fum or the owner: dock
    // ------------------------------------------------------------------------------------------------

    /// @notice Ship `program` into the empty `slot` with `weth` and `usdc` of the hoard, through Aqua to ROUTER.
    /// @return strategyHash Aqua's strategy hash, which is also the SwapVM order hash
    /// @return order        the order takers pass to ROUTER.swap
    function ship(uint8 slot, bytes calldata program, uint256 weth, uint256 usdc)
        external
        onlyFi
        returns (bytes32 strategyHash, ISwapVM.Order memory order)
    {
        if (slot >= MAX_SLOTS) revert BadSlot(slot);
        Slot storage s = _slots[slot];
        if (s.strategyHash != bytes32(0)) revert SlotBusy(slot);
        if (program.length == 0) revert EmptyProgram();
        if (weth > s.wethCap) revert OverCap(slot, address(WETH), weth, s.wethCap);
        if (usdc > s.usdcCap) revert OverCap(slot, address(USDC), usdc, s.usdcCap);
        _checkLimit(address(WETH), weth, 0);
        _checkLimit(address(USDC), usdc, 0);

        uint64 salt = ++shipNonce;
        bytes memory data = bytes.concat(program, abi.encodePacked(OP_SALT, uint8(8), salt));
        order = _order(data);
        bytes memory strategy = abi.encode(order);
        strategyHash = keccak256(strategy);
        s.strategyHash = strategyHash;
        _slotOf[strategyHash] = slot + 1;
        _data[strategyHash] = data;

        (address[] memory tokens, uint256[] memory amounts) = (new address[](2), new uint256[](2));
        (tokens[0], tokens[1]) = (address(WETH), address(USDC));
        (amounts[0], amounts[1]) = (weth, usdc);
        emit Shipped(slot, strategyHash, weth, usdc);
        if (AQUA.ship(ROUTER, strategy, tokens, amounts) != strategyHash) revert UnexpectedStrategyHash();
    }

    /// @notice Dock a live strategy: Aqua zeroes its allocation and the slot frees up. No tokens move.
    function dock(bytes32 strategyHash) external {
        if (msg.sender != fi && msg.sender != fum && msg.sender != owner()) revert NotCrew(msg.sender);
        uint8 slotPlusOne = _slotOf[strategyHash];
        if (slotPlusOne == 0) revert NotLive(strategyHash);
        delete _slots[slotPlusOne - 1].strategyHash;
        delete _slotOf[strategyHash];
        delete _data[strategyHash];

        address[] memory tokens = new address[](2);
        (tokens[0], tokens[1]) = (address(WETH), address(USDC));
        emit Docked(strategyHash, msg.sender);
        AQUA.dock(ROUTER, strategyHash, tokens);
    }

    // ------------------------------------------------------------------------------------------------
    // Owner: crew and the free balance
    // ------------------------------------------------------------------------------------------------

    function setFi(address fi_) external onlyOwner {
        if (fi_ == address(0)) revert ZeroAddress();
        fi = fi_;
        emit FiSet(fi_);
    }

    function setFum(address fum_) external onlyOwner {
        if (fum_ == address(0)) revert ZeroAddress();
        fum = fum_;
        emit FumSet(fum_);
    }

    /// @notice Send `amount` of `token` to `to`. WETH and USDC only while the live strategies stay within fum's
    ///         leverage of what is left; any other token (a stray transfer) in full.
    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (token == address(WETH) || token == address(USDC)) _checkLimit(token, 0, amount);
        emit Withdrawn(token, to, amount);
        IERC20(token).safeTransfer(to, amount);
    }

    // ------------------------------------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------------------------------------

    /// @notice The live strategies' hashes, in slot order.
    function activeStrategies() external view returns (bytes32[] memory hashes) {
        uint256 n;
        for (uint256 i; i < MAX_SLOTS; ++i) {
            if (_slots[i].strategyHash != bytes32(0)) ++n;
        }
        hashes = new bytes32[](n);
        n = 0;
        for (uint256 i; i < MAX_SLOTS; ++i) {
            bytes32 h = _slots[i].strategyHash;
            if (h != bytes32(0)) hashes[n++] = h;
        }
    }

    /// @notice The live strategy in `slot`; 0 if the slot is empty.
    function strategyIn(uint8 slot) external view returns (bytes32) {
        if (slot >= MAX_SLOTS) revert BadSlot(slot);
        return _slots[slot].strategyHash;
    }

    /// @notice fum's caps on what a ship into `slot` may promise.
    function capOf(uint8 slot) external view returns (uint256 wethCap, uint256 usdcCap) {
        if (slot >= MAX_SLOTS) revert BadSlot(slot);
        Slot storage s = _slots[slot];
        return (s.wethCap, s.usdcCap);
    }

    /// @notice fum's leverage for `token` (1e4 = 1x); 0 for a token the vault does not trade.
    function leverageOf(address token) external view returns (uint16) {
        return _leverageBps[token];
    }

    /// @notice The slot of a live strategy; reverts if it is not live here.
    function slotOf(bytes32 strategyHash) external view returns (uint8) {
        uint8 slotPlusOne = _slotOf[strategyHash];
        if (slotPlusOne == 0) revert NotLive(strategyHash);
        return slotPlusOne - 1;
    }

    /// @notice The SwapVM order of a live strategy, as takers pass it to ROUTER.swap.
    function orderOf(bytes32 strategyHash) external view returns (ISwapVM.Order memory) {
        if (_slotOf[strategyHash] == 0) revert NotLive(strategyHash);
        return _order(_data[strategyHash]);
    }

    /// @notice How much of `token` the live strategies may still pull (the sum of their Aqua virtual balances).
    function committed(address token) public view returns (uint256 sum) {
        for (uint256 i; i < MAX_SLOTS; ++i) {
            bytes32 h = _slots[i].strategyHash;
            if (h == bytes32(0)) continue;
            (uint248 bal,) = AQUA.rawBalances(address(this), ROUTER, h, token);
            sum += bal;
        }
    }

    /// @notice What fum's leverage lets the vault promise of `token` in all: balanceOf * leverageBps / 1e4.
    function limit(address token) public view returns (uint256) {
        return IERC20(token).balanceOf(address(this)) * _leverageBps[token] / LEVERAGE_ONE;
    }

    /// @notice How much more of `token` the next ship may promise: limit minus committed, or 0.
    function headroom(address token) public view returns (uint256) {
        uint256 l = limit(token);
        uint256 c = committed(token);
        return l > c ? l - c : 0;
    }

    // ------------------------------------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------------------------------------

    /// @dev Reverts unless committed + `adding` <= (balance - `removing`) * leverage.
    function _checkLimit(address token, uint256 adding, uint256 removing) internal view {
        uint256 committedAfter = committed(token) + adding;
        uint256 bal = IERC20(token).balanceOf(address(this));
        uint256 lim = bal < removing ? 0 : (bal - removing) * _leverageBps[token] / LEVERAGE_ONE;
        if (bal < removing || committedAfter > lim) revert OverAllocated(token, committedAfter, lim);
    }

    function _order(bytes memory data) internal view returns (ISwapVM.Order memory) {
        MakerTraitsLib.Args memory a;
        a.maker = address(this);
        a.useAquaInsteadOfSignature = true;
        a.program = data;
        return MakerTraitsLib.build(a);
    }
}
