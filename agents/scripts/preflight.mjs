#!/usr/bin/env node
// Before a demo window on Sepolia: is the castle ready for the crew? Reads only; prints one PASS/FAIL line per
// check and exits 1 on any FAIL, so `preflight && up.sh` never starts a renew loop against a half-wired castle.
//
//   node agents/scripts/preflight.mjs            (the RPC and deployments from env, like the crew)
import fs from 'node:fs';
import path from 'node:path';
import { erc20Abi, formatEther, formatUnits, parseAbi } from 'viem';
import { AGENTS_ROOT, REPO_ROOT, loadEnv } from '../lib/env.mjs';
import { publicClient, contractAddress, abi, addressLink } from '../lib/chain.mjs';
import { ensAnchorQ96 } from '../lib/book.mjs';

loadEnv();
const crew = JSON.parse(fs.readFileSync(path.join(AGENTS_ROOT, 'crew.json'), 'utf8')).agents;
const ens = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'contracts/deployments/ens-agents.sepolia.json'), 'utf8'));
const pc = publicClient();
const ROLES = parseAbi(['function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)']);
const MIN_ETH = { fee: 0.002, fi: 0.002, fo: 0, fum: 0.001 };
let failed = 0;
const check = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `  (${detail})` : ''}`); };
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

const castle = contractAddress('castle');
check(Boolean(castle), 'Castle is in the deployments file', castle ? addressLink(castle) : 'contracts.castle missing');
if (!castle) process.exit(1);
const C = abi('Castle');
const read = (functionName, args = []) => pc.readContract({ address: castle, abi: C, functionName, args });
const [code, fo, registry, resolver, router, expiry, anchor, weth, usdc] = await Promise.all([
  pc.getCode({ address: castle }), read('fo'), read('REGISTRY'), read('RESOLVER'), read('ROUTER'), read('expiry'), read('anchorPriceQ96'),
  pc.readContract({ address: contractAddress('weth'), abi: erc20Abi, functionName: 'balanceOf', args: [castle] }),
  pc.readContract({ address: contractAddress('usdc'), abi: erc20Abi, functionName: 'balanceOf', args: [castle] }),
]);
check((code || '0x').length > 2, 'Castle has code');
check(same(fo, crew.fo.address), 'Castle.fo() is fo', fo);
check(same(registry, ens.agentRegistry), 'Castle.REGISTRY is the agent registry', registry);
check(same(resolver, ens.resolver), 'Castle.RESOLVER is the agent resolver', resolver);
check(same(router, contractAddress('router')), 'Castle.ROUTER is the live AquaSwapVMRouter', router);
const [regRoles, resRoles] = await Promise.all([
  pc.readContract({ address: registry, abi: ROLES, functionName: 'hasRootRoles', args: [(1n << 0n) | (1n << 16n), castle] }),
  pc.readContract({ address: resolver, abi: ROLES, functionName: 'hasRootRoles', args: [(1n << 24n) | (1n << 28n), castle] }),
]);
check(regRoles, 'Castle holds ROOT REGISTRAR|RENEW on the agent registry', 'agent-registry.mjs --castle grants it');
check(resRoles, 'Castle holds ROOT SET_DATA|LINK on the resolver', 'agent-registry.mjs --castle grants it');
for (const id of ['fee', 'fi']) check(await read('isCrew', [crew[id].address]), `Castle.isCrew(${id})`, `setCrew(${crew[id].address}, "${id}") by the owner, and ${id}.feefifofum.eth unexpired`);
check(anchor > 0n, 'the ENS anchor (handoff-price) is set', `anchorPriceQ96 ${anchor}`);
if (anchor > 0n) {
  const e = await ensAnchorQ96(pc, castle);
  check(e === anchor, 'Castle reads the same anchor the resolver holds', `resolver ${e}`);
}
check(weth > 0n && usdc > 0n, 'Castle holds a book to ship', `${formatEther(weth)} WETH, ${formatUnits(usdc, 6)} USDC`);
// Not a failure: after the first window the castle has a history, and on restart fi claims an expired lease.
console.log(Number(expiry) === 0 ? 'INFO castle.feefifofum.eth is unclaimed: fee makes the genesis claim'
  : `INFO castle.feefifofum.eth was claimed before (expiry ${expiry}): an expired lease is fi's to claim, a live one is its holder's to renew`);
for (const [id, min] of Object.entries(MIN_ETH)) {
  const bal = Number(formatEther(await pc.getBalance({ address: crew[id].address })));
  check(bal >= min, `${id} has gas for a demo window`, `${bal.toFixed(5)} ETH, want >= ${min}`);
}
console.log(failed ? `\n${failed} check(s) failed: do not start the crew` : '\nall checks passed: ./scripts/up.sh');
process.exit(failed ? 1 : 0);
