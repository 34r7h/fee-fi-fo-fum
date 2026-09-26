// Records the feefifofum demo from the live dapp, one clip per shot, with a scripted test wallet.
// env: RPC (default publicnode; set to an anvil fork for a dry run), FORK=1 (fund the demo key on the fork), ONLY=s03,s04 (debug)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, parseGwei, formatEther, formatUnits, parseEther } from '/Users/34r7h/Developer/hacks/feefifofum/agents/node_modules/viem/_esm/index.js';
import { sepolia } from '/Users/34r7h/Developer/hacks/feefifofum/agents/node_modules/viem/_esm/chains/index.js';
import { privateKeyToAccount } from '/Users/34r7h/Developer/hacks/feefifofum/agents/node_modules/viem/_esm/accounts/index.js';
const require = createRequire('/Users/34r7h/Developer/projects/handoff/package.json');
const puppeteer = require('puppeteer-core');

const S = process.cwd();
const RPC = process.env.RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const FORK = process.env.FORK === '1';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const DUR = JSON.parse(fs.readFileSync(S + '/durations.json', 'utf8'));
const APP = 'https://handoff.lol/app/impecc/fee-fi-fo-fum';
const TALE = 'https://handoff.lol/app/impecc/fee-fi-fo-fum-tale';
const REPO = 'https://github.com/34r7h/fee-fi-fo-fum';
const GREEDY = '0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba';
const AMOUNT = '0.0001', WRAP = '0.0003';
const ADDR = {
  weth: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', usdc: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
  router: '0xedb6933949db941d495b23604818f9abf55e70f9', pst: '0x9b6b46e2c869aa39918db7f52f5557fe577b6eee',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fail = (m) => { throw new Error('ABORT: ' + m); };

// ---- wallet ---------------------------------------------------------------------------------------------------------
const key = fs.readFileSync(process.env.HOME + '/.handoff/agents/SirKit/' + (process.env.KEYFILE || 'demo-wallet5.key'), 'utf8').trim();
const acct = privateKeyToAccount(key);
const transport = http(RPC);
const pc = createPublicClient({ chain: sepolia, transport });
const wc = createWalletClient({ account: acct, chain: sepolia, transport });
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const W = { allow: 0, pending: null, sent: [], connected: false };

function describe(tx) {
  const to = (tx.to || '').toLowerCase(), d = (tx.data || tx.input || '0x').toLowerCase();
  const tok = to === ADDR.weth ? 'WETH' : to === ADDR.usdc ? 'USDC' : 'tokens';
  if (to === ADDR.weth && d.startsWith('0xd0e30db0')) return `Wrap ${formatEther(BigInt(tx.value || 0))} ETH into WETH`;
  if (d.startsWith('0x095ea7b3')) {
    const sp = '0x' + d.slice(34, 74), amt = BigInt('0x' + d.slice(74, 138));
    const who = sp === ADDR.router ? 'the 1inch SwapVM router' : sp === ADDR.pst ? "Uniswap's PoolSwapTest" : short(sp);
    return `Approve ${formatUnits(amt, tok === 'USDC' ? 6 : 18)} ${tok} for ${who}`;
  }
  if (to === ADDR.router) return 'Fill the signed quote through the 1inch SwapVM router';
  if (to === ADDR.pst) return 'Swap on the Uniswap v4 pool';
  return 'Send a transaction to ' + short(to);
}

async function toast(page, title, line) {
  await page.evaluate((title, line) => {
    let t = document.getElementById('demo-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'demo-toast';
      t.style.cssText = 'position:fixed;right:28px;bottom:28px;z-index:2147483647;width:430px;background:#1F2433;color:#fff;border-radius:12px;padding:16px 18px;font:15px/1.4 -apple-system,Helvetica,Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28);transition:opacity .3s';
      document.body.appendChild(t);
    }
    t.innerHTML = '<div style="font-size:12px;letter-spacing:.06em;opacity:.7;text-transform:uppercase">' + title + '</div><div style="margin-top:6px">' + line + '</div>';
    t.style.opacity = '1';
  }, title, line);
}
async function untoast(page) { await page.evaluate(() => { const t = document.getElementById('demo-toast'); if (t) t.style.opacity = '0'; }); }

async function walletHandler(page, method, paramsJson) {
  const params = JSON.parse(paramsJson || '[]');
  if (process.env.WDEBUG && method !== 'eth_call') log('wallet', method, paramsJson.slice(0, 160));
  switch (method) {
    case 'eth_requestAccounts': W.connected = true; return [acct.address];
    case 'eth_accounts': return W.connected ? [acct.address] : [];
    case 'eth_chainId': return '0xaa36a7';
    case 'net_version': return '11155111';
    case 'wallet_switchEthereumChain': case 'wallet_addEthereumChain': return null;
    case 'eth_sendTransaction': {
      const tx = params[0]; const what = describe(tx);
      W.pending = what; log('wallet request:', what);
      while (W.allow <= 0) await sleep(100);
      W.allow--; W.pending = null;
      await toast(page, `Test wallet ${short(acct.address)} · Sepolia`, 'Signing: ' + what);
      await sleep(1200);
      const hash = await wc.sendTransaction({
        to: tx.to, data: tx.data || tx.input, value: tx.value ? BigInt(tx.value) : 0n,
        ...(tx.gas ? { gas: BigInt(tx.gas) * 12n / 10n } : {}),
        maxFeePerGas: parseGwei('1.8'), maxPriorityFeePerGas: parseGwei('0.05'),
      });
      W.sent.push({ what, hash }); log('sent', what, hash);
      await toast(page, `Test wallet ${short(acct.address)} · Sepolia`, 'Sent: ' + what + '<br><span style="opacity:.7;font-family:monospace">' + short(hash) + '</span>');
      setTimeout(() => untoast(page).catch(() => {}), 3500);
      return hash;
    }
    default: {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message || 'rpc error'); return j.result;
    }
  }
}

