// The fragments the crew calls, as docs/SPEC.md pins them. contracts/out-abi/<Name>.json wins when the contracts
// lane exports it (lib/chain.mjs abi()).
import { parseAbi } from 'viem';

export const ABIS = {
  CastleVault: parseAbi([
    'struct Order { address maker; uint256 traits; bytes data; }',
    'function setLeverage(address token, uint16 bps)',
    'function setCap(uint8 slot, uint256 wethCap, uint256 usdcCap)',
    'function ship(uint8 slot, bytes program, uint256 weth, uint256 usdc) returns (bytes32 strategyHash, Order order)',
    'function dock(bytes32 strategyHash)',
    'function fi() view returns (address)',
    'function fum() view returns (address)',
    'function committed(address token) view returns (uint256)',
    'function headroom(address token) view returns (uint256)',
    'function limit(address token) view returns (uint256)',
    'function activeStrategies() view returns (bytes32[])',
    'function strategyIn(uint8 slot) view returns (bytes32)',
    'function orderOf(bytes32 strategyHash) view returns (Order)',
    'function slotOf(bytes32 strategyHash) view returns (uint8)',
    'function capOf(uint8 slot) view returns (uint256 wethCap, uint256 usdcCap)',
    'function leverageOf(address token) view returns (uint16)',
    'event Shipped(uint8 indexed slot, bytes32 indexed strategyHash, uint256 weth, uint256 usdc)',
    'event Docked(bytes32 indexed strategyHash, address indexed by)',
    'error NotFi(address caller)', 'error NotFum(address caller)', 'error NotCrew(address caller)',
    'error BadSlot(uint8 slot)', 'error SlotBusy(uint8 slot)', 'error EmptyProgram()',
    'error OverCap(uint8 slot, address token, uint256 amount, uint256 cap)',
    'error OverAllocated(address token, uint256 committedAfter, uint256 limit)',
    'error BadLeverage(uint16 bps)', 'error NotHoardToken(address token)', 'error NotLive(bytes32 strategyHash)',
  ]),
  Aqua: parseAbi([
    'function rawBalances(address maker, address app, bytes32 strategyHash, address token) view returns (uint248 balance, uint8 tokensCount)',
  ]),
  SwapVM: parseAbi([
    'struct Order { address maker; uint256 traits; bytes data; }',
    'function quote(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) view returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)',
    'function swap(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)',
  ]),
  Chainlink: parseAbi([
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() view returns (uint8)',
  ]),
  V4Quoter: parseAbi([
    'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
    'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
    'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
  ]),
  PoolSwapTest: parseAbi([
    'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
    'struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }',
    'struct TestSettings { bool takeClaims; bool settleUsingBurn; }',
    'function swap(PoolKey key, SwapParams params, TestSettings testSettings, bytes hookData) payable returns (int256 delta)',
  ]),
  ERC20: parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function deposit() payable',
  ]),
};
