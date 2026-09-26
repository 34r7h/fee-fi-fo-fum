// Assembles the demo: per-shot clips + narration + burned-in captions -> out/feefifofum-demo.mp4 (+ .srt, script.md)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire('/Users/34r7h/Developer/projects/handoff/package.json');
const puppeteer = require('puppeteer-core');
const S = process.cwd();
const N = JSON.parse(fs.readFileSync(S + '/narration.json', 'utf8'));
const DUR = JSON.parse(fs.readFileSync(S + '/durations.json', 'utf8'));
const M = JSON.parse(fs.readFileSync(S + '/manifest.json', 'utf8'));
const COVER = S + '/../eg/img/cover2-1280x720.png', COVER_S = 4.5, PAD = 0.8;
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
const probe = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
fs.mkdirSync(S + '/work', { recursive: true }); fs.mkdirSync(S + '/out', { recursive: true }); fs.mkdirSync(S + '/work/cap', { recursive: true });
const V = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30'];

// 1. per-segment video, padded to its narration
const segs = [];
let t = 0;
for (const n of N) {
  const clips = M.filter((m) => m.seg === n.id);
  if (!clips.length) throw new Error('no clips for ' + n.id);
  const parts = [];
  if (n.id === 's01') {
    ff('-loop', '1', '-t', String(COVER_S), '-i', COVER, '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', ...V, `${S}/work/cover.mp4`);
    parts.push(`${S}/work/cover.mp4`);
  }
  for (const c of clips) {
    const out = `${S}/work/${c.file.replace(/^clips\//, '').replace(/\.webm$/, '.mp4')}`;
    ff('-i', `${S}/${c.file}`, '-vf', 'scale=1920:1080,fps=30', ...V, '-an', out);
    parts.push(out);
  }
  fs.writeFileSync(`${S}/work/${n.id}.txt`, parts.map((p) => `file '${p}'`).join('\n'));
  ff('-f', 'concat', '-safe', '0', '-i', `${S}/work/${n.id}.txt`, ...V, `${S}/work/${n.id}-raw.mp4`);
  const vd = probe(`${S}/work/${n.id}-raw.mp4`), ad = DUR[n.id];
  const L = Math.max(vd, ad + PAD);
  ff('-i', `${S}/work/${n.id}-raw.mp4`, '-vf', `tpad=stop_mode=clone:stop_duration=${(L - vd + 0.05).toFixed(3)}`, '-t', L.toFixed(3), ...V, `${S}/work/${n.id}.mp4`);
  ff('-i', `${S}/audio/${n.id}.wav`, '-af', `apad=whole_dur=${L.toFixed(3)}`, '-t', L.toFixed(3), '-ar', '48000', '-ac', '2', `${S}/work/${n.id}-a.wav`);
  segs.push({ id: n.id, start: t, L, ad, text: n.text });
  console.log(n.id, 'video', vd.toFixed(1), 'audio', ad.toFixed(1), '->', L.toFixed(1), 'at', t.toFixed(1));
  t += L;
}
console.log('total', t.toFixed(1), 's');

// 2. captions: split each narration into short chunks, timed by length across its audio
function chunks(text) {
  // sentences end at . ! ? followed by a space, so 0.0001 and quote.feefifofum.eth stay whole
  const sent = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const s of sent) {
    if (s.length <= 92) { out.push(s); continue; }
    const k = Math.ceil(s.length / 88), words = s.split(' ');
    // candidate breaks: after a comma or semicolon (best), before a joining word (good), any space (last resort)
    const cand = []; let pos = 0;
    for (let w = 0; w < words.length - 1; w++) {
      pos += words[w].length;
      const next = words[w + 1];
      const score = /[,;]$/.test(words[w]) ? 0 : /^(and|which|where|because|so|then|with|whose|while|but)$/.test(next) ? 1 : 3;
      cand.push({ w, pos, score }); pos += 1;
    }
    const cuts = []; let from = 0;
    for (let c = 1; c < k; c++) {
      const target = (s.length * c) / k;
      let best = null;
      for (const x of cand) {
        if (x.w < from) continue;
        const cost = Math.abs(x.pos - target) + x.score * 14;
        if (!best || cost < best.cost) best = { ...x, cost };
      }
      cuts.push(best.w); from = best.w + 1;
    }
    let a = 0;
    for (const c of [...cuts, words.length - 1]) { out.push(words.slice(a, c + 1).join(' ')); a = c + 1; }
  }
  return out;
}
const caps = [];
for (const s of segs) {
  const cs = chunks(s.text); const total = cs.reduce((a, c) => a + c.length, 0);
  let at = s.start;
  for (const c of cs) { const d = s.ad * c.length / total; caps.push({ a: at, b: at + d, text: c }); at += d; }
}
const ts = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
fs.writeFileSync(S + '/out/feefifofum-demo.srt', caps.map((c, i) => `${i + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.text}\n`).join('\n'));

