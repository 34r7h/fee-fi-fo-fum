#!/usr/bin/env node
// Readies an anvil fork of live Sepolia for a rehearsal and writes the deployments file the castle service and the
// crew read (the keys of contracts/deployments/sepolia.json). Fork only: it refuses any RPC that is not anvil, every
// tx comes from an impersonated account, and no real key signs anything.
//
// On a fork taken after c-deploy (--mode live, the default when the vault in contracts/deployments/sepolia.json has
// code there) it adopts the deployed contracts, points the OffchainQuoteResolver at this run's gateway (setUrls as
// the owner), and registers quote.feefifofum.eth if the fork predates that. Otherwise (--mode fresh) it deploys them
// as contracts/script/DeployHoard.s.sol does:
//   PriceExtruction, CastleVault(aqua, router, weth, usdc, owner, fi, fum), OffchainQuoteResolver([gateway], owner, [fi]),
//   CastleJITHook through the CREATE2 deployer at a salt mined for flags 0x888, the pool {USDC, WETH, 0, 60, hook}
//   initialized, and quote.feefifofum.eth registered by 0x67Cc with the resolver in one register() call.
// Then it funds the hoard the way the treasury will (HOARD_USDC, and WETH worth as much at Chainlink's price: docs/SPEC.md,
// "5 USDC plus 5/mid WETH"), the crew's gas, and agy (the Jack) with USDC and WETH.
//
//   node scripts/fork-deploy.mjs --rpc http://127.0.0.1:18831 --gateway http://127.0.0.1:18832 --out <deployments.json>
//        [--mode live|fresh] [--artifacts ../contracts/out] [--hoard-usdc 5000000] [--hoard-weth <raw WETH> | balanced]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient, createWalletClient, http, parseAbi, getAddress, zeroAddress, keccak256, encodeAbiParameters,
  concat, encodeDeployData, toHex, pad,
} from 'viem';
import { sepolia } from 'viem/chains';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const RPC = opt('rpc', 'http://127.0.0.1:18831');
const GATEWAY = opt('gateway', 'http://127.0.0.1:18832');
const OUT = opt('out');
const ARTIFACTS = path.resolve(opt('artifacts', path.join(repo, 'contracts/out')));
const HOARD_USDC = BigInt(opt('hoard-usdc', 5_000_000));   // 5 USDC
// WETH worth HOARD_USDC at Chainlink's price unless given: a value-balanced hoard lets fi ship hen at 80% of both
// sides at the mid, as harp is.
const HOARD_WETH_ARG = opt('hoard-weth', 'balanced');
const MODE = opt('mode', 'auto');
if (!OUT) { console.error('usage: fork-deploy.mjs --rpc <anvil> --gateway <service url> --out <deployments.json> [--mode live|fresh]'); process.exit(2); }

const live = JSON.parse(fs.readFileSync(path.join(repo, 'contracts/deployments/sepolia.json'), 'utf8'));
const crew = JSON.parse(fs.readFileSync(path.join(repo, 'agents/crew.json'), 'utf8')).agents;
const ext = live.external;
// docs/SPEC.md "Existing addresses"
const A = {
  aqua: ext.aqua, weth: ext.weth, usdc: ext.usdc, universalResolverV2: ext.universalResolverV2,
  router: ext.aquaSwapVMRouter ?? live.contracts.aquaSwapVMRouter?.address ?? live.contracts.aquaSwapVMRouter,
  poolManager: ext.poolManager ?? '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
  poolSwapTest: ext.poolSwapTest ?? '0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe',
  stateView: ext.stateView ?? '0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C',
  v4Quoter: ext.v4Quoter ?? '0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227',
  chainlinkEthUsd: ext.chainlinkEthUsd ?? '0x694AA1769357215DE4FAC081bf1f309aDC325306',
  feefifofumRegistry: ext.feefifofumRegistry ?? '0x2F2164507471a1a46506f902aBfdfB9d22e4bE09',
  create2: '0x4e59b44847b379578588920cA78FbF26c0B4956C',
};
const OWNER = '0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2';
const DEPLOYER = '0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73';
const REGISTRAR = '0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99';
const AGY = '0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c';
const FI = getAddress(crew.fi.address), FUM = getAddress(crew.fum.address);
const HEN_SLOT = 1;
const HOOK_FLAGS = 0x888n;   // BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA | BEFORE_ADD_LIQUIDITY
const USDC_BALANCES_SLOT = 9n; // FiatTokenV2_2 balanceAndBlacklistStates

const chain = { ...sepolia, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const rpc = (method, params = []) => pub.request({ method, params });
const art = (file, name) => {
  const p = path.join(ARTIFACTS, file, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`missing ${p}: run forge build in contracts/`);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object };
};
const ERC20 = parseAbi(['function transfer(address,uint256) returns (bool)', 'function deposit() payable', 'function balanceOf(address) view returns (uint256)']);
const REG = parseAbi(['function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)', 'function getResolver(string label) view returns (address)']);
const PM = parseAbi(['struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }', 'function initialize(PoolKey key, uint160 sqrtPriceX96) returns (int24)']);
const RES = parseAbi(['function setUrls(string[] urls)', 'function urls() view returns (string[])']);
const at = (v) => (typeof v === 'string' ? v : v?.address);
const txs = [];

