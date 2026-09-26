// fi's key, where it lives: the service host (docs/SPEC.md, "Its key lives only on the service host"). fi signs two
// things for every quote the castle serves, both through lib/ccip-sign.mjs (mister-anderson's signing module):
//   - the Quote, EIP-712 under PriceExtruction's domain; PriceExtruction recovers it at fill time and checks that it
//     is vault.fi();
//   - the gateway response, in the ENS offchain-resolver SignatureVerifier format; OffchainQuoteResolver checks it.
// The key is a file holding one 0x-prefixed private key, mode 0600, outside the repo (CASTLE_FI_KEY_PATH). Nothing
// here logs or returns it.
import fs from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import * as C from '../lib/ccip-sign.mjs';
import { env } from './config.mjs';

let fi = null;
function load() {
  if (fi) return fi;
  const p = (process.env.CASTLE_FI_KEY_PATH || '').replace(/^~(?=\/)/, process.env.HOME || '');
  if (!p || !fs.existsSync(p)) return null;
  if ((fs.statSync(p).mode & 0o077) !== 0) throw new Error(`${p} must be mode 0600`);
  const key = fs.readFileSync(p, 'utf8').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${p} does not hold one 0x-prefixed private key`);
  fi = { key, address: privateKeyToAccount(key).address };
  return fi;
}

export const fiSigner = () => { const s = load(); return s ? { address: s.address } : null; };
// For /health and the startup log: {fiKeyLoaded, fi (the derived address), fiKeyError}. Never throws, never the key.
export function fiStatus() {
  try { const s = fiSigner(); return { fiKeyLoaded: !!s, fi: s?.address ?? null }; }
  catch (e) { return { fiKeyLoaded: false, fi: null, fiKeyError: e.message }; }
}

export async function signQuote(priceExtruction, quote) {
  const s = load();
  if (!s) throw new Error('fi key not loaded (CASTLE_FI_KEY_PATH)');
  return C.signQuote(C.priceExtructionDomain(priceExtruction, env.chainId), quote, s.key);
}

// The ERC-3668 answer {data, digest}: abi.encode(result, expires, sig), sig by fi over the SignatureVerifier hash.
export async function signResponse(target, expires, request, result) {
  const s = load();
  if (!s) throw new Error('fi key not loaded (CASTLE_FI_KEY_PATH)');
  const sig = await C.signCcipResponse({ target, request, result, expires, privateKey: s.key });
  return { data: C.encodeCcipResponse({ result, expires, sig }), digest: C.makeSignatureHash(target, expires, request, result) };
}