const SHIM = `(() => {
  const listeners = {};
  window.ethereum = {
    isDemoWallet: true,
    request: async ({ method, params }) => {
      const r = await window.__fffWallet(method, JSON.stringify(params || []));
      if (r && r.__err) { const e = new Error(r.__err); e.code = r.code || -32000; throw e; }
      return r;
    },
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeListener: () => {},
  };
})();`;

// ---- page helpers ---------------------------------------------------------------------------------------------------
async function cursorTo(page, sel, opts = {}) {
  const box = await page.evaluate((sel, text) => {
    const all = [...document.querySelectorAll(sel)].filter((e) => !text || (e.innerText || '').includes(text));
    const e = all.find((x) => x.offsetParent !== null) || all[0]; if (!e) return null;
    e.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return true;
  }, sel, opts.text || null);
  if (!box) fail('no element ' + sel + ' ' + (opts.text || ''));
  await sleep(900);
  const b = await page.evaluate((sel, text) => {
    const all = [...document.querySelectorAll(sel)].filter((e) => !text || (e.innerText || '').includes(text));
    const e = all.find((x) => x.offsetParent !== null) || all[0]; const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel, opts.text || null);
  await page.evaluate(async (x, y) => {
    let c = document.getElementById('demo-cursor');
    if (!c) {
      c = document.createElement('div'); c.id = 'demo-cursor';
      c.style.cssText = 'position:fixed;left:960px;top:540px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(31,36,51,.35);border:2px solid #1F2433;z-index:2147483646;pointer-events:none;transition:left .7s ease,top .7s ease,transform .15s';
      document.body.appendChild(c); await new Promise((r) => setTimeout(r, 50));
    }
    c.style.left = x + 'px'; c.style.top = y + 'px';
  }, b.x, b.y);
  await sleep(850);
  return b;
}
async function click(page, sel, opts = {}) {
  await cursorTo(page, sel, opts);
  await page.evaluate(() => { const c = document.getElementById('demo-cursor'); if (c) { c.style.transform = 'scale(.7)'; setTimeout(() => (c.style.transform = ''), 180); } });
  const ok = await page.evaluate((sel, text) => {
    const all = [...document.querySelectorAll(sel)].filter((e) => !text || (e.innerText || '').includes(text));
    const e = all.find((x) => x.offsetParent !== null) || all[0]; if (!e) return false; e.click(); return true;
  }, sel, opts.text || null);
  if (!ok) fail('click: no element ' + sel);
  await sleep(400);
}
async function typeInto(page, sel, text) {
  await cursorTo(page, sel);
  await page.focus(sel);
  await page.evaluate((sel) => { const e = document.querySelector(sel); e.select(); }, sel);
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text, { delay: 140 });
  const v = await page.evaluate((sel) => document.querySelector(sel).value, sel);
  if (v !== text) fail('typed ' + JSON.stringify(v) + ' into ' + sel);
  await sleep(500);
}
async function scrollTo(page, y, ms = 1200) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y); await sleep(ms);
}
async function scrollToSel(page, sel, block = 'start', ms = 1200) {
  await page.evaluate((sel, block) => { const e = document.querySelector(sel); if (e) e.scrollIntoView({ block, behavior: 'smooth' }); }, sel, block); await sleep(ms);
}
async function slowScroll(page, dy, ms) {
  await page.evaluate((dy, ms) => new Promise((res) => {
    // the page's scroller: the document, or the tallest scrollable element when the document itself does not scroll
    let el = document.scrollingElement;
    if (el.scrollHeight <= innerHeight + 4) {
      const c = [...document.querySelectorAll('*')].filter((x) => { const o = getComputedStyle(x).overflowY; return (o === 'auto' || o === 'scroll') && x.scrollHeight > x.clientHeight + 4; });
      c.sort((a, b) => b.clientHeight - a.clientHeight); if (c[0]) el = c[0];
    }
    // CSS scroll-behavior: smooth would restart a smooth scroll on every frame and barely move
    const sb = el.style.scrollBehavior; el.style.scrollBehavior = 'auto';
    const y0 = el.scrollTop, t0 = performance.now();
    const f = (t) => { const k = Math.min(1, (t - t0) / ms); el.scrollTop = y0 + dy * k; if (k < 1) requestAnimationFrame(f); else { el.style.scrollBehavior = sb; res(); } };
    requestAnimationFrame(f);
  }), dy, ms);
}
async function ready(page, card, ms) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const ok = await page.evaluate((c) => { const e = document.querySelector(`[data-r=${c}]`), b = e && e.querySelector('button.btn.gold'); return !!(b && !b.disabled && /get( about)? [0-9.]+ (USDC|WETH)/.test(e.innerText)); }, card);
    if (ok) return true; await sleep(1000);
  }
  return false;
}
async function text(page, sel) { return page.evaluate((sel) => (document.querySelector(sel)?.innerText || ''), sel); }

