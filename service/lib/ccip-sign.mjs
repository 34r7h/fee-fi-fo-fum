// quote.feefifofum.eth: the signatures behind the harp (docs/SPEC.md, "OffchainQuoteResolver" and "The quote").
//
// Two signatures, both by fi:
//   1. the Quote (EIP-712, domain "feefifofum PriceExtruction"): PriceExtruction checks it on-chain at fill time;
//   2. the gateway response (ensdomains/offchain-resolver SignatureVerifier): OffchainQuoteResolver.resolveWithProof
//      checks it when a CCIP-Read client hands the gateway's answer back.
// Plus the plumbing a gateway needs: decode the {sender}/{data} request, parse the record key, ABI-encode the text
// result, build the JSON record and the ready-to-use takerTraitsAndData (TakerTraitsLib.build, byte for byte).
//
//   import { signQuote, buildQuoteRecord, decodeCcipRequest, signCcipResponse, encodeCcipResponse } from './ccip-sign.mjs';
//
// Every function is pure except the signers, which only sign locally with the key they are given.
import {
  concat, decodeAbiParameters, decodeFunctionData, encodeAbiParameters, encodeFunctionData, encodePacked, getAddress,
  hashTypedData, isAddress, isHex, keccak256, namehash, numberToHex, pad, parseAbi, recoverAddress, recoverTypedDataAddress,
  size, toHex,
} from 'viem';
import { privateKeyToAccount, sign } from 'viem/accounts';

// ---- the Quote (EIP-712) ------------------------------------------------------------------------------------

export const QUOTE_TYPES = {
  Quote: [
    { name: 'strategyHash', type: 'bytes32' },
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'priceQ96', type: 'uint256' },
    { name: 'maxAmountIn', type: 'uint256' },
    { name: 'validUntil', type: 'uint64' },
  ],
};

/** The ABI tuple of PriceExtruction's Quote struct, for abi.encode(Quote, bytes sig). */
export const QUOTE_TUPLE = { type: 'tuple', components: QUOTE_TYPES.Quote };

/** PriceExtruction's EIP-712 domain. */
export function priceExtructionDomain(verifyingContract, chainId = 11155111) {
  return { name: 'feefifofum PriceExtruction', version: '1', chainId: Number(chainId), verifyingContract: getAddress(verifyingContract) };
}

function normQuote(q) {
  return {
    strategyHash: q.strategyHash,
    tokenIn: getAddress(q.tokenIn),
    tokenOut: getAddress(q.tokenOut),
    priceQ96: BigInt(q.priceQ96),
    maxAmountIn: BigInt(q.maxAmountIn),
    validUntil: BigInt(q.validUntil),
  };
}

/** The EIP-712 digest PriceExtruction recovers the signer from. */
export function quoteDigest(domain, quote) {
  return hashTypedData({ domain, types: QUOTE_TYPES, primaryType: 'Quote', message: normQuote(quote) });
}

/** fi's EIP-712 signature over the Quote. */
export async function signQuote(domain, quote, privateKey) {
  return privateKeyToAccount(privateKey).signTypedData({ domain, types: QUOTE_TYPES, primaryType: 'Quote', message: normQuote(quote) });
}

/** Recover the Quote's signer; `valid` is true when it equals `expectedSigner` (if given) and validUntil has not passed. */
export async function verifyQuote(domain, quote, sig, { expectedSigner, now = Math.floor(Date.now() / 1000) } = {}) {
  const signer = await recoverTypedDataAddress({ domain, types: QUOTE_TYPES, primaryType: 'Quote', message: normQuote(quote), signature: sig });
  const fresh = BigInt(quote.validUntil) >= BigInt(now);
  const bySigner = expectedSigner ? signer === getAddress(expectedSigner) : true;
  return { valid: fresh && bySigner, signer, fresh };
}

/** PriceExtruction's takerData: abi.encode(Quote, bytes sig). */
export function encodeQuoteTakerData(quote, sig) {
  return encodeAbiParameters([QUOTE_TUPLE, { type: 'bytes' }], [normQuote(quote), sig]);
}

// ---- takerTraitsAndData (swap-vm 1.0.2 TakerTraitsLib.build) --------------------------------------------------

const IS_EXACT_IN = 0x0001;
const USE_TRANSFER_FROM_AND_AQUA_PUSH = 0x0040;

/**
 * The router.swap takerTraitsAndData for a harp quote: exact-in, threshold = amountOut, useTransferFromAndAquaPush,
 * instructionsArgs = abi.encode(Quote, sig), recipient = msg.sender. Byte-identical to TakerTraitsLib.build with those
 * Args (slice indexes as uint160, flags as uint16, then threshold, instructionsArgs and an empty signature).
 */
