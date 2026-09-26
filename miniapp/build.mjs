#!/usr/bin/env node
// Build the shippable fee-fi-fo-fum miniapp: inline the publish-time config, minify, and run the same text
// scan the handoff.lol validator runs, so a build that would lose points fails here first.
//
//   node miniapp/build.mjs            -> miniapp/dist/fee-fi-fo-fum.html (the mock plays: no config)
//   node miniapp/build.mjs --live     -> config from miniapp/config.json (+ addresses from contracts/deployments/sepolia.json)
//
// esbuild comes from ESBUILD (a module path) or normal resolution; `npm i -g esbuild` is enough.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const LIVE = process.argv.includes('--live');

const esbuild = await import(process.env.ESBUILD ? pathToFileURL(process.env.ESBUILD).href : 'esbuild');
const { transformSync } = esbuild.default || esbuild;

let html = readFileSync(join(HERE, 'fee-fi-fo-fum.html'), 'utf8');

if (LIVE) {
  // miniapp/config.json holds what the page reads (the service URL, names, the explorer). The addresses come from the
  // deployments file when it has them; the live service repeats them in snapshot.config, and the service wins.
  const cfg = join(HERE, 'config.json'), dep = join(REPO, 'contracts', 'deployments', 'sepolia.json');
  if (!existsSync(cfg)) { console.error(`--live needs ${cfg}`); process.exit(1); }
  const config = JSON.parse(readFileSync(cfg, 'utf8'));
  if (existsSync(dep)) {
    const d = JSON.parse(readFileSync(dep, 'utf8')), c = d.contracts || {}, x = d.external || {};
    const addr = (k) => (c[k] && (c[k].address || c[k])) || undefined;
    Object.assign(config, { chainId: d.chainId, castle: addr('castle'), hook: addr('hook') || addr('jitHook'), resolver: addr('quoteResolver') || addr('offchainResolver'),
      aqua: x.aqua, usdc: x.usdc, weth: x.weth });
  }
  config.agents = (config.agents || []).map(({ id, role, addr, ens }) => ({ id, role, addr, ens }));
  // Test builds only: STREAM points the page at a local castle service (a fork-backed one, or a fake that replays events).
  if (process.env.STREAM) config.stream = process.env.STREAM;
  if (!html.includes('/*@CONFIG*/null')) { console.error('config slot missing from the page'); process.exit(1); }
  html = html.replace('/*@CONFIG*/null', JSON.stringify(config));
}

// Every lettered title must be set from glyphs the page carries (Almendra outlines: no Q, X, Z or digits). Checked on
// the static titles (data-lt) and on every all-caps literal in scene(), before minifying.
{
  const gl = JSON.parse(html.match(/var GL = (\{.*\});/)[1]).g;
  const sc = html.slice(html.indexOf('function scene('), html.indexOf('// ---', html.indexOf('function scene(')));
  const titles = [...html.matchAll(/data-lt="([^"]*)"/g)].map((m) => m[1])
    .concat([...sc.matchAll(/'([^'a-z]{2,})'/g)].map((m) => m[1]).filter((t) => /[A-Z]/.test(t)));
  const bad = titles.filter((t) => [...t].some((ch) => !gl[ch]));
  if (bad.length) { console.error('no glyph for: ' + bad.map((t) => JSON.stringify(t)).join(', ')); process.exit(1); }
  console.error(`lettering: ${titles.length} titles, every glyph present`);
}

html = html.replace(/<!--[\s\S]*?-->\n?/, '');
html = html.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => '<style>' + transformSync(css, { loader: 'css', minify: true }).code.trim() + '</style>');
html = html.replace(/<script>([\s\S]*?)<\/script>/g, (m, js) => '<script>' + transformSync(js, { loader: 'js', minify: true, legalComments: 'none', target: 'es2020' }).code.trim() + '</script>');

// The site runs each script as the body of an async function with `document` proxied to a shadow root, in strict
// mode. Compile it the same way so a syntax the wrapper rejects fails here.
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(`(async function(__r,__handoff){'use strict';const document={};\n${m[1]}})`);

// src/miniapp-validator.ts, verbatim patterns: BLOCK costs 30 points each, WARN 5.
const BLOCK = [/\beval\s*\(/, /document\.cookie\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /window\.location\s*=/, /new\s+Function\s*\(/];
const WARN = [/fetch\s*\(\s*['"`]https?:\/\/(?!handoff\.socnet\.lol)/, /\.innerHTML\s*\+=|\.innerHTML\s*=\s*.*\+/, /document\.write\s*\(/];
const bytes = Buffer.byteLength(html);
const blocked = BLOCK.filter((r) => r.test(html)).map(String);
const warned = WARN.filter((r) => r.test(html)).map(String).concat(bytes > 100_000 ? ['bundle exceeds 100KB'] : []);
const score = Math.max(0, 100 - blocked.length * 30 - warned.length * 5);
console.error(`pre-flight: ${bytes} B, score ${score}/100${blocked.length ? ', blocked ' + blocked.join(' ') : ''}${warned.length ? ', warnings ' + warned.join(' ') : ''}`);

mkdirSync(join(HERE, 'dist'), { recursive: true });
const out = join(HERE, 'dist', 'fee-fi-fo-fum.html');
writeFileSync(out, html);
console.log(out);
if (blocked.length || warned.length) process.exit(1);
