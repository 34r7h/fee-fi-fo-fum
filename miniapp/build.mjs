#!/usr/bin/env node
// Build the shippable fee-fi-fo-fum miniapp: inline the publish-time config, minify, and run the same text
// scan the handoff.lol validator runs, so a build that would lose points fails here first.
//
//   node miniapp/build.mjs            -> miniapp/dist/fee-fi-fo-fum.html (the mock plays: no config)
//   node miniapp/build.mjs --live     -> config from contracts/deployments/sepolia.json + miniapp/config.json
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
  const dep = join(REPO, 'contracts', 'deployments', 'sepolia.json');
  const cfg = join(HERE, 'config.json');
  if (!existsSync(dep) || !existsSync(cfg)) { console.error(`--live needs ${dep} and ${cfg}`); process.exit(1); }
  // Only what the page reads: addresses, the Castle deploy block and tx. Constructor args and build notes stay out.
  const d = JSON.parse(readFileSync(dep, 'utf8'));
  const contracts = {};
  for (const [k, v] of Object.entries(d.contracts || {})) contracts[k] = { address: v.address, block: v.block, tx: v.tx };
  const config = Object.assign({ chainId: d.chainId, external: d.external, contracts }, JSON.parse(readFileSync(cfg, 'utf8')));
  if (!html.includes('/*@CONFIG*/null')) { console.error('config slot missing from the page'); process.exit(1); }
  html = html.replace('/*@CONFIG*/null', JSON.stringify(config));
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