// 3. caption images -> one transparent caption track
const dir = fs.mkdtempSync(S + '/pp-');
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, userDataDir: dir, args: ['--no-first-run'] });
const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 });
const html = (text) => `<html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}
.c{position:absolute;left:50%;bottom:54px;transform:translateX(-50%);max-width:1480px;padding:14px 26px;background:rgba(20,22,30,.82);color:#fff;border-radius:10px;
font:500 38px/1.35 -apple-system,"Helvetica Neue",Arial,sans-serif;text-align:center}</style></head><body>${text ? `<div class="c">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>` : ''}</body></html>`;
const list = [];
await p.setContent(html('')); await p.screenshot({ path: `${S}/work/cap/blank.png`, omitBackground: true });
let cur = 0;
for (let i = 0; i < caps.length; i++) {
  const c = caps[i];
  if (c.a > cur + 0.001) list.push({ f: `${S}/work/cap/blank.png`, d: c.a - cur });
  await p.setContent(html(c.text)); await p.screenshot({ path: `${S}/work/cap/c${i}.png`, omitBackground: true });
  list.push({ f: `${S}/work/cap/c${i}.png`, d: c.b - c.a }); cur = c.b;
}
if (t > cur) list.push({ f: `${S}/work/cap/blank.png`, d: t - cur });
await b.close(); fs.rmSync(dir, { recursive: true, force: true });
fs.writeFileSync(`${S}/work/caps.txt`, list.map((x) => `file '${x.f}'\nduration ${x.d.toFixed(3)}`).join('\n') + `\nfile '${list[list.length - 1].f}'\n`);
ff('-f', 'concat', '-safe', '0', '-i', `${S}/work/caps.txt`, '-vf', 'fps=30,format=rgba', '-c:v', 'qtrle', `${S}/work/caps.mov`);

// 4. join, overlay captions, add narration
fs.writeFileSync(`${S}/work/all.txt`, segs.map((s) => `file '${S}/work/${s.id}.mp4'`).join('\n'));
fs.writeFileSync(`${S}/work/alla.txt`, segs.map((s) => `file '${S}/work/${s.id}-a.wav'`).join('\n'));
ff('-f', 'concat', '-safe', '0', '-i', `${S}/work/all.txt`, '-c', 'copy', `${S}/work/video.mp4`);
ff('-f', 'concat', '-safe', '0', '-i', `${S}/work/alla.txt`, '-c', 'pcm_s16le', `${S}/work/voice.wav`);
ff('-i', `${S}/work/video.mp4`, '-i', `${S}/work/caps.mov`, '-i', `${S}/work/voice.wav`,
  '-filter_complex', '[0:v][1:v]overlay=0:0:shortest=1[v]', '-map', '[v]', '-map', '2:a', ...V, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', `${S}/out/feefifofum-demo.mp4`);
// clean version without captions, for redubbing over the picture
ff('-i', `${S}/work/video.mp4`, '-i', `${S}/work/voice.wav`, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', `${S}/out/feefifofum-demo-nocaptions.mp4`);
// the script, with timings
fs.writeFileSync(S + '/out/script.md', '# feefifofum demo: voiceover script\n\nEach block is one shot. Times are where the shot starts in the video; the captions (feefifofum-demo.srt) carry the same text with finer timings.\n\n' +
  segs.map((s) => `**${ts(s.start).slice(3, 8)}** (${s.L.toFixed(0)} s)\n\n${s.text}\n`).join('\n'));
console.log('out', probe(`${S}/out/feefifofum-demo.mp4`).toFixed(1), 's');