export function buildTakerTraitsAndData(quote, sig, amountOut) {
  const threshold = pad(numberToHex(BigInt(amountOut)), { size: 32 });
  const args = encodeQuoteTakerData(quote, sig);
  const i0 = 32n; // threshold
  const i1 = i0; // to (none: msg.sender)
  const i2 = i1; // deadline (none)
  const i3 = i2, i4 = i2, i5 = i2, i6 = i2, i7 = i2, i8 = i2; // no hooks or callbacks
  const i9 = i8 + BigInt(size(args));
  if (i9 > 0xffffn) throw new Error('takerData too long for uint16 slice indexes');
  const idx = [i0, i1, i2, i3, i4, i5, i6, i7, i8, i9].reduce((acc, v, k) => acc | (v << BigInt(16 * k)), 0n);
  return concat([pad(numberToHex(idx), { size: 20 }), pad(numberToHex(IS_EXACT_IN | USE_TRANSFER_FROM_AND_AQUA_PUSH), { size: 2 }), threshold, args]);
}

// ---- the gateway response (SignatureVerifier) -----------------------------------------------------------------

const RESOLVER_ABI = parseAbi([
  'function resolve(bytes name, bytes data) view returns (bytes)',
  'function resolveWithProof(bytes response, bytes extraData) view returns (bytes)',
]);
const RECORD_ABI = parseAbi([
  'function text(bytes32 node, string key) view returns (string)',
  'function addr(bytes32 node) view returns (address)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes)',
  'function contenthash(bytes32 node) view returns (bytes)',
  'function data(bytes32 node, string key) view returns (bytes)',
]);

/** keccak256(abi.encodePacked(hex"1900", target, expires, keccak256(request), keccak256(result))) */
export function makeSignatureHash(target, expires, request, result) {
  return keccak256(encodePacked(['bytes2', 'address', 'uint64', 'bytes32', 'bytes32'], ['0x1900', getAddress(target), BigInt(expires), keccak256(request), keccak256(result)]));
}

/** fi's raw-digest signature over the gateway answer. `target` is the resolver (the OffchainLookup sender). */
export async function signCcipResponse({ target, request, result, expires, privateKey }) {
  return sign({ hash: makeSignatureHash(target, expires, request, result), privateKey, to: 'hex' });
}

/** abi.encode(bytes result, uint64 expires, bytes sig): the gateway's `data` field. */
export function encodeCcipResponse({ result, expires, sig }) {
  return encodeAbiParameters([{ type: 'bytes' }, { type: 'uint64' }, { type: 'bytes' }], [result, BigInt(expires), sig]);
}

export function decodeCcipResponse(data) {
  const [result, expires, sig] = decodeAbiParameters([{ type: 'bytes' }, { type: 'uint64' }, { type: 'bytes' }], data);
  return { result, expires, sig };
}

/**
 * Recover the gateway response's signer, as resolveWithProof does. Pass `response` (the encoded data) or
 * `result`/`expires`/`sig`. `valid` is true when the signer is in `signers` (if given) and it has not expired.
 */
export async function verifyCcipResponse({ target, request, response, result, expires, sig, signers, now = Math.floor(Date.now() / 1000) }) {
  if (response) ({ result, expires, sig } = decodeCcipResponse(response));
  const signer = await recoverAddress({ hash: makeSignatureHash(target, expires, request, result), signature: sig });
  const fresh = BigInt(expires) >= BigInt(now);
  const trusted = signers ? signers.map((a) => getAddress(a)).includes(signer) : true;
  return { valid: fresh && trusted, signer, fresh, result, expires: BigInt(expires) };
}

// ---- the request ------------------------------------------------------------------------------------------------

/** DNS wire format (RFC 1035) to dotted name. */
export function dnsDecodeName(dns) {
  const b = Buffer.from(dns.slice(2), 'hex');
  const labels = [];
  for (let i = 0; i < b.length;) {
    const n = b[i];
    if (n === 0) break;
    labels.push(b.subarray(i + 1, i + 1 + n).toString('utf8'));
    i += 1 + n;
  }
  return labels.join('.');
}

/** Dotted name to DNS wire format. */
export function dnsEncodeName(name) {
  const parts = name.split('.').filter(Boolean).map((l) => {
    const b = Buffer.from(l, 'utf8');
    if (b.length > 255) throw new Error(`label too long: ${l}`);
    return Buffer.concat([Buffer.from([b.length]), b]);
  });
  return toHex(Buffer.concat([...parts, Buffer.from([0])]));
}

/**
 * Decode a CCIP-Read request. Accepts:
 *   - a GET path or URL ending in /{sender}/{data}.json (or /{sender}/{data});
 *   - a POST body { sender, data } (object or JSON string);
 *   - { sender, data } directly.
 * `request` is the calldata the resolver put in OffchainLookup (resolve(name, data)); it is what the response is
 * signed over. `record` is the decoded inner call (text/addr/contenthash/data); `key` is the text/data key if any.
 */