// ---- clips ----------------------------------------------------------------------------------------------------------
const manifest = [];
let cur = null;
async function shot(page, seg, fn) {
  const file = `clips/${seg}_${manifest.filter((m) => m.seg === seg).length + 1}.webm`;
  await page.bringToFront(); await sleep(300);
  const rec = await page.screencast({ path: S + '/' + file, ffmpegPath: '/opt/homebrew/bin/ffmpeg' });
  const t0 = Date.now(); cur = { seg, t0 };
  try { await fn(); } finally { await sleep(200); await rec.stop(); cur = null; }
  const m = { seg, file, dur: (Date.now() - t0) / 1000 }; manifest.push(m);
  fs.writeFileSync(S + '/manifest.json', JSON.stringify(manifest, null, 1));
  log('clip', file, m.dur.toFixed(1) + 's');
}
function segTime(seg) { return manifest.filter((m) => m.seg === seg).reduce((a, m) => a + m.dur, 0) + (cur && cur.seg === seg ? (Date.now() - cur.t0) / 1000 : 0); }
async function holdFor(seg, pad = 0.8) { const need = DUR[seg] + pad - segTime(seg); if (need > 0) await sleep(need * 1000); }
async function waitSent(n, ms = 90000) { const t = Date.now(); while (W.sent.length < n) { if (Date.now() - t > ms) fail('no tx #' + n + ' (pending: ' + W.pending + ')'); await sleep(200); } return W.sent[n - 1]; }
async function waitPending(ms = 60000) { const t = Date.now(); while (!W.pending) { if (Date.now() - t > ms) return false; await sleep(200); } return true; }
async function mined(hash) {
  const r = await pc.waitForTransactionReceipt({ hash, timeout: 180000 });
  if (r.status !== 'success') fail('tx reverted ' + hash);
  log('mined', hash, 'gas', r.gasUsed); return r;
}
async function henHash() {
  const s = await (await fetch('https://handoff.lol/t/castle/state')).json();
  const h = s.strategies.filter((x) => x.slot === 1 && !x.docked).map((x) => x.hash); return h[h.length - 1] || null;
}

