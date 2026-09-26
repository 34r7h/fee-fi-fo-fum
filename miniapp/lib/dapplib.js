// FFFLIB: the dapp's chain module (docs/SPEC.md, "The miniapps"). One classic script with no imports, so the page can
// inline it: it runs as the body of the site's strict async wrapper. It is dependency-free: a keccak-256, an ABI
// coder, the ENS UniversalResolverV2 CCIP-Read flow (with the local batch gateway, as viem runs it), the harp and
// hen tx builders from agents/scripts/jack.mjs, and errors in plain words. viem is its test oracle
// (miniapp/lib/test/dapplib.test.mjs), not a dependency.
//
//   var lib = FFFLIB.create({ provider | request, read, config })
//     provider   an EIP-1193 provider (window.ethereum), or request(method, params) doing the same; it sends the txs
//     read       request(method, params) for reads; default the provider. FFFLIB.rpc(url) makes one over JSON-RPC,
//                so the castle reads work before a wallet connects
//     config     the addresses from contracts/deployments/sepolia.json: FFFLIB.configFrom(thatJson) builds it
//
// Amounts are bigints in base units; addresses are 0x strings; every call takes tokens as 'USDC' or 'WETH'.
var FFFLIB = (function () {
  'use strict';

  // ---- bytes and hex -----------------------------------------------------------------------------------------
  var HEX = '0123456789abcdef';
  function strip(h) { return h.slice(0, 2) === '0x' ? h.slice(2) : h; }
  function toBytes(h) {
    h = strip(h);
    if (h.length % 2) h = '0' + h;
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }
  function toHex(b) {
    var s = '0x';
    for (var i = 0; i < b.length; i++) s += HEX[b[i] >> 4] + HEX[b[i] & 15];
    return s;
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function hexToBig(h) { h = strip(h); return h ? BigInt('0x' + h) : 0n; }
  function pad64(h) { return h.length >= 64 ? h : '0'.repeat(64 - h.length) + h; }
  function lower(a) { return String(a).toLowerCase(); }
  function same(a, b) { return !!a && !!b && lower(a) === lower(b); }

  // ---- keccak-256 (Keccak-f[1600] over 32-bit halves; the padding is keccak's 0x01, not SHA-3's 0x06) -----------
  var PI = [], ROT = [], IOTA_LO = [], IOTA_HI = [];
  (function () {
    var R = 1n;
    for (var round = 0, x = 1, y = 0; round < 24; round++) {
      var nx = y; y = (2 * x + 3 * y) % 5; x = nx;
      PI.push(2 * (5 * y + x));
      ROT.push((((round + 1) * (round + 2)) / 2) % 64);
      var t = 0n;
      for (var j = 0; j < 7; j++) {
        R = ((R << 1n) ^ ((R >> 7n) * 0x71n)) % 256n;
        if (R & 2n) t ^= 1n << ((1n << BigInt(j)) - 1n);
      }
      IOTA_LO.push(Number(t & 0xffffffffn));
      IOTA_HI.push(Number(t >> 32n));
    }
  })();
  // A lane is (lo, hi): lo is s[2i], hi is s[2i + 1] (little-endian words).
  function rotLo(lo, hi, n) { return n > 32 ? (hi << (n - 32)) | (lo >>> (64 - n)) : (lo << n) | (hi >>> (32 - n)); }
  function rotHi(lo, hi, n) { return n > 32 ? (lo << (n - 32)) | (hi >>> (64 - n)) : (hi << n) | (lo >>> (32 - n)); }
  function permute(s) {
    var B = new Uint32Array(10);
    for (var round = 0; round < 24; round++) {
      var x, y;
      for (x = 0; x < 10; x++) B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
      for (x = 0; x < 10; x += 2) {
        var i1 = (x + 8) % 10, i0 = (x + 2) % 10;
        var tl = rotLo(B[i0], B[i0 + 1], 1) ^ B[i1], th = rotHi(B[i0], B[i0 + 1], 1) ^ B[i1 + 1];
        for (y = 0; y < 50; y += 10) { s[x + y] ^= tl; s[x + y + 1] ^= th; }
      }
      var cl = s[2], ch = s[3];
      for (var t = 0; t < 24; t++) {
        var n = ROT[t], p = PI[t], nl = rotLo(cl, ch, n), nh = rotHi(cl, ch, n);
        cl = s[p]; ch = s[p + 1]; s[p] = nl; s[p + 1] = nh;
      }
      for (y = 0; y < 50; y += 10) {
        for (x = 0; x < 10; x++) B[x] = s[y + x];
        for (x = 0; x < 10; x++) s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
      }
      s[0] ^= IOTA_LO[round]; s[1] ^= IOTA_HI[round];
    }
  }
  // keccak256(Uint8Array | 0x hex) -> 0x hex
  function keccak256(data) {
    var bytes = typeof data === 'string' ? toBytes(data) : data;
    var st = new Uint8Array(200), s = new Uint32Array(st.buffer), rate = 136, pos = 0;
    for (var i = 0; i < bytes.length; i++) {
      st[pos++] ^= bytes[i];
      if (pos === rate) { permute(s); pos = 0; }
    }
    st[pos] ^= 0x01; st[rate - 1] ^= 0x80;
    permute(s);
    return toHex(st.subarray(0, 32));
  }
  var idCache = {};
  function selector(sig) { return idCache[sig] || (idCache[sig] = keccak256(utf8(sig)).slice(0, 10)); }

  // ---- the ABI coder: types as in signatures ('address', 'uint256', 'bytes', '(address,uint256)[]', ...) -----------
  function splitTop(s) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }
  var typeCache = {};
  function parseType(t) {
    if (typeCache[t]) return typeCache[t];
    var T;
    if (t.slice(-2) === '[]') T = { arr: parseType(t.slice(0, -2)) };
    else if (t[0] === '(') T = { tup: splitTop(t.slice(1, -1)).map(parseType) };
    else T = { base: t };
    T.dyn = T.arr ? true : T.tup ? T.tup.some(function (c) { return c.dyn; }) : (t === 'bytes' || t === 'string');
    T.words = T.dyn ? 1 : T.tup ? T.tup.reduce(function (a, c) { return a + c.words; }, 0) : 1;
    return (typeCache[t] = T);
  }
  function word(v) {
    if (typeof v === 'boolean') return pad64(v ? '1' : '0');
    var n = BigInt(v);
    return pad64(BigInt.asUintN(256, n).toString(16));
  }
  function encBytes(b) {
    var h = strip(typeof b === 'string' ? b : toHex(b));
    var n = h.length / 2;
    return word(n) + h + '0'.repeat((64 - (h.length % 64)) % 64);
  }
  function encodeOne(T, v) {
    if (T.arr) return word(v.length) + encodeList(v.map(function () { return T.arr; }), v);
    if (T.tup) return encodeList(T.tup, v);
    var b = T.base;
    if (b === 'address') return pad64(strip(lower(v)));
    if (b === 'bool') return word(!!v);
    if (b === 'bytes') return encBytes(v);
    if (b === 'string') return encBytes(utf8(v));
    if (b.slice(0, 5) === 'bytes') { var h = strip(v); return h + '0'.repeat(64 - h.length); }
    return word(v);   // uintN, intN (two's complement)
  }
  function encodeList(types, values) {
    var head = '', tail = '', size = types.reduce(function (a, T) { return a + T.words * 32; }, 0);
    for (var i = 0; i < types.length; i++) {
      var e = encodeOne(types[i], values[i]);
      if (types[i].dyn) { head += word(size + tail.length / 2); tail += e; } else head += e;
    }
    return head + tail;
  }
  // encode(['address', 'uint256'], [a, n]) -> 0x hex
  function encode(types, values) { return '0x' + encodeList(types.map(parseType), values); }
  function decodeOne(T, h, at) {
    if (T.arr) {
      var n = Number(hexToBig(h.substr(at * 2, 64)));
      return decodeList(Array(n).fill(T.arr), h, at + 32);
    }
    if (T.tup) return decodeList(T.tup, h, at);
    var w = h.substr(at * 2, 64), b = T.base;
    if (b === 'address') return '0x' + w.slice(24);
    if (b === 'bool') return w !== pad64('0');
    if (b === 'bytes' || b === 'string') {
      var len = Number(hexToBig(w));
      var d = h.substr((at + 32) * 2, len * 2);
      return b === 'bytes' ? '0x' + d : new TextDecoder().decode(toBytes(d));
    }
    if (b.slice(0, 5) === 'bytes') return '0x' + w.slice(0, Number(b.slice(5)) * 2);
    var v = hexToBig(w);
    return b[0] === 'i' ? BigInt.asIntN(Number(b.slice(3)) || 256, v) : v;
  }
  function decodeList(types, h, base) {
    var out = [], at = base;
    for (var i = 0; i < types.length; i++) {
      var T = types[i];
      if (T.dyn) out.push(decodeOne(T, h, base + Number(hexToBig(h.substr(at * 2, 64)))));
      else out.push(decodeOne(T, h, at));
      at += T.words * 32;
    }
    return out;
  }
  // decode(['uint256', 'bytes'], 0x hex) -> [n, 0x...]
  function decode(types, data) { return decodeList(types.map(parseType), strip(data), 0); }
  function params(sig) { return splitTop(sig.slice(sig.indexOf('(') + 1, -1)); }
  // call data for 'name(types)' and args
  function calldata(sig, args) { return selector(sig) + strip(encode(params(sig), args || [])); }

  // ---- the contracts' surfaces (signatures only; addresses come from config) ------------------------------------
  var ORDER = '(address,uint256,bytes)';
  var QUOTE = '(bytes32,address,address,uint256,uint256,uint64)';
  var KEY = '(address,address,uint24,int24,address)';
  var F = {
    balanceOf: 'balanceOf(address)', allowance: 'allowance(address,address)', approve: 'approve(address,uint256)',
    deposit: 'deposit()', fi: 'fi()', leverageOf: 'leverageOf(address)', committed: 'committed(address)',
    limit: 'limit(address)', headroom: 'headroom(address)', strategyIn: 'strategyIn(uint8)', capOf: 'capOf(uint8)',
    rawBalances: 'rawBalances(address,address,bytes32,address)',
    quote: 'quote(' + ORDER + ',address,address,uint256,bytes)', swap: 'swap(' + ORDER + ',address,address,uint256,bytes)',
    quoteDigest: 'quoteDigest(' + QUOTE + ')',
    quoteHen: 'quoteExactInputSingle((' + KEY + ',bool,uint128,bytes))',
    swapHen: 'swap(' + KEY + ',(bool,int256,uint160),(bool,bool),bytes)',
    resolve: 'resolveWithGateways(bytes,bytes,string[])', reverse: 'reverseWithGateways(bytes,uint256,string[])', text: 'text(bytes32,string)',
    query: 'query((address,string[],bytes)[])',
  };
  // Errors the Castle's contracts, the router, the tokens and the resolver path can raise.
  var ERRORS = [
    'Error(string)', 'Panic(uint256)', 'OffchainLookup(address,string[],bytes,bytes4,bytes)',
    'QuoteExpired(uint64)', 'BadQuoteSigner(address)', 'MissingQuote(uint256)', 'QuoteMismatch()', 'QuoteTooLarge(uint256,uint256)',
    'QuoteTooLong(uint64)', 'ExactOutNotSupported()', 'OverAllocated(address,uint256,uint256)', 'OverCap(uint8,address,uint256,uint256)',
    'NotLive(bytes32)', 'NotHoardToken(address)', 'TooLittleOut(uint256,uint256)', 'UnexpectedAmountIn(uint256,uint256)', 'NoHen()',
    'NotCastlePool()', 'LiquidityNotAllowed()', 'SignatureExpired()', 'InvalidSigner(address)', 'SafeERC20FailedOperation(address)',
    'ERC20InsufficientBalance(address,uint256,uint256)', 'ERC20InsufficientAllowance(address,uint256,uint256)',
    'ResolverNotFound(bytes)', 'ResolverNotContract(bytes,address)', 'UnsupportedResolverProfile(bytes4)', 'ResolverError(bytes)',
    'HttpError(uint16,string)', 'InvalidBatchGatewayResponse()',
  ];
  var BY_SELECTOR = null;
  function errorTable() {
    if (!BY_SELECTOR) { BY_SELECTOR = {}; ERRORS.forEach(function (sig) { BY_SELECTOR[selector(sig)] = sig; }); }
    return BY_SELECTOR;
  }
  var MIN_SQRT = 4295128739n + 1n;
  var MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;
  var SEPOLIA = '0xaa36a7';
  var LOCAL_BATCH = 'x-batch-gateway:true';

  // ---- errors in plain words -------------------------------------------------------------------------------------
  function fail(message, extra) { var e = new Error(message); e.fff = true; if (extra) for (var k in extra) e[k] = extra[k]; return e; }
  // The first revert-data hex in an error, wherever the wallet or the RPC put it.
  function revertData(err, depth) {
    if (err == null || (depth || 0) > 6) return null;
    if (typeof err === 'string') return /^0x[0-9a-fA-F]*$/.test(err) && err.length >= 10 ? err : null;
    if (typeof err !== 'object') return null;
    var keys = ['data', 'error', 'cause', 'info', 'originalError', 'value'];
    for (var i = 0; i < keys.length; i++) {
      var found = revertData(err[keys[i]], (depth || 0) + 1);
      if (found) return found;
    }
    if (typeof err.body === 'string') { try { return revertData(JSON.parse(err.body), (depth || 0) + 1); } catch (e) { return null; } }
    return null;
  }
  function describeRevert(data) {
    var sig = errorTable()[data.slice(0, 10).toLowerCase()];
    if (!sig) return 'reverted with ' + data.slice(0, 10);
    var name = sig.slice(0, sig.indexOf('(')), args = decode(params(sig), '0x' + data.slice(10));
    if (name === 'Error') {
      var m = String(args[0]);
      if (/exceeds balance|insufficient balance/i.test(m)) return 'insufficient balance';
      if (/exceeds allowance|insufficient allowance/i.test(m)) return 'insufficient allowance';
      return m;
    }
    if (name === 'ERC20InsufficientBalance') return 'insufficient balance';
    if (name === 'ERC20InsufficientAllowance') return 'insufficient allowance';
    return name + '(' + args.map(function (a) { return Array.isArray(a) ? '[' + a.join(',') + ']' : String(a); }).join(',') + ')';
  }
  // decodeError(err) -> a plain name: 'QuoteExpired(1790426242)', 'OverAllocated(...)', 'insufficient allowance',
  // 'user rejected', 'wrong chain: ...', 'not enough USDC: ...'; null when err carries no revert data, no wallet code
  // and none of this module's own words (a dropped connection, say), so the caller shows err.message instead.
  function decodeError(err) {
    if (!err) return null;
    if (err.fff) return err.message;
    if (err.code === 4001 || /user (rejected|denied)|rejected the request|denied transaction/i.test(err.message || '')) return 'user rejected';
    if (err.code === 4902) return 'Sepolia is not added to the wallet';
    var data = revertData(err);
    if (data) return describeRevert(data);
    var msg = String(err.shortMessage || err.message || err);
    if (/insufficient funds/i.test(msg)) return 'not enough ETH for gas';
    if (/execution reverted/i.test(msg)) return 'reverted without a reason (a balance or an allowance is short)';
    return null;
  }
  // The error in plain words when decodeError can name it, else the error as it came.
  function plainly(err) { var d = decodeError(err); return d ? fail(d, { cause: err }) : err; }

  // ---- ENS names ---------------------------------------------------------------------------------------------------
  function dnsEncode(name) {
    var out = [];
    name.split('.').forEach(function (label) { var b = utf8(label); out.push(b.length); for (var i = 0; i < b.length; i++) out.push(b[i]); });
    out.push(0);
    return toHex(new Uint8Array(out));
  }
  function namehash(name) {
    var node = '0x' + '0'.repeat(64);
    var labels = name.split('.');
    for (var i = labels.length - 1; i >= 0; i--) node = keccak256(node + strip(keccak256(utf8(labels[i]))));
    return node;
  }

  // ---- JSON-RPC over fetch, for reads before a wallet connects ---------------------------------------------------
  function rpc(url) {
    var id = 0;
    return function (method, params) {
      return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: method, params: params || [] }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.error) { var e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
          return j.result;
        });
    };
  }

  // sepolia.json -> the config the lib reads (addresses only)
  function configFrom(d) {
    var c = d.contracts || {}, x = d.external || {};
    var a = function (v) { return v && (v.address || v); };
    return {
      chainId: d.chainId || 11155111, castle: a(c.castleVault), priceExtruction: a(c.priceExtruction), hook: a(c.castleJITHook),
      resolver: a(c.offchainQuoteResolver), poolId: c.poolId, pool: c.pool && { currency0: c.pool.currency0, currency1: c.pool.currency1, fee: c.pool.fee, tickSpacing: c.pool.tickSpacing, hooks: c.pool.hooks },
      aqua: x.aqua, router: x.aquaSwapVMRouter, poolManager: x.poolManager, poolSwapTest: x.poolSwapTest, v4Quoter: x.v4Quoter,
      universalResolver: x.universalResolverV2, usdc: x.usdc, weth: x.weth, quoteName: 'quote.feefifofum.eth',
    };
  }

  function create(opts) {
    var cfg = opts.config;
    var send = opts.provider ? function (m, p) { return opts.provider.request({ method: m, params: p }); } : opts.request;
    var read = opts.read || send;
    if (!send && !read) throw fail('FFFLIB.create needs a provider, a request or a read');
    var TOKENS = { USDC: cfg.usdc, WETH: cfg.weth };
    var chainHex = '0x' + Number(cfg.chainId || 11155111).toString(16);
    var MIN_LEFT_S = opts.minLeftS == null ? 20 : opts.minLeftS;
    var QNAME = cfg.quoteName || 'quote.feefifofum.eth';

    function token(sym) { var t = TOKENS[sym]; if (!t) throw fail('unknown token ' + sym + ': use USDC or WETH'); return t; }
    function call(to, data, from, block) {
      var tx = { to: to, data: data };
      if (from) tx.from = from;
      return read('eth_call', [tx, block || 'latest']);
    }
    function view(to, sig, args, outTypes) { return call(to, calldata(sig, args)).then(function (r) { return decode(outTypes, r); }); }
    function uint(to, sig, args) { return view(to, sig, args, ['uint256']).then(function (r) { return r[0]; }); }
    function pair(fn) { return Promise.all([fn('USDC'), fn('WETH')]).then(function (v) { return { USDC: v[0], WETH: v[1] }; }); }

    // ---- wallet ----
    function connect() {
      if (!send) return Promise.reject(fail('no wallet: connect an injected wallet'));
      return send('eth_requestAccounts', []).then(function (a) { if (!a || !a.length) throw fail('the wallet shared no account'); return a[0]; });
    }
    function ensureSepolia() {
      if (!send) return Promise.reject(fail('no wallet: connect an injected wallet'));
      return send('eth_chainId', []).then(function (id) {
        if (lower(id) === chainHex) return id;
        return send('wallet_switchEthereumChain', [{ chainId: chainHex }]).catch(function (e) {
          if (e && e.code === 4902) {
            return send('wallet_addEthereumChain', [{ chainId: chainHex, chainName: 'Sepolia', nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: cfg.rpcs || [], blockExplorerUrls: ['https://sepolia.etherscan.io'] }]);
          }
          throw e;
        }).then(function () { return send('eth_chainId', []); }).then(function (now) {
          if (lower(now) !== chainHex) throw fail('wrong chain: the wallet is on ' + Number(now) + ', switch it to Sepolia (11155111)');
          return now;
        }, function (e) {
          if (e && e.code === 4001) throw fail('user rejected');
          throw fail('wrong chain: the wallet is on ' + Number(id) + ', switch it to Sepolia (11155111)');
        });
      });
    }
    function onSepolia() {
      return send('eth_chainId', []).then(function (id) {
        if (lower(id) !== chainHex) throw fail('wrong chain: the wallet is on ' + Number(id) + ', switch it to Sepolia (11155111)');
      });
    }
    // Send one {to, data, value} from `from` and wait for its receipt: {hash, status, block, gasUsed}.
    function sendCall(from, c, waitMs) {
      var tx = { from: from, to: c.to, data: c.data };
      if (c.value) tx.value = typeof c.value === 'string' ? c.value : '0x' + BigInt(c.value).toString(16);
      return onSepolia().then(function () { return send('eth_sendTransaction', [tx]); }).then(function (hash) {
        var until = Date.now() + (waitMs || 180000);
        function poll() {
          return read('eth_getTransactionReceipt', [hash]).then(function (r) {
            if (r) return { hash: hash, status: r.status === '0x1' ? 'success' : 'reverted', block: Number(r.blockNumber), gasUsed: hexToBig(r.gasUsed) };
            if (Date.now() > until) throw fail('no receipt for ' + hash + ' yet: see it on Etherscan');
            return new Promise(function (ok) { setTimeout(ok, 1500); }).then(poll);
          });
        }
        return poll();
      }, function (e) { throw plainly(e); });
    }
    // eth_call the tx first: a revert comes back in plain words before the wallet asks anyone to sign.
    function simulate(from, c) {
      var tx = { from: from, to: c.to, data: c.data };
      if (c.value) tx.value = '0x' + BigInt(c.value).toString(16);
      return read('eth_call', [tx, 'latest']).catch(function (e) { throw plainly(e); });
    }
    function estimate(from, c) {
      var tx = { from: from, to: c.to, data: c.data };
      if (c.value) tx.value = '0x' + BigInt(c.value).toString(16);
      return read('eth_estimateGas', [tx]).then(hexToBig, function (e) { throw plainly(e); });
    }

    // ---- reads ----
    function balances(addr) {
      return Promise.all([read('eth_getBalance', [addr, 'latest']), uint(cfg.usdc, F.balanceOf, [addr]), uint(cfg.weth, F.balanceOf, [addr])])
        .then(function (v) { return { ETH: hexToBig(v[0]), USDC: v[1], WETH: v[2] }; });
    }
    function allowance(sym, owner, spender) { return uint(token(sym), F.allowance, [owner, spender]); }
    // The castle: the hoard, fum's leverage (bps), committed, limit and headroom per token, and the live strategies.
    function vault() {
      var v = cfg.castle, names = ['harp', 'hen', 'greedy'];
      return Promise.all([
        pair(function (s) { return uint(token(s), F.balanceOf, [v]); }),
        pair(function (s) { return uint(v, F.leverageOf, [token(s)]); }),
        pair(function (s) { return uint(v, F.committed, [token(s)]); }),
        pair(function (s) { return uint(v, F.limit, [token(s)]); }),
        pair(function (s) { return uint(v, F.headroom, [token(s)]); }),
        Promise.all([0, 1, 2].map(function (slot) { return view(v, F.strategyIn, [slot], ['bytes32']).then(function (r) { return r[0]; }); })),
        view(v, F.fi, [], ['address']).then(function (r) { return r[0]; }),
      ]).then(function (r) {
        var live = r[5].map(function (hash, slot) { return { slot: slot, name: names[slot], hash: hash }; }).filter(function (s) { return hexToBig(s.hash) !== 0n; });
        return Promise.all(live.map(function (s) {
          return pair(function (sym) { return view(cfg.aqua, F.rawBalances, [v, cfg.router, s.hash, token(sym)], ['uint248', 'uint8']).then(function (b) { return b[0]; }); })
            .then(function (alloc) { s.alloc = alloc; return s; });
        })).then(function (strategies) {
          return { hoard: r[0], leverage: r[1], committed: r[2], limit: r[3], headroom: r[4], strategies: strategies, fi: r[6] };
        });
      });
    }

    // ---- ENS: getEnsText through UniversalResolverV2, with CCIP-Read and the local batch gateway ----
    // One ERC-3668 gateway request: GET when the URL has {data}, POST otherwise.
    function gatewayFetch(sender, urls, data) {
      var i = 0;
      function next(lastErr) {
        if (i >= urls.length) return Promise.reject(lastErr || fail('no gateway answered'));
        var url = urls[i++], get = url.indexOf('{data}') >= 0;
        var u = url.split('{sender}').join(lower(sender)).split('{data}').join(data);
        var init = get ? { method: 'GET' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: data, sender: sender }) };
        return fetch(u, init).then(function (r) {
          return r.text().then(function (t) {
            var j = null;
            try { j = JSON.parse(t); } catch (e) { j = null; }
            if (!r.ok) throw fail('the gateway answered ' + r.status + (j && (j.message || j.error) ? ': ' + (j.message || j.error) : ''), { status: r.status });
            return j && j.data ? j.data : t;
          });
        }).catch(function (e) { return next(e); });
      }
      return next();
    }
    // The batch gateway, run here as viem runs it: every inner lookup fetched, answered as (bool[] failures, bytes[] responses).
    function localBatch(callData) {
      var queries = decode(['(address,string[],bytes)[]'], '0x' + strip(callData).slice(8))[0];
      return Promise.all(queries.map(function (q) {
        var p = q[1].indexOf(LOCAL_BATCH) >= 0 ? localBatch(q[2]) : gatewayFetch(q[0], q[1], q[2]);
        return p.then(function (resp) { return [false, resp]; }, function (e) {
          var status = e && e.status ? e.status : 500;
          return [true, calldata('HttpError(uint16,string)', [status, String(e && e.message || e)])];
        });
      })).then(function (rs) {
        return encode(['bool[]', 'bytes[]'], [rs.map(function (r) { return r[0]; }), rs.map(function (r) { return r[1]; })]);
      });
    }
    // eth_call that follows OffchainLookup reverts (up to 4 hops), as a CCIP-Read client does.
    function ccipCall(to, data, hops) {
      return call(to, data).catch(function (e) {
        var rev = revertData(e);
        if (!rev || rev.slice(0, 10).toLowerCase() !== selector('OffchainLookup(address,string[],bytes,bytes4,bytes)') || (hops || 0) >= 4) throw e;
        var a = decode(['address', 'string[]', 'bytes', 'bytes4', 'bytes'], '0x' + rev.slice(10));
        if (!same(a[0], to)) throw fail('OffchainLookup sender ' + a[0] + ' is not ' + to);
        var got = a[1].indexOf(LOCAL_BATCH) >= 0 ? localBatch(a[2]) : gatewayFetch(a[0], a[1], a[2]);
        return got.then(function (result) {
          return ccipCall(to, a[3] + strip(encode(['bytes', 'bytes'], [result, a[4]])), (hops || 0) + 1);
        });
      });
    }
    function getText(name, key) {
      var data = calldata(F.resolve, [dnsEncode(name), calldata(F.text, [namehash(name), key]), [LOCAL_BATCH]]);
      return ccipCall(cfg.universalResolver, data).then(function (r) {
        var res = decode(['bytes', 'address'], r)[0];
        return res === '0x' ? null : decode(['string'], res)[0];
      }, function (e) { var d = decodeError(e); throw d ? fail(name + ' did not resolve ' + key + ': ' + d, { cause: e }) : e; });
    }

    // The address's primary ENS name through UR v2 (reverse, CCIP-Read as above), or null when it has none.
    function nameOf(addr) {
      return ccipCall(cfg.universalResolver, calldata(F.reverse, [addr, 60n, [LOCAL_BATCH]]))
        .then(function (r) { return decode(['string', 'address', 'address'], r)[0] || null; }, function () { return null; });
    }

    // ---- the harp ----
    function quoteTuple(rec) { return [rec.strategyHash, rec.tokenIn, rec.tokenOut, BigInt(rec.priceQ96), BigInt(rec.maxAmountIn), BigInt(rec.validUntil)]; }
    function fillData(rec) {
      return calldata(F.swap, [[rec.order.maker, BigInt(rec.order.traits), rec.order.data], rec.tokenIn, rec.tokenOut, BigInt(rec.amountIn), rec.takerTraitsAndData]);
    }
    // fi's signature, checked two ways by eth_call: PriceExtruction's EIP-712 digest recovered through the ecrecover
    // precompile against vault.fi(), and router.quote, which runs PriceExtruction's own check on the full order.
    function verify(rec) {
      var sig = strip(rec.quoteSig), v = parseInt(sig.slice(128, 130), 16);
      if (v < 27) v += 27;
      return Promise.all([
        view(cfg.priceExtruction, F.quoteDigest, [quoteTuple(rec)], ['bytes32']).then(function (d) {
          return call('0x0000000000000000000000000000000000000001', d[0] + pad64(v.toString(16)) + sig.slice(0, 128));
        }).then(function (r) { return strip(r).length >= 64 ? '0x' + strip(r).slice(24, 64) : null; }),
        view(cfg.castle, F.fi, [], ['address']).then(function (r) { return r[0]; }),
        call(rec.router, calldata(F.quote, [[rec.order.maker, BigInt(rec.order.traits), rec.order.data], rec.tokenIn, rec.tokenOut, BigInt(rec.amountIn), rec.takerTraitsAndData]))
          .then(function (r) { return decode(['uint256', 'uint256'], r)[1]; }, function (e) { return { failed: plainly(e) }; }),
      ]).then(function (r) {
        var failed = r[2] && r[2].failed;
        var out = { signer: r[0], fi: r[1], signedByFi: same(r[0], r[1]) && same(r[0], rec.signer), secondsLeft: Number(rec.validUntil) - Math.floor(Date.now() / 1000), routerOut: failed ? null : r[2] };
        if (!out.signedByFi) throw fail('the quote is not signed by fi (recovered ' + r[0] + ', fi is ' + r[1] + ')');
        if (failed) throw failed;
        if (out.secondsLeft <= 0) throw fail('QuoteExpired(' + rec.validUntil + ')');
        if (out.routerOut !== BigInt(rec.amountOut)) throw fail('router.quote pays ' + out.routerOut + ', the record says ' + rec.amountOut);
        return out;
      });
    }
    // askHarp('USDC', 'WETH', 500000n) -> {record, text, check}: the quote record that quote.feefifofum.eth serves.
    function askHarp(tokenIn, tokenOut, amountIn) {
      token(tokenIn); token(tokenOut);
      var key = 'quote:' + tokenIn + ':' + tokenOut + ':' + BigInt(amountIn).toString();
      return getText(QNAME, key).then(function (text) {
        if (!text) throw fail(QNAME + ' has no record for ' + key);
        var rec = JSON.parse(text);
        return verify(rec).then(function (check) { return { record: rec, text: text, key: key, check: check }; });
      });
    }
    // [{label: 'approve', to, data, skip}, {label: 'fill', to, data}]
    function harpCalls(rec, from) {
      return allowance(symOf(rec.tokenIn), from, rec.router).then(function (have) {
        return [
          { label: 'approve', to: rec.tokenIn, data: calldata(F.approve, [rec.router, BigInt(rec.amountIn)]), skip: have >= BigInt(rec.amountIn) },
          { label: 'fill', to: rec.router, data: fillData(rec), skip: false },
        ];
      });
    }
    function symOf(addr) { return same(addr, cfg.usdc) ? 'USDC' : same(addr, cfg.weth) ? 'WETH' : null; }
    function haveEnough(from, sym, amount) {
      return balances(from).then(function (b) {
        if (b[sym] < amount) throw fail('not enough ' + sym + ': the wallet holds ' + b[sym] + ', the trade needs ' + amount);
        return b;
      });
    }
    // Approve the router if short; ask again when the quote has under MIN_LEFT_S (20) seconds left, since the approve
    // and the wallet's prompt take time and a quote lives 30 s; simulate; then fill. opt: {refresh: false, dryRun: true}.
    function fillHarp(rec, from, opt) {
      opt = opt || {};
      var sym = symOf(rec.tokenIn), out = { approve: null, fill: null, record: rec };
      return onSepolia().then(function () { return haveEnough(from, sym, BigInt(rec.amountIn)); })
        .then(function () { return harpCalls(rec, from); })
        .then(function (calls) {
          if (calls[0].skip) return null;
          if (opt.dryRun) { out.approve = { skipped: false, dryRun: true }; return estimate(from, calls[0]).then(function (g) { out.approveGas = g; }); }
          return sendCall(from, calls[0]).then(function (r) { out.approve = r; if (r.status !== 'success') throw fail('the approve reverted: ' + r.hash); });
        })
        .then(function () {
          if (opt.refresh === false || Number(rec.validUntil) - Date.now() / 1000 >= MIN_LEFT_S) return harpCalls(rec, from);
          return askHarp(sym, symOf(rec.tokenOut), rec.amountIn).then(function (fresh) { rec = out.record = fresh.record; return harpCalls(rec, from); });
        })
        .then(function (calls) {
          // A dry run with the approve still unsent can only simulate against the allowance the wallet has now.
          if (opt.dryRun && !calls[0].skip) { out.fillData = calls[1]; return null; }
          return simulate(from, calls[1]).then(function () { return calls; });
        })
        .then(function (calls) {
          if (!calls) return out;
          return opt.dryRun ? estimate(from, calls[1]).then(function (g) { out.gas = g; return out; }) : sendCall(from, calls[1]).then(function (r) { out.fill = r; return out; });
        });
    }

    // ---- the hen (the Castle's v4 pool) ----
    function poolKey() {
      var p = cfg.pool;
      if (!p) {
        var a = cfg.usdc, b = cfg.weth, lt = hexToBig(a) < hexToBig(b);
        p = { currency0: lt ? a : b, currency1: lt ? b : a, fee: 0, tickSpacing: 60, hooks: cfg.hook };
      }
      var key = [p.currency0, p.currency1, BigInt(p.fee), BigInt(p.tickSpacing), p.hooks];
      if (cfg.poolId && lower(keccak256(encode([KEY], [key]))) !== lower(cfg.poolId)) throw fail('the pool key does not hash to poolId ' + cfg.poolId);
      return key;
    }
    function henArgs(sym, amountIn, minOut) {
      var key = poolKey(), zeroForOne = same(token(sym), key[0]);
      var hookData = minOut && BigInt(minOut) > 0n ? encode(['uint256'], [BigInt(minOut)]) : '0x';
      return { key: key, zeroForOne: zeroForOne, hookData: hookData, amountIn: BigInt(amountIn) };
    }
    // The V4Quoter's expected output for amountIn on the hen (an eth_call; the quoter reverts inside and decodes).
    function henQuote(sym, amountIn, minOut) {
      var h = henArgs(sym, amountIn, minOut);
      return call(cfg.v4Quoter, calldata(F.quoteHen, [[h.key, h.zeroForOne, h.amountIn, h.hookData]]))
        .then(function (r) { return decode(['uint256', 'uint256'], r)[0]; }, function (e) { throw plainly(e); });
    }
    function henCalls(sym, amountIn, minOut, from) {
      var h = henArgs(sym, amountIn, minOut);
      var data = calldata(F.swapHen, [h.key, [h.zeroForOne, -h.amountIn, h.zeroForOne ? MIN_SQRT : MAX_SQRT], [false, false], h.hookData]);
      return allowance(sym, from, cfg.poolSwapTest).then(function (have) {
        return [
          { label: 'approve', to: token(sym), data: calldata(F.approve, [cfg.poolSwapTest, h.amountIn]), skip: have >= h.amountIn },
          { label: 'swap', to: cfg.poolSwapTest, data: data, skip: false },
        ];
      });
    }
    function swapHen(sym, amountIn, minOut, from, opt) {
      opt = opt || {};
      var out = { approve: null, swap: null };
      return onSepolia().then(function () { return haveEnough(from, sym, BigInt(amountIn)); })
        .then(function () { return henCalls(sym, amountIn, minOut, from); })
        .then(function (calls) {
          if (calls[0].skip) return calls;
          if (opt.dryRun) { out.approve = { skipped: false, dryRun: true }; return estimate(from, calls[0]).then(function (g) { out.approveGas = g; out.swapData = calls[1]; return null; }); }
          return sendCall(from, calls[0]).then(function (r) { out.approve = r; if (r.status !== 'success') throw fail('the approve reverted: ' + r.hash); return calls; });
        })
        .then(function (calls) { return calls && simulate(from, calls[1]).then(function () { return calls; }); })
        .then(function (calls) {
          if (!calls) return out;
          return opt.dryRun ? estimate(from, calls[1]).then(function (g) { out.gas = g; return out; }) : sendCall(from, calls[1]).then(function (r) { out.swap = r; return out; });
        });
    }

    // ---- WETH ----
    function wrapCall(wei) { return { to: cfg.weth, data: calldata(F.deposit, []), value: '0x' + BigInt(wei).toString(16) }; }
    function wrapEth(wei, from) {
      return onSepolia().then(function () { return balances(from); }).then(function (b) {
        if (b.ETH < BigInt(wei)) throw fail('not enough ETH: the wallet holds ' + b.ETH + ', wrapping needs ' + wei + ' plus gas');
        return sendCall(from, wrapCall(wei));
      });
    }

    // ---- your trades: the castle stream's fills and swaps whose taker is addr ----
    function myTrades(addr, state) {
      var got = state ? Promise.resolve(state) : cfg.service ? fetch(cfg.service + '/state').then(function (r) { return r.json(); }) : Promise.reject(fail('myTrades needs the /state snapshot or config.service'));
      return got.then(function (s) {
        return (s.fills || []).filter(function (f) { return same(f.taker, addr); }).map(function (f) {
          return { tx: f.tx, link: 'https://sepolia.etherscan.io/tx/' + f.tx, route: f.route, strategy: f.label, tokenIn: f.tokenIn, tokenOut: f.tokenOut, amountIn: f.amountIn, amountOut: f.amountOut, quoteId: f.quoteId || null, status: f.status, t: f.t };
        });
      });
    }

    return {
      config: cfg, connect: connect, ensureSepolia: ensureSepolia, send: sendCall, simulate: simulate, estimate: estimate,
      balances: balances, allowance: allowance, vault: vault, readCastle: vault,
      getText: getText, nameOf: nameOf, askHarp: askHarp, verifyQuote: verify, harpCalls: harpCalls, fillHarp: fillHarp,
      poolKey: poolKey, henQuote: henQuote, quoteHen: henQuote, henCalls: henCalls, swapHen: swapHen,
      wrapCall: wrapCall, wrapEth: wrapEth, myTrades: myTrades, decodeError: decodeError,
    };
  }

  return { version: 1, create: create, rpc: rpc, configFrom: configFrom, decodeError: decodeError, keccak256: keccak256, encode: encode, decode: decode, calldata: calldata, selector: selector, namehash: namehash, dnsEncode: dnsEncode };
})();