export function decodeCcipRequest(input) {
  let sender, data;
  if (typeof input === 'string' && !input.trim().startsWith('{')) {
    const pathname = input.includes('://') ? new URL(input).pathname : input.split('?')[0];
    const m = pathname.match(/\/(0x[0-9a-fA-F]{40})\/(0x[0-9a-fA-F]*)(?:\.json)?\/?$/);
    if (!m) throw new Error(`not a CCIP-Read path: ${pathname}`);
    [, sender, data] = m;
  } else {
    const body = typeof input === 'string' ? JSON.parse(input) : input;
    ({ sender, data } = body);
  }
  if (!isAddress(sender)) throw new Error('bad sender');
  if (!isHex(data)) throw new Error('bad data');
  const outer = decodeFunctionData({ abi: RESOLVER_ABI, data });
  if (outer.functionName !== 'resolve') throw new Error(`unexpected call ${outer.functionName}`);
  const [dnsName, inner] = outer.args;
  const name = dnsDecodeName(dnsName);
  const call = decodeFunctionData({ abi: RECORD_ABI, data: inner });
  const key = call.functionName === 'text' || call.functionName === 'data' ? call.args[1] : null;
  return {
    sender: getAddress(sender), request: data, name, dnsName, node: namehash(name),
    record: { functionName: call.functionName, args: call.args, data: inner }, key,
  };
}

/** The ABI-encoded return of the record call, which is the `result` the gateway signs. */
export function encodeRecordResult(functionName, value) {
  if (functionName === 'text') return encodeAbiParameters([{ type: 'string' }], [value]);
  if (functionName === 'addr') return encodeAbiParameters([{ type: 'address' }], [value]);
  return encodeAbiParameters([{ type: 'bytes' }], [value]); // contenthash, data, addr(node, coinType)
}

/** Call data for text(node, key), handy for tests and clients. */
export function encodeTextCall(name, key) {
  return encodeFunctionData({ abi: RECORD_ABI, functionName: 'text', args: [namehash(name), key] });
}

// ---- the record ---------------------------------------------------------------------------------------------------

/** "quote:<tokenIn>:<tokenOut>:<amountIn>" (tokens USDC | WETH, amountIn in raw units), or "castle"; null otherwise. */
export function parseRecordKey(key) {
  if (key === 'castle') return { kind: 'castle' };
  const m = /^quote:(USDC|WETH):(USDC|WETH):([0-9]{1,78})$/.exec(key ?? '');
  if (!m || m[1] === m[2]) return null;
  const amountIn = BigInt(m[3]);
  if (amountIn === 0n) return null;
  return { kind: 'quote', tokenIn: m[1], tokenOut: m[2], amountIn };
}

/**
 * The record's value: one JSON line in docs/SPEC.md's field order. `quote` is the signed Quote, `order` the harp
 * SwapVM order { maker, traits, data }. takerTraitsAndData is built here from the quote, sig and amountOut.
 */
export function buildQuoteRecord({ id, chainId, router, order, quote, amountIn, amountOut, signer, quoteSig }) {
  const q = normQuote(quote);
  return JSON.stringify({
    v: 1,
    id,
    chainId: Number(chainId),
    router: getAddress(router),
    order: { maker: getAddress(order.maker), traits: typeof order.traits === 'bigint' ? toHex(order.traits, { size: 32 }) : order.traits, data: order.data },
    strategyHash: q.strategyHash,
    tokenIn: q.tokenIn,
    tokenOut: q.tokenOut,
    amountIn: BigInt(amountIn).toString(),
    amountOut: BigInt(amountOut).toString(),
    priceQ96: q.priceQ96.toString(),
    maxAmountIn: q.maxAmountIn.toString(),
    validUntil: Number(q.validUntil),
    signer: getAddress(signer),
    quoteSig,
    takerTraitsAndData: buildTakerTraitsAndData(q, quoteSig, amountOut),
  });
}

/** Parse a record back into the Quote PriceExtruction checks, plus the rest. */
export function parseQuoteRecord(text) {
  const r = JSON.parse(text);
  const quote = { strategyHash: r.strategyHash, tokenIn: r.tokenIn, tokenOut: r.tokenOut, priceQ96: BigInt(r.priceQ96), maxAmountIn: BigInt(r.maxAmountIn), validUntil: BigInt(r.validUntil) };
  return { ...r, quote, amountIn: BigInt(r.amountIn), amountOut: BigInt(r.amountOut) };
}

/** amountOut = amountIn * priceQ96 >> 96 (PriceExtruction, exact-in). */
export function quoteAmountOut(amountIn, priceQ96) {
  return (BigInt(amountIn) * BigInt(priceQ96)) >> 96n;
}