async function as(from, fn) {
  await rpc('anvil_impersonateAccount', [from]);
  await rpc('anvil_setBalance', [from, '0x8ac7230489e80000']);   // 10 ETH, fork only
  try { return await fn(createWalletClient({ account: from, chain, transport: http(RPC) })); }
  finally { await rpc('anvil_stopImpersonatingAccount', [from]); }
}
async function mined(hash, what) {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${what}: ${hash} reverted`);
  txs.push({ what, hash, block: Number(r.blockNumber), gasUsed: Number(r.gasUsed) });
  return r;
}
const deploy = (a, args, what) => as(DEPLOYER, async (w) => {
  const r = await mined(await w.deployContract({ abi: a.abi, bytecode: a.bytecode, args }), what);
  return { address: getAddress(r.contractAddress), tx: r.transactionHash, block: Number(r.blockNumber) };
});
const send = (from, address, abi, functionName, args, what, value) => as(from, async (w) => mined(await w.writeContract({ address, abi, functionName, args, value }), what));

const version = await rpc('web3_clientVersion');
if (!/anvil/i.test(version)) throw new Error(`refusing: ${RPC} is ${version}, not anvil`);
const chainId = await pub.getChainId();
const start = await pub.getBlock();

const gatewayUrl = `${GATEWAY.replace(/\/$/, '')}/ccip/{sender}/{data}.json`;
const liveVault = at(live.contracts.castleVault);
const adopt = MODE === 'live' || (MODE === 'auto' && !!liveVault && ((await pub.getCode({ address: liveVault })) ?? '0x').length > 2);
let priceEx, vault, resolver, hookAddr, hookRc = null, salt = null, poolId;
if (adopt) {
  // A fork taken after c-deploy: the contracts are there. Only the gateway URL is this run's.
  for (const k of ['priceExtruction', 'castleVault', 'offchainQuoteResolver', 'castleJITHook']) {
    if (!at(live.contracts[k]) || ((await pub.getCode({ address: at(live.contracts[k]) })) ?? '0x').length <= 2) throw new Error(`--mode live: no code for ${k} on this fork`);
  }
  priceEx = { address: getAddress(at(live.contracts.priceExtruction)) };
  vault = { address: getAddress(at(live.contracts.castleVault)) };
  resolver = { address: getAddress(at(live.contracts.offchainQuoteResolver)) };
  hookAddr = getAddress(at(live.contracts.castleJITHook));
  poolId = live.contracts.poolId;
  await send(OWNER, resolver.address, RES, 'setUrls', [[gatewayUrl]], 'OffchainQuoteResolver.setUrls (fork only: this run\'s gateway)');
} else {
  const PRICE = art('PriceExtruction.sol', 'PriceExtruction');
  const VAULT = art('CastleVault.sol', 'CastleVault');
  const RESOLVER = art('OffchainQuoteResolver.sol', 'OffchainQuoteResolver');
  const HOOK = art('CastleJITHook.sol', 'CastleJITHook');

  priceEx = await deploy(PRICE, [], 'deploy PriceExtruction');
  vault = await deploy(VAULT, [A.aqua, A.router, A.weth, A.usdc, OWNER, FI, FUM], 'deploy CastleVault');
  resolver = await deploy(RESOLVER, [[gatewayUrl], OWNER, [FI]], 'deploy OffchainQuoteResolver');

  // The hook lives at an address whose low 14 bits are its flags: mine the CREATE2 salt.
  const init = encodeDeployData({ abi: HOOK.abi, bytecode: HOOK.bytecode, args: [A.poolManager, A.router, vault.address, HEN_SLOT] });
  const initHash = keccak256(init);
  for (let i = 0n; ; i++) {
    salt = pad(toHex(i), { size: 32 });
    const a = BigInt(keccak256(concat(['0xff', A.create2, salt, initHash])).slice(0, 66)) & ((1n << 160n) - 1n);
    if ((a & 0x3fffn) === HOOK_FLAGS) { hookAddr = getAddress(pad(toHex(a), { size: 20 })); break; }
  }
  hookRc = await as(DEPLOYER, async (w) => mined(await w.sendTransaction({ to: A.create2, data: concat([salt, init]) }), 'deploy CastleJITHook (CREATE2)'));
  if (!(await pub.getCode({ address: hookAddr }))?.length) throw new Error(`no code at the mined hook address ${hookAddr}`);

  const [c0, c1] = BigInt(A.usdc) < BigInt(A.weth) ? [A.usdc, A.weth] : [A.weth, A.usdc];
  const key = { currency0: getAddress(c0), currency1: getAddress(c1), fee: 0, tickSpacing: 60, hooks: hookAddr };
  const isqrt = (n) => { let x = n, y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; };
  const sqrtPriceX96 = isqrt((10n ** 18n << 192n) / 3_000_000_000n);   // 3,000 USDC per WETH as DeployHoard sets it; the pool holds no liquidity
  await send(DEPLOYER, A.poolManager, PM, 'initialize', [key, sqrtPriceX96], 'PoolManager.initialize');
  poolId = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
}

const registered = getAddress(await pub.readContract({ address: A.feefifofumRegistry, abi: REG, functionName: 'getResolver', args: ['quote'] }));
if (registered === getAddress(zeroAddress)) await send(REGISTRAR, A.feefifofumRegistry, REG, 'register', ['quote', REGISTRAR, zeroAddress, resolver.address, 0n, start.timestamp + 365n * 86400n], 'register quote.feefifofum.eth');
const stored = getAddress(await pub.readContract({ address: A.feefifofumRegistry, abi: REG, functionName: 'getResolver', args: ['quote'] }));
if (stored !== resolver.address) throw new Error(`getResolver("quote") = ${stored}, not ${resolver.address}`);

// Fork-only funding: the hoard, the crew's gas, and agy's USDC and WETH.
const CL = parseAbi(['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)', 'function decimals() view returns (uint8)']);
const [[, answer], clDec] = await Promise.all([pub.readContract({ address: A.chainlinkEthUsd, abi: CL, functionName: 'latestRoundData' }), pub.readContract({ address: A.chainlinkEthUsd, abi: CL, functionName: 'decimals' })]);
const HOARD_WETH = HOARD_WETH_ARG === 'balanced' ? (HOARD_USDC * 10n ** 12n * 10n ** BigInt(clDec)) / answer : BigInt(HOARD_WETH_ARG);
const usdcTo = (who, amount) => rpc('anvil_setStorageAt', [A.usdc, keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [who, USDC_BALANCES_SLOT])), pad(toHex(amount), { size: 32 })]);
// Only what the vault lacks: on a fork taken after a-live's phase A the treasury's live funding is already there.
const held = (t) => pub.readContract({ address: t, abi: ERC20, functionName: 'balanceOf', args: [vault.address] });
const [hu0, hw0] = await Promise.all([held(A.usdc), held(A.weth)]);
if (hu0 < HOARD_USDC) await usdcTo(vault.address, HOARD_USDC);
if (hw0 < HOARD_WETH) {
  await send(OWNER, A.weth, ERC20, 'deposit', [], null, HOARD_WETH - hw0);
  await send(OWNER, A.weth, ERC20, 'transfer', [vault.address, HOARD_WETH - hw0], 'fund the hoard (WETH)');
}
for (const id of Object.keys(crew)) await rpc('anvil_setBalance', [crew[id].address, '0xde0b6b3a7640000']);   // 1 ETH
await rpc('anvil_setBalance', [AGY, '0xde0b6b3a7640000']);
await usdcTo(AGY, 20_000_000n);
await send(AGY, A.weth, ERC20, 'deposit', [], null, 10n ** 16n);
const [hu, hw] = await Promise.all([pub.readContract({ address: A.usdc, abi: ERC20, functionName: 'balanceOf', args: [vault.address] }), pub.readContract({ address: A.weth, abi: ERC20, functionName: 'balanceOf', args: [vault.address] })]);
if (hu < HOARD_USDC || hw < HOARD_WETH) throw new Error(`hoard is ${hu} USDC, ${hw} WETH`);

const forkNote = { rpc: RPC, forkBlock: Number(start.number), mode: adopt ? 'live' : 'fresh', gateway: gatewayUrl, note: adopt ? 'anvil fork of live Sepolia after c-deploy: the deployed contracts, with the resolver pointed at this run\'s gateway' : 'anvil fork of live Sepolia; fork-only addresses' };
const out = adopt ? { ...live, fork: forkNote, txs } : {
  chainId, fork: forkNote,
  external: { ...ext, aquaSwapVMRouter: A.router, poolManager: A.poolManager, poolSwapTest: A.poolSwapTest, stateView: A.stateView, v4Quoter: A.v4Quoter, chainlinkEthUsd: A.chainlinkEthUsd, feefifofumRegistry: A.feefifofumRegistry },
  contracts: {
    priceExtruction: priceEx, castleVault: vault, offchainQuoteResolver: resolver,
    castleJITHook: { address: hookAddr, tx: hookRc.transactionHash, block: Number(hookRc.blockNumber), salt },
    poolId,
  },
  txs,
};
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ deployed: true, mode: adopt ? 'live' : 'fresh', forkBlock: Number(start.number), chainlink: Number(answer) / 10 ** Number(clDec), vault: vault.address, priceExtruction: priceEx.address, resolver: resolver.address, hook: hookAddr, poolId, gateway: gatewayUrl, hoard: { USDC: hu.toString(), WETH: hw.toString(), funded: hu0 >= HOARD_USDC && hw0 >= HOARD_WETH ? 'live (the treasury)' : 'fork' }, out: OUT, gas: txs.reduce((a, t) => a + t.gasUsed, 0) }));
