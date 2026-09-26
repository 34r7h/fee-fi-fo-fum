#!/usr/bin/env node
// Registers quote.feefifofum.eth on Sepolia with the OffchainQuoteResolver, in one register() call from the
// feefifofum registrar 0x67Cc (docs/SPEC.md "Research gates"): register("quote", 0x67Cc, address(0), resolver, 0,
// now + 365 days) on the registry 0x2F21…e09. The resolver comes from the deployments file.
// Without --send it only checks and simulates: the key derives to the registrar, the resolver has code, advertises
// IExtendedResolver (0x9061b923) and trusts fi, `quote` is not registered yet, and the call simulates, with its gas and
// cost at MAX_FEE_GWEI (1.8). With --send it sends that one tx and verifies getResolver("quote").
//   node scripts/register-quote.mjs [--send]     env: REGISTRAR_KEY_PATH (~/.handoff/agents/castle/sepolia.key),
//                                                     MAX_FEE_GWEI (1.8), MAX_GAS (150000), SEPOLIA_RPC_URL
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, parseAbi, parseGwei, formatEther, getAddress, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { loadEnv, env, expandHome } from '../lib/env.mjs';
import { contractAddress } from '../lib/chain.mjs';

loadEnv();
const SEND = process.argv.includes('--send');
const REGISTRAR = '0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99';
const REGISTRY = getAddress(contractAddress('registry') ?? contractAddress('feefifofumRegistry') ?? '0x2F2164507471a1a46506f902aBfdfB9d22e4bE09');
const FI = '0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2';
const MAX_FEE = parseGwei(env('MAX_FEE_GWEI', '1.8'));
const MAX_GAS = BigInt(env('MAX_GAS', 150_000));
const RPC = env('SEPOLIA_RPC_URL');
const REG = parseAbi(['function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)', 'function getResolver(string label) view returns (address)']);
const RES = parseAbi(['function supportsInterface(bytes4) view returns (bool)', 'function signers(address) view returns (bool)']);
const out = (o) => console.log(JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
const fail = (m) => { out({ ok: false, error: m }); process.exit(1); };

const keyPath = expandHome(env('REGISTRAR_KEY_PATH', '~/.handoff/agents/castle/sepolia.key'));
if ((fs.statSync(keyPath).mode & 0o077) !== 0) fail(`${keyPath} must be mode 0600`);
const account = privateKeyToAccount(fs.readFileSync(keyPath, 'utf8').trim());
if (account.address !== getAddress(REGISTRAR)) fail(`the key derives to ${account.address}, not the registrar ${REGISTRAR}`);
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
if ((await pub.getChainId()) !== 11155111) fail('not Sepolia');

const resolver = getAddress(contractAddress('quoteResolver') ?? fail('no OffchainQuoteResolver in the deployments file'));
const [code, ext, trusts, current, balance, block] = await Promise.all([
  pub.getCode({ address: resolver }),
  pub.readContract({ address: resolver, abi: RES, functionName: 'supportsInterface', args: ['0x9061b923'] }),
  pub.readContract({ address: resolver, abi: RES, functionName: 'signers', args: [FI] }),
  pub.readContract({ address: REGISTRY, abi: REG, functionName: 'getResolver', args: ['quote'] }),
  pub.getBalance({ address: REGISTRAR }),
  pub.getBlock(),
]);
if (!code || code === '0x') fail(`no code at the resolver ${resolver}`);
if (!ext) fail('the resolver does not advertise IExtendedResolver (0x9061b923): UniversalResolverV2 would return ResolverError');
if (!trusts) fail(`the resolver does not trust fi ${FI}`);
if (getAddress(current) === resolver) { out({ ok: true, note: 'quote already points at the resolver', resolver }); process.exit(0); }
if (current !== zeroAddress) fail(`quote is already registered, with resolver ${current}`);

const expiry = block.timestamp + 365n * 86_400n;
const args = ['quote', REGISTRAR, zeroAddress, resolver, 0n, expiry];
await pub.simulateContract({ address: REGISTRY, abi: REG, functionName: 'register', args, account }).catch((e) => fail(`simulation reverted: ${e.shortMessage || e.message}`));
const gas = await pub.estimateContractGas({ address: REGISTRY, abi: REG, functionName: 'register', args, account });
const baseFee = block.baseFeePerGas ?? 0n;
const plan = { registry: REGISTRY, resolver, from: REGISTRAR, expiry, gas, baseFeeGwei: Number(baseFee) / 1e9, maxFeeGwei: Number(MAX_FEE) / 1e9, maxCostEth: formatEther(gas * MAX_FEE), balanceEth: formatEther(balance) };
if (gas > MAX_GAS) fail(`gas ${gas} is over MAX_GAS ${MAX_GAS}: stop and report`);
if (gas * MAX_FEE > balance) fail(`the registrar holds ${formatEther(balance)} ETH, less than ${formatEther(gas * MAX_FEE)}`);
if (!SEND) { out({ ok: true, simulated: true, ...plan }); process.exit(0); }

const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
const tip = parseGwei('0.1') < MAX_FEE ? parseGwei('0.1') : MAX_FEE;
const hash = await wallet.writeContract({ address: REGISTRY, abi: REG, functionName: 'register', args, gas: (gas * 12n) / 10n, maxFeePerGas: MAX_FEE, maxPriorityFeePerGas: tip });
out({ sent: hash, link: `https://sepolia.etherscan.io/tx/${hash}` });
const rc = await pub.waitForTransactionReceipt({ hash, timeout: 300_000 });
const now = await pub.readContract({ address: REGISTRY, abi: REG, functionName: 'getResolver', args: ['quote'] });
out({ ok: rc.status === 'success' && getAddress(now) === resolver, tx: hash, status: rc.status, block: rc.blockNumber, gasUsed: rc.gasUsed, effectiveGasPriceGwei: Number(rc.effectiveGasPrice) / 1e9, costEth: formatEther(rc.gasUsed * rc.effectiveGasPrice), getResolver: now });
