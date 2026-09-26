#!/usr/bin/env node
// Wraps a little Sepolia ETH into WETH9 for crew wallets (p0-wallets). Each deposit is simulated against the
// chain first (a free dry run), then sent from the agent's own key file; the receipt's Etherscan link is printed.
// A wallet is never wrapped below RESERVE_ETH, which it keeps for gas.
//
//   node agents/scripts/wrap-weth.mjs fee=0.001 fi=0.001 fum=0.001 fo=0.0002 [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { formatEther, parseAbi, parseEther } from 'viem';
import { AGENTS_ROOT, env, loadEnv } from '../lib/env.mjs';
import { publicClient, walletClient, loadAccount, contractAddress, txLink } from '../lib/chain.mjs';

loadEnv();
const WETH9 = parseAbi(['function deposit() payable', 'function balanceOf(address) view returns (uint256)']);
const RESERVE = parseEther(env('RESERVE_ETH', '0.0005'));
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const plan = args.filter((a) => !a.startsWith('--')).map((a) => {
  const m = a.match(/^([a-z]+)=([0-9.]+)$/);
  if (!m) throw new Error(`expected <id>=<eth>, got ${a}`);
  return { id: m[1], value: parseEther(m[2]) };
});
if (!plan.length) { console.error('usage: wrap-weth.mjs <id>=<eth> ... [--dry-run]'); process.exit(2); }

const crew = JSON.parse(fs.readFileSync(path.join(AGENTS_ROOT, 'crew.json'), 'utf8'));
const pc = publicClient();
const chainId = await pc.getChainId();
if (chainId !== crew.chain_id) throw new Error(`RPC is chain ${chainId}, crew.json says ${crew.chain_id}`);
const weth = contractAddress('weth');

for (const { id, value } of plan) {
  const account = loadAccount(id);
  if (account.address.toLowerCase() !== crew.agents[id]?.address?.toLowerCase()) throw new Error(`${id}: key file address does not match crew.json`);
  const balance = await pc.getBalance({ address: account.address });
  if (balance - value < RESERVE) { console.log(JSON.stringify({ id, skipped: `would leave ${formatEther(balance - value)} ETH, under the ${formatEther(RESERVE)} reserve` })); continue; }
  const req = { address: weth, abi: WETH9, functionName: 'deposit', value, account };
  const { request } = await pc.simulateContract(req);
  const gas = await pc.estimateContractGas(req);
  if (dry) { console.log(JSON.stringify({ id, dryRun: true, wrap: formatEther(value), gas: String(gas), ethBefore: formatEther(balance) })); continue; }
  const hash = await walletClient(account).writeContract(request);
  const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 180_000 });
  const wethAfter = await pc.readContract({ address: weth, abi: WETH9, functionName: 'balanceOf', args: [account.address] });
  console.log(JSON.stringify({ id, wrapped: formatEther(value), status: receipt.status, tx: txLink(hash), gasUsed: String(receipt.gasUsed), weth: formatEther(wethAfter) }));
  if (receipt.status !== 'success') process.exitCode = 1;
}
