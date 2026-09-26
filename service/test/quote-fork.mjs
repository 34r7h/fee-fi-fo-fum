#!/usr/bin/env node
// Beat 2 on an anvil fork of live Sepolia: a solver resolves quote.feefifofum.eth through CCIP-Read and fills it.
//
// Deployed on the fork (contracts/out): PriceExtruction, CastleVault and OffchainQuoteResolver. Everything else is
// live Sepolia state: Aqua, the AquaSwapVMRouter 1.0.2, WETH, USDC, the feefifofum subregistry and
// UniversalResolverV2. The registrar 0x67Cc registers "quote" with the resolver in one register() call, fum caps the
// harp slot, fi ships harp, and a local gateway (this file, on lib/ccip-sign.mjs) answers the CCIP-Read request with
// a quote fi signed. The solver side is plain viem: getEnsText({ name, key, universalResolverAddress }) with ccipRead
// on. The quote is then checked three ways: fi's EIP-712 signature (JS), PriceExtruction.quoteDigest (on-chain), and
// router.quote(order, ..., takerTraitsAndData) returning the quoted amountOut. Then agy fills it with router.swap.
//
// fi's key here is a throwaway generated per run and never printed (the real fi key never leaves the service host);
// it is the vault's fi and the resolver's signer on the fork. Every tx is sent from an impersonated account, so
// nothing is signed with a real key and nothing leaves the fork. The script refuses to run against anything but
// anvil.
//
//   anvil --fork-url https://sepolia.gateway.tenderly.co --fork-block-number <n> --port 18611 &
//   node test/quote-fork.mjs --rpc http://127.0.0.1:18611 [--port 8787]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient, createWalletClient, http as httpTransport, parseAbi, getAddress, formatEther, formatUnits,
  zeroAddress, keccak256, encodeAbiParameters,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as C from '../lib/ccip-sign.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const RPC = opt('rpc', 'http://127.0.0.1:18611');
const PORT = Number(opt('port', 8787));

// docs/SPEC.md addresses
const AQUA = '0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a';
const ROUTER = '0xeDB6933949dB941D495b23604818F9AbF55e70f9';
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const REGISTRY = '0x2F2164507471a1a46506f902aBfdfB9d22e4bE09';
const REGISTRAR = '0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99';
const UR = '0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3';
const OWNER = '0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2';
const DEPLOYER = '0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73';
const FI_LIVE = '0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2';
const FUM = '0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2';
const AGY = '0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c';
const PROD_URL = 'https://handoff.lol/t/castle/ccip/{sender}/{data}.json';
const NAME = 'quote.feefifofum.eth';
const KEY = 'quote:USDC:WETH:1000000';
const HARP = 0;
const HOARD_WETH = 10n ** 18n; // 1 WETH
const USDC_PER_WETH = 3000n; // fee's mid for this run
const PRICE_Q96 = (10n ** 18n << 96n) / (USDC_PER_WETH * 10n ** 6n); // raw WETH per raw USDC, Q96
const TTL = 30n;
const USDC_BALANCES_SLOT = 9n; // FiatTokenV2_2 balanceAndBlacklistStates

const FI_KEY = generatePrivateKey(); // throwaway, this run only; never printed
const fi = privateKeyToAccount(FI_KEY);

const chain = { ...sepolia, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: httpTransport(RPC) });
const rpc = (method, params = []) => pub.request({ method, params });

const artifact = (file, name) => JSON.parse(fs.readFileSync(path.join(repo, `contracts/out/${file}/${name}.json`), 'utf8'));
const RESOLVER = artifact('OffchainQuoteResolver.sol', 'OffchainQuoteResolver');
const VAULT = artifact('CastleVault.sol', 'CastleVault');
const PRICE = artifact('PriceExtruction.sol', 'PriceExtruction');
const ERC20 = parseAbi([
  'function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)', 'function deposit() payable',
]);
const REG = parseAbi([
  'function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)',
  'function getResolver(string label) view returns (address)',
]);
const AQUA_ABI = parseAbi(['function rawBalances(address maker, address app, bytes32 strategyHash, address token) view returns (uint248, uint8)']);
const ORDER = { type: 'tuple', components: [{ name: 'maker', type: 'address' }, { name: 'traits', type: 'uint256' }, { name: 'data', type: 'bytes' }] };
const swapIo = {
  inputs: [{ ...ORDER, name: 'order' }, { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'takerTraitsAndData', type: 'bytes' }],
  outputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'amountOut', type: 'uint256' }, { name: 'orderHash', type: 'bytes32' }],
};
const SWAPVM_FNS = [
  { type: 'function', name: 'quote', stateMutability: 'view', ...swapIo },
  { type: 'function', name: 'swap', stateMutability: 'nonpayable', ...swapIo },
];
// the router bubbles PriceExtruction's errors; include them so viem names the revert
const SWAPVM = [...SWAPVM_FNS, ...PRICE.abi.filter((x) => x.type === 'error')];

