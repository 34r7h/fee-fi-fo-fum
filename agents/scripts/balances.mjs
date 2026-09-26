#!/usr/bin/env node
// Crew wallet balances on Sepolia (ETH, Circle USDC, WETH9) with Etherscan links: the p0-wallets record.
// Prints a markdown table (ready for WORKLOG.md), or JSON lines with --json.
//
//   node agents/scripts/balances.mjs [--json] [id ...]      (default: every agent in agents/crew.json)
import fs from 'node:fs';
import path from 'node:path';
import { erc20Abi, formatEther, formatUnits } from 'viem';
import { AGENTS_ROOT, loadEnv } from '../lib/env.mjs';
import { publicClient, contractAddress, addressLink, rpcUrls } from '../lib/chain.mjs';

loadEnv();
const args = process.argv.slice(2);
const json = args.includes('--json');
const crew = JSON.parse(fs.readFileSync(path.join(AGENTS_ROOT, 'crew.json'), 'utf8'));
const ids = args.filter((a) => !a.startsWith('--'));
const pc = publicClient();
const [chainId, block] = await Promise.all([pc.getChainId(), pc.getBlockNumber()]);
const usdc = contractAddress('usdc');
const weth = contractAddress('weth');
const token = (address, owner) => pc.readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });

const rows = [];
for (const id of ids.length ? ids : Object.keys(crew.agents)) {
  const address = crew.agents[id]?.address;
  if (!address) { console.error(`${id}: not in crew.json`); process.exitCode = 1; continue; }
  const [eth, u, w] = await Promise.all([pc.getBalance({ address, blockNumber: block }), token(usdc, address), token(weth, address)]);
  rows.push({ id, address, eth: formatEther(eth), usdc: formatUnits(u, 6), weth: formatEther(w), link: addressLink(address) });
}

if (json) {
  for (const r of rows) console.log(JSON.stringify({ ...r, chainId, block: String(block) }));
} else {
  console.log(`Sepolia (chain ${chainId}) at block ${block}, via ${new URL(rpcUrls()[0]).host}\n`);
  console.log('| agent | address | ETH | USDC | WETH |');
  console.log('|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.id} | [${r.address}](${r.link}) | ${r.eth} | ${r.usdc} | ${r.weth} |`);
}