// ---- run ------------------------------------------------------------------------------------------------------------
const want = (s) => !ONLY || ONLY.includes(s);
const dir = fs.mkdtempSync(S + '/pp-');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, userDataDir: dir,
  args: ['--no-first-run', '--window-size=1920,1080', '--hide-scrollbars'], defaultViewport: { width: 1920, height: 1080 },
});
const ua = (await browser.userAgent()).replace('HeadlessChrome', 'Chrome');
const errors = [];
try {
  if (FORK) { await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_setBalance', params: [acct.address, '0x' + parseEther('0.01').toString(16)] }) }); }
  log('demo wallet', acct.address, formatEther(await pc.getBalance({ address: acct.address })), 'ETH on', FORK ? 'fork' : 'Sepolia');

  const app = await browser.newPage(); await app.setUserAgent(ua);
  app.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  app.on('pageerror', (e) => errors.push(String(e)));
  await app.exposeFunction('__fffWallet', async (m, p) => { try { return await walletHandler(app, m, p); } catch (e) { log('wallet error', m, e.message); return { __err: e.message }; } });
  await app.evaluateOnNewDocument(SHIM);
  await app.goto(APP, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(6000);
  if (!(await text(app, '[data-r=castle]'))) fail('dapp did not render');

  const es = await browser.newPage(); await es.setUserAgent(ua);
  // needLogs: Etherscan shows the Logs tab a little after the tx page itself, so wait for it too
  const esGo = async (url, needLogs = false) => {
    for (let k = 0; k < 20; k++) {
      await es.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }); await sleep(1500);
      if (!/etherscan\.io\/tx\//.test(url)) break;
      const tx = await es.evaluate(() => document.body.innerText);
      if (/Transaction Hash/.test(tx) && !/unable to locate|Status:\s*Pending|\(Pending\)/i.test(tx) && (!needLogs || /Logs\s*\(\d+\)/.test(tx))) break;
      log('etherscan not ready, retrying'); await sleep(5000);
    }
    await es.evaluate(() => { for (const e of document.querySelectorAll('div,section')) if (/uses cookies/.test(e.innerText || '') && (e.innerText || '').length < 400) e.style.display = 'none'; });
  };
  const esLogs = async () => {
    const ok = await es.evaluate(() => { const a = [...document.querySelectorAll('a,button')].find((x) => /^Logs\s*\(\d+\)$/.test((x.innerText || '').trim())); if (a) { a.click(); return true; } return false; });
    if (!ok) fail('no Logs tab on ' + es.url());
    await sleep(1500); await es.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(800);
  };

  // s01: intro over the dapp's top
  if (want('s01')) {
    await app.bringToFront(); await scrollTo(app, 0, 300);
    await shot(app, 's01', async () => { await sleep(3000); await slowScroll(app, 260, 8000); await sleep(1500); await slowScroll(app, -260, 3000); await holdFor('s01', 0.8 - 4.5); });
  }
  // s02: the vault panel
  if (want('s02')) {
    await shot(app, 's02', async () => {
      await cursorTo(app, '[data-r=castle]'); await sleep(2500);
      await scrollToSel(app, '[data-r=castle]', 'center', 1500);
      await cursorTo(app, '[data-r=castle] a'); await sleep(3000);
      await holdFor('s02');
    });
  }
  // s03: connect and wrap
  if (want('s03')) {
    await scrollTo(app, 0, 800);
    await shot(app, 's03', async () => {
      log('s03 connect'); await click(app, '[data-r=purse] button.btn'); await sleep(2500); log('s03 connected', (await text(app, '[data-r=purse]')).slice(0, 80));
      log('s03 type wrap'); await typeInto(app, '[data-r=gold] input', WRAP); log('s03 typed');
      W.allow = 1; await click(app, '[data-r=gold] button'); log('s03 wrap clicked'); await app.screenshot({ path: S + '/debug-wrap.png' }); log('gold:', (await text(app, '[data-r=gold]')).replace(/\s+/g, ' ').slice(0, 300));
      await waitSent(1); await sleep(2500);
    });
    await mined(W.sent[0].hash); await sleep(5000);
    await shot(app, 's03', async () => { await cursorTo(app, '[data-r=purse]'); await sleep(2000); await holdFor('s03'); });
    if (!/WETH/.test(await text(app, '[data-r=purse]'))) fail('purse shows no WETH after wrap');
  }
  // s04: the harp quote, WETH in
  if (want('s04')) {
    await shot(app, 's04', async () => {
      await scrollToSel(app, '#fff-amt', 'center', 1200);
      if (!/WETH/.test(await text(app, '[data-r=tin]'))) await click(app, '[data-r=flip]');
      await typeInto(app, '#fff-amt', AMOUNT); await sleep(2500);
      await scrollToSel(app, '[data-r=harp]', 'center', 1200);
      await cursorTo(app, '[data-r=harp]'); await sleep(2000);
      await holdFor('s04', 0.2);
    });
    if (!(await ready(app, 'harp', 30000))) fail('harp card not quoting: ' + (await text(app, '[data-r=harp]')).slice(0, 200));
  }
  // s05: fill the harp quote
  let fillHash = process.env.FILL;
  if (want('s05')) {
    const n0 = W.sent.length;
    await shot(app, 's05', async () => {
      await click(app, '[data-r=harp] button.btn.ghost'); await sleep(3000);
      await click(app, '[data-r=harp] button.btn.gold'); W.allow = 1;
      await waitSent(n0 + 1); await sleep(2500);
    });
    const first = W.sent[n0];
    await mined(first.hash);
    if (/Approve/.test(first.what)) {
      if (!(await waitPending(25000))) {
        await shot(app, 's05', async () => { await click(app, '[data-r=harp] button.btn.gold'); W.allow = 1; await waitSent(n0 + 2); await sleep(2500); });
      } else {
        await shot(app, 's05', async () => { W.allow = 1; await waitSent(n0 + 2); await sleep(2500); });
      }
      fillHash = W.sent[n0 + 1].hash; await mined(fillHash);
    } else fillHash = first.hash;
    await sleep(5000);
    await shot(app, 's05', async () => { await cursorTo(app, '[data-r=harp]'); await sleep(1500); await holdFor('s05'); });
  }
  // s06: the fill on Etherscan
  if (want('s06') && fillHash) {
    await esGo(`https://sepolia.etherscan.io/tx/${fillHash}`, true);
    await es.bringToFront();
    await shot(es, 's06', async () => {
      await sleep(1200);
      await es.evaluate(() => { const e = [...document.querySelectorAll('*')].find((x) => /ERC-20 Tokens Transferred/.test(x.textContent) && x.children.length < 4); if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
      await sleep(3000);
      await esLogs();
      await slowScroll(es, 900, 3500);
      await holdFor('s06');
    });
  }
  // s07: swap on the hen
  let swapHash = process.env.SWAP, hen0;
  if (want('s07')) {
    hen0 = await henHash();
    await app.bringToFront();
    const n0 = W.sent.length;
    await shot(app, 's07', async () => {
      await scrollToSel(app, '[data-r=fo]', 'center', 1200);
      await cursorTo(app, '[data-r=hen] button.btn.ghost'); await click(app, '[data-r=hen] button.btn.ghost'); await sleep(2500);
      await cursorTo(app, '[data-r=fo]'); await sleep(2500);
      if (!(await ready(app, 'hen', 30000))) fail('hen card not quoting: ' + (await text(app, '[data-r=hen]')).slice(0, 200));
      await click(app, '[data-r=hen] button.btn.gold'); W.allow = 1;
      await waitSent(n0 + 1); await sleep(2500);
    });
    const first = W.sent[n0];
    await mined(first.hash);
    if (/Approve/.test(first.what)) {
      if (!(await waitPending(25000))) {
        await shot(app, 's07', async () => { await click(app, '[data-r=hen] button.btn.gold'); W.allow = 1; await waitSent(n0 + 2); await sleep(2500); });
      } else {
        await shot(app, 's07', async () => { W.allow = 1; await waitSent(n0 + 2); await sleep(2500); });
      }
      swapHash = W.sent[n0 + 1].hash; await mined(swapHash);
    } else swapHash = first.hash;
    await sleep(5000);
    await shot(app, 's07', async () => { await cursorTo(app, '[data-r=hen]'); await sleep(1500); await holdFor('s07'); });
  }
  // s08: the swap on Etherscan
  if (want('s08') && swapHash) {
    await esGo(`https://sepolia.etherscan.io/tx/${swapHash}`, true);
    await es.bringToFront();
    await shot(es, 's08', async () => { await sleep(800); await esLogs(); await slowScroll(es, 2850, 6000); await holdFor('s08'); });
  }
  // s09: the re-centre, then your trades
  if (want('s09')) {
    if (hen0) {
      // henHash() is null while fi has the old hen docked; the re-centre is done only when a new hen is live
      const t = Date.now(); let h = null;
      while (Date.now() - t < 180000) { h = await henHash(); if (h && h !== hen0) break; await sleep(3000); }
      if (!h || h === hen0) fail('hen was not re-centred within 180 s');
      log('hen re-centred:', hen0.slice(0, 10), '->', h.slice(0, 10));
      const t2 = Date.now(); while (!/hen\s*XYCSwap/.test(await text(app, '[data-r=castle]')) && Date.now() - t2 < 90000) await sleep(2000);
      if (!/hen\s*XYCSwap/.test(await text(app, '[data-r=castle]'))) fail('the dapp does not list the new hen');
    }
    await app.bringToFront(); await sleep(3000);
    if (!W.connected) {
      // a re-shoot of this shot alone: connect and set the same pair and amount as the rest of the take
      await click(app, '[data-r=purse] button.btn'); await sleep(4000);
      await scrollToSel(app, '#fff-amt', 'center', 600);
      if (!/WETH/.test(await text(app, '[data-r=tin]'))) await click(app, '[data-r=flip]');
      await typeInto(app, '#fff-amt', AMOUNT); await sleep(1500);
    }
    // the hen card still shows the quote from before the re-centre; ask again so the shot shows the new price
    await scrollToSel(app, '[data-r=fo]', 'center', 800);
    await click(app, '[data-r=hen] button.btn.ghost');
    if (!(await ready(app, 'hen', 45000))) fail('hen card not quoting after the re-centre');
    await sleep(1500);
    await shot(app, 's09', async () => {
      await scrollToSel(app, '[data-r=castle]', 'center', 1500); await cursorTo(app, '[data-r=castle]'); await sleep(4000);
      await scrollToSel(app, '[data-r=trades]', 'center', 1500); await cursorTo(app, '[data-r=trades]'); await sleep(1500);
      await holdFor('s09');
    });
    const tr = await text(app, '[data-r=trades]');
    if (fillHash && swapHash && !(tr.match(/0x[0-9a-f]{4}/gi) || []).length) log('WARN trades panel shows no tx links');
  }
  // s10: greedy's OverAllocated revert
  if (want('s10')) {
    await esGo(`https://sepolia.etherscan.io/tx/${GREEDY}`);
    await es.bringToFront();
    await shot(es, 's10', async () => { await sleep(2500); await slowScroll(es, 300, 3000); await holdFor('s10'); });
  }
  // s11: the tale
  if (want('s11')) {
    const tale = await browser.newPage(); await tale.setUserAgent(ua);
    tale.on('pageerror', (e) => errors.push('tale: ' + e));
    await tale.goto(TALE, { waitUntil: 'networkidle2', timeout: 90000 }); await sleep(6000);
    await shot(tale, 's11', async () => { await sleep(1000); await slowScroll(tale, 1300, 5200); await holdFor('s11'); });
  }
  // s12: how it was built, on handoff
  if (want('s12')) {
    await esGo('https://handoff.lol/projects/de902056-080b-480f-a95e-dd821b678795');
    await sleep(3000);
    const opened = await es.evaluate(() => {
      const t = [...document.querySelectorAll('button')].find((x) => /^Finished/.test((x.innerText || '').trim())); if (!t) return -1; t.click(); return 0;
    });
    if (opened < 0) fail('no Finished goals tab');
    await sleep(1500);
    const n = await es.evaluate(() => { const c = [...document.querySelectorAll('span.gcaret')].filter((x) => (x.innerText || '').trim() === '▸'); c.forEach((x) => x.click()); return c.length; });
    log('s12 goals opened', n); if (n < 3) fail('finished goals did not open');
    await es.evaluate(() => window.scrollTo(0, 0)); await sleep(1500);
    await shot(es, 's12', async () => {
      await sleep(4800);
      await es.evaluate(() => { const e = [...document.querySelectorAll('*')].find((x) => /^Goals/.test((x.innerText || '').trim()) && x.children.length < 8); if (e) e.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
      await sleep(4500);
      await slowScroll(es, 2600, 13500);
      await es.evaluate(() => { const e = [...document.querySelectorAll('*')].find((x) => /^Chain of command/.test((x.innerText || '').trim()) && x.children.length < 6); if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
      await holdFor('s12');
    });
  }
  // s13: the repo
  if (want('s13')) {
    await esGo(REPO);
    await shot(es, 's13', async () => {
      await sleep(1500);
      await es.evaluate(() => { const e = document.querySelector('article.markdown-body, #readme'); if (e) e.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
      await sleep(2500); await slowScroll(es, 900, 6000); await holdFor('s13');
    });
  }
  fs.writeFileSync(S + '/run.json', JSON.stringify({ wallet: acct.address, sent: W.sent, fillHash, swapHash, errors, fork: FORK }, null, 1));
  log('done; sent', W.sent.length, 'txs; console errors', errors.length, errors.slice(0, 3));
} catch (e) {
  fs.writeFileSync(S + '/run.json', JSON.stringify({ wallet: acct.address, sent: W.sent, error: String(e), errors, fork: FORK }, null, 1));
  log(String(e)); process.exitCode = 1;
} finally {
  await browser.close(); fs.rmSync(dir, { recursive: true, force: true });
}