const gas = {};
const log = (...a) => console.log(...a);

async function as(from, fn) {
  await rpc('anvil_impersonateAccount', [from]);
  await rpc('anvil_setBalance', [from, '0x8ac7230489e80000']); // 10 ETH, fork only
  try {
    return await fn(createWalletClient({ account: from, chain, transport: httpTransport(RPC) }));
  } finally {
    await rpc('anvil_stopImpersonatingAccount', [from]);
  }
}
async function mined(hash, label) {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${label}: tx ${hash} reverted`);
  if (label) gas[label] = r.gasUsed;
  return r;
}
const deploy = (from, art, args, label) => as(from, async (w) => {
  const hash = await w.deployContract({ abi: art.abi, bytecode: art.bytecode.object, args });
  return getAddress((await mined(hash, label)).contractAddress);
});
const send = (from, address, abi, functionName, args, label, value) =>
  as(from, async (w) => mined(await w.writeContract({ address, abi, functionName, args, value }), label));

// ---- the gateway: what agent-smith's service does, on lib/ccip-sign.mjs --------------------------------------------
function gateway({ resolver, vault, strategyHash, order, domain, chainId }) {
  const TOKENS = { USDC, WETH };
  let served = 0;
  const answer = async (req) => {
    const r = C.decodeCcipRequest(req);
    if (r.sender !== resolver) return [404, { message: `unknown sender ${r.sender}` }];
    if (r.name !== NAME || r.record.functionName !== 'text') return [404, { message: `no ${r.record.functionName} record` }];
    const k = C.parseRecordKey(r.key);
    if (!k) return [404, { message: `unknown key ${r.key}` }];
    const expires = BigInt(Math.floor(Date.now() / 1000)) + TTL;
    let text;
    if (k.kind === 'castle') {
      text = vault;
    } else {
      if (k.tokenIn !== 'USDC' || k.tokenOut !== 'WETH') return [404, { message: 'this run quotes USDC to WETH only' }];
      const quote = { strategyHash, tokenIn: TOKENS[k.tokenIn], tokenOut: TOKENS[k.tokenOut], priceQ96: PRICE_Q96, maxAmountIn: k.amountIn, validUntil: expires };
      const amountOut = C.quoteAmountOut(k.amountIn, PRICE_Q96);
      const quoteSig = await C.signQuote(domain, quote, FI_KEY);
      text = C.buildQuoteRecord({ id: `q-${++served}`, chainId, router: ROUTER, order, quote, amountIn: k.amountIn, amountOut, signer: fi.address, quoteSig });
    }
    const result = C.encodeRecordResult('text', text);
    const sig = await C.signCcipResponse({ target: r.sender, request: r.request, result, expires, privateKey: FI_KEY });
    log(`  gateway: ${r.name} text("${r.key}") from sender ${r.sender}: ${text.length} chars, expires ${expires}`);
    return [200, { data: C.encodeCcipResponse({ result, expires, sig }) }];
  };
  return http.createServer(async (req, res) => {
    let status, body;
    try {
      if (req.method === 'GET' && req.url.startsWith('/ccip/')) [status, body] = await answer(req.url);
      else if (req.method === 'POST' && req.url.startsWith('/ccip')) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        [status, body] = await answer(Buffer.concat(chunks).toString('utf8'));
      } else [status, body] = [404, { message: 'not found' }];
    } catch (e) {
      [status, body] = [400, { message: e.shortMessage || e.message }];
    }
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(body));
  });
}

async function main() {
  // ---- fork only ----
  const [chainId, clientVersion] = await Promise.all([pub.getChainId(), rpc('web3_clientVersion')]);
  if (!/anvil/i.test(clientVersion)) throw new Error(`refusing: ${RPC} is ${clientVersion}, not anvil`);
  const block = await pub.getBlock();
  log(`fork: ${clientVersion}, chainId ${chainId}, block ${block.number}, timestamp ${block.timestamp}`);
  log(`fi (throwaway, fork only): ${fi.address}`);

  // ---- deploy: the resolver exactly as the live deploy will (prod URL, signer fi), then point it at this run ----
  const priceEx = await deploy(DEPLOYER, PRICE, [], 'deploy PriceExtruction');
  const vault = await deploy(DEPLOYER, VAULT, [AQUA, ROUTER, WETH, USDC, OWNER, fi.address, FUM], 'deploy CastleVault');
  const resolver = await deploy(DEPLOYER, RESOLVER, [[PROD_URL], OWNER, [FI_LIVE]], 'deploy OffchainQuoteResolver');
  log(`PriceExtruction ${priceEx}\nCastleVault ${vault}\nOffchainQuoteResolver ${resolver}`);
  const localUrl = `http://127.0.0.1:${PORT}/ccip/{sender}/{data}.json`;
  await send(OWNER, resolver, RESOLVER.abi, 'setUrls', [[localUrl]], 'resolver.setUrls');
  await send(OWNER, resolver, RESOLVER.abi, 'setSigners', [[fi.address], true], 'resolver.setSigners');
  await send(REGISTRAR, REGISTRY, REG, 'register', ['quote', REGISTRAR, zeroAddress, resolver, 0n, block.timestamp + 365n * 86400n], 'register(quote)');
  const stored = getAddress(await pub.readContract({ address: REGISTRY, abi: REG, functionName: 'getResolver', args: ['quote'] }));
  if (stored !== resolver) throw new Error(`getResolver("quote") = ${stored}`);
  log(`registered quote.feefifofum.eth -> resolver ${stored}`);

  // ---- the hoard and the harp ----
  await send(OWNER, WETH, ERC20, 'deposit', [], null, HOARD_WETH);
  await send(OWNER, WETH, ERC20, 'transfer', [vault, HOARD_WETH], null);
  await send(FUM, vault, VAULT.abi, 'setCap', [HARP, HOARD_WETH, 0n], 'vault.setCap');
  const harpProgram = `0x2014${priceEx.slice(2).toLowerCase()}`; // Extruction(PriceExtruction): opcode 32, 20 bytes of args
  await send(fi.address, vault, VAULT.abi, 'ship', [HARP, harpProgram, HOARD_WETH, 0n], 'vault.ship(harp)');
  const strategyHash = await pub.readContract({ address: vault, abi: VAULT.abi, functionName: 'strategyIn', args: [HARP] });
  const order = await pub.readContract({ address: vault, abi: VAULT.abi, functionName: 'orderOf', args: [strategyHash] });
  log(`harp ${strategyHash} shipped with ${formatEther(HOARD_WETH)} WETH`);

  const domain = C.priceExtructionDomain(priceEx, chainId);
  const server = gateway({ resolver, vault, strategyHash, order, domain, chainId });
  await new Promise((ok) => server.listen(PORT, '127.0.0.1', ok));
  log(`gateway listening: ${localUrl}`);

  try {
    // ---- the solver: plain viem, CCIP-Read through UniversalResolverV2 ----
    const solver = createPublicClient({ chain, transport: httpTransport(RPC) }); // ccipRead is on by default
    log(`\nsolver: getEnsText({ name: '${NAME}', key: '${KEY}', universalResolverAddress: ${UR} })`);
    const text = await solver.getEnsText({ name: NAME, key: KEY, universalResolverAddress: UR });
    log(`  record: ${text}`);
    const rec = C.parseQuoteRecord(text);

    // 1. fi's EIP-712 signature, in JS
    const v = await C.verifyQuote(domain, rec.quote, rec.quoteSig, { expectedSigner: fi.address });
    log(`  verifyQuote: valid=${v.valid} signer=${v.signer} fresh=${v.fresh}`);
    if (!v.valid) throw new Error('quote does not verify');
    // 2. the same digest on-chain
    const onchainDigest = await pub.readContract({ address: priceEx, abi: PRICE.abi, functionName: 'quoteDigest', args: [rec.quote] });
    const jsDigest = C.quoteDigest(domain, rec.quote);
    log(`  PriceExtruction.quoteDigest == JS quoteDigest: ${onchainDigest === jsDigest} (${jsDigest})`);
    if (onchainDigest !== jsDigest) throw new Error('digest mismatch');
    // 3. the router prices it exactly as quoted
    const [qIn, qOut, qHash] = await pub.readContract({ address: ROUTER, abi: SWAPVM, functionName: 'quote', args: [rec.order, rec.tokenIn, rec.tokenOut, rec.amountIn, rec.takerTraitsAndData] });
    log(`  router.quote: amountIn ${qIn}, amountOut ${qOut} (record says ${rec.amountOut}), orderHash ${qHash}`);
    if (qOut !== rec.amountOut || qHash !== strategyHash) throw new Error('router quote differs from the record');

    // the castle key
    const castle = await solver.getEnsText({ name: NAME, key: 'castle', universalResolverAddress: UR });
    log(`  text("castle") = ${castle}`);
    if (getAddress(castle) !== vault) throw new Error('castle key');

    // ---- agy fills the quote ----
    const usdcSlot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [AGY, USDC_BALANCES_SLOT]));
    await rpc('anvil_setStorageAt', [USDC, usdcSlot, `0x${(10n ** 8n).toString(16).padStart(64, '0')}`]); // 100 USDC, fork only
    const agyUsdc0 = await pub.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [AGY] });
    if (agyUsdc0 !== 10n ** 8n) throw new Error(`USDC balance slot guess wrong: ${agyUsdc0}`);
    const [vW0, vU0, aW0] = await Promise.all([
      pub.readContract({ address: WETH, abi: ERC20, functionName: 'balanceOf', args: [vault] }),
      pub.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [vault] }),
      pub.readContract({ address: WETH, abi: ERC20, functionName: 'balanceOf', args: [AGY] }),
    ]);
    await send(AGY, USDC, ERC20, 'approve', [ROUTER, rec.amountIn], 'agy approve USDC');
    const fill = await send(AGY, ROUTER, SWAPVM, 'swap', [rec.order, rec.tokenIn, rec.tokenOut, rec.amountIn, rec.takerTraitsAndData], 'agy router.swap (harp fill)');
    const [vW1, vU1, aW1] = await Promise.all([
      pub.readContract({ address: WETH, abi: ERC20, functionName: 'balanceOf', args: [vault] }),
      pub.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [vault] }),
      pub.readContract({ address: WETH, abi: ERC20, functionName: 'balanceOf', args: [AGY] }),
    ]);
    const [harpWeth] = await pub.readContract({ address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances', args: [vault, ROUTER, strategyHash, WETH] });
    log(`  fill tx ${fill.transactionHash} (fork), status ${fill.status}`);
    log(`  vault WETH ${formatEther(vW0)} -> ${formatEther(vW1)} (-${formatEther(vW0 - vW1)}), vault USDC ${formatUnits(vU0, 6)} -> ${formatUnits(vU1, 6)}`);
    log(`  agy WETH +${formatEther(aW1 - aW0)}; harp's Aqua WETH ${formatEther(harpWeth)}`);
    if (vW0 - vW1 !== rec.amountOut || aW1 - aW0 !== rec.amountOut || vU1 - vU0 !== rec.amountIn || harpWeth !== HOARD_WETH - rec.amountOut) {
      throw new Error('balances did not move by the quoted amounts');
    }

    // ---- stale: the same quote once its validUntil (issued + 30 s) has passed on chain ----
    // (the gateway stamps wall-clock time; the fork's clock can trail it, so step the chain past validUntil exactly)
    await rpc('evm_setNextBlockTimestamp', [`0x${(rec.quote.validUntil + 1n).toString(16)}`]);
    await rpc('evm_mine');
    let stale;
    try {
      await pub.readContract({ address: ROUTER, abi: SWAPVM, functionName: 'quote', args: [rec.order, rec.tokenIn, rec.tokenOut, rec.amountIn, rec.takerTraitsAndData] });
    } catch (e) {
      stale = e.cause?.data?.errorName || e.cause?.signature || e.shortMessage || e.message;
    }
    log(`  the same quote at validUntil + 1 (chain time ${rec.quote.validUntil + 1n}): ${stale ?? 'STILL PRICED'}`);
    if (!/QuoteExpired/.test(String(stale))) throw new Error(`a stale quote did not revert QuoteExpired: ${stale}`);
  } finally {
    server.close();
  }

  log('\ngas (receipt gasUsed on the fork):');
  for (const [k, g] of Object.entries(gas)) log(`  ${k.padEnd(34)} ${g}`);
  log('\nPASS');
}

main().catch((e) => { console.error('FAIL:', e.shortMessage || e.message); process.exit(1); });
