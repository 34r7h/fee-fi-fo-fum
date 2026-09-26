// The ERC-3668 gateway for quote.feefifofum.eth (docs/SPEC.md "The castle service"), on lib/ccip-sign.mjs.
//
//   GET  /ccip/{sender}/{data}.json      POST /ccip  {sender, data}
//
// `data` is the OffchainLookup callData, resolve(bytes name, bytes text(node, key)), and it is also the signed
// request: OffchainQuoteResolver passes the same bytes back as extraData. Keys:
//   quote:<tokenIn>:<tokenOut>:<amountIn>   harp's firm quote as one JSON line (tokens USDC or WETH, base units)
//   castle                                  the vault's address
// The answer is {data: abi.encode(bytes result, uint64 expires, bytes sig)}, result = abi.encode(string value), and
// sig is fi's over keccak256(abi.encodePacked(hex"1900", sender, expires, keccak256(data), keccak256(result))).
// Errors are {message} with a 4xx/5xx status; an unknown key is a 404. Only the deployed resolver is answered for.
import { getAddress } from 'viem';
import * as C from '../lib/ccip-sign.mjs';
import { addr } from './config.mjs';
import { emit } from './stream.mjs';
import { harpQuote } from './quote.mjs';
import { signResponse, fiSigner } from './fi.mjs';

export const QUOTE_NAME = process.env.CASTLE_QUOTE_NAME || 'quote.feefifofum.eth';
const EXPIRES_S = Number(process.env.CASTLE_QUOTE_TTL_S || 30);

const fail = (status, message) => Object.assign(new Error(message), { status });

// Answers one lookup (a GET path or a POST body): {data, value, quote, key, expires, digest}. Throws {status, message}.
export async function answer(input) {
  let r;
  try { r = C.decodeCcipRequest(input); } catch (e) { throw fail(400, `not a resolve(name, text(node, key)) request: ${e.message}`); }
  const resolver = addr('quoteResolver');
  if (!resolver) throw fail(503, 'no OffchainQuoteResolver in the deployments file yet');
  if (r.sender !== getAddress(resolver)) throw fail(400, `this gateway answers for ${resolver} only, not ${r.sender}`);
  if (r.name !== QUOTE_NAME) throw fail(404, `this gateway serves ${QUOTE_NAME}, not ${r.name}`);
  if (r.record.functionName !== 'text') throw fail(404, `no ${r.record.functionName} record: only text(node, key) is served`);
  const k = C.parseRecordKey(r.key);
  if (!k) throw fail(404, `unknown key ${JSON.stringify(r.key)}: use quote:<tokenIn>:<tokenOut>:<amountIn> (USDC or WETH, base units) or castle`);
  if (!fiSigner()) throw fail(503, 'fi key not loaded on this host (CASTLE_FI_KEY_PATH)');

  let value, q = null, expires = Math.floor(Date.now() / 1000) + EXPIRES_S;
  if (k.kind === 'castle') {
    const vault = addr('castle');
    if (!vault) throw fail(503, 'no CastleVault in the deployments file yet');
    value = getAddress(vault);
  } else {
    q = await harpQuote(k);
    if (!q.ok) throw fail(q.status || 422, q.error);
    value = q.text;
    expires = q.quote.validUntil;
  }
  const result = C.encodeRecordResult('text', value);
  const signed = await signResponse(r.sender, expires, r.request, result);
  if (q) {
    emit('quote.served', {
      id: q.quote.id, via: 'ccip', name: QUOTE_NAME, key: r.key, sender: r.sender, requester: null, requesterName: null,
      strategy: q.quote.strategyHash, tokenIn: q.symIn, tokenOut: q.symOut, amountIn: q.quote.amountIn, amountOut: q.quote.amountOut,
      priceQ96: q.quote.priceQ96, price: q.price, validUntil: q.quote.validUntil, signer: 'fi', signerAddr: q.quote.signer, digest: signed.digest,
    }, { src: 'gateway' });
  }
  return { data: signed.data, value, quote: q?.quote ?? null, key: r.key, expires, digest: signed.digest };
}

// The two ERC-3668 routes. Returns true when it handled the request.
export async function route(req, res, p, send, readBody, log = () => {}) {
  let input;
  if (req.method === 'GET' && /^\/ccip\/0x[0-9a-fA-F]{40}\/0x[0-9a-fA-F]*(\.json)?$/.test(p)) input = p;
  else if (req.method === 'POST' && p === '/ccip') input = await readBody(req);
  else return false;
  const t0 = Date.now();
  try {
    const out = await answer(input);
    send(res, 200, { data: out.data });
    log({ gateway: 'answered', key: out.key, quote: out.quote?.id ?? null, amountIn: out.quote?.amountIn, amountOut: out.quote?.amountOut, validUntil: out.expires, digest: out.digest, ms: Date.now() - t0 });
  } catch (e) {
    send(res, e.status || 500, { message: String(e?.shortMessage || e?.message || e) });
    log({ gateway: 'refused', status: e.status || 500, message: String(e?.message || e), ms: Date.now() - t0 });
  }
  return true;
}
