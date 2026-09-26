// castle service HTTP surface (docs/SPEC.md "The castle service"):
//   GET  /ccip/{sender}/{data}.json, POST /ccip   the ERC-3668 gateway for quote.feefifofum.eth (gateway.mjs)
//   POST /mcp            MCP over Streamable HTTP (stateless): castle_status, castle_quote, castle_fill,
//                        castle_allocations, castle_route
//   GET  /tools          tool list;  POST /tools/<name>  the same tools as REST (JSON body in, JSON out)
//   GET  /stream         SSE, miniapp/STREAM.md v2 (snapshot first, id = seq, Last-Event-ID resumes, ping 15s)
//   GET  /state          the snapshot as JSON
//   POST /report         a crew member's signed report (report.mjs)
//   GET  /fo/next, POST /fo/answer   fo's signed poll for castle_route orders, when FO_URL is unset (fo.mjs)
//   GET  /health
// CORS is open (Access-Control-Allow-Origin: *): the miniapp reads this cross-origin from handoff.lol, and CCIP-Read
// clients call the gateway from anywhere. Every gateway answer and refusal is one JSON log line on stdout.
import http from 'node:http';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { env } from './config.mjs';
import { tools } from './tools.mjs';
import { bus, since } from './stream.mjs';
import { start, snapshot, health } from './indexer.mjs';
import { route as gateway } from './gateway.mjs';
import { acceptReport } from './report.mjs';
import { fiStatus } from './fi.mjs';
import { next as foNext, answer as foAnswer, foPolling } from './fo.mjs';

const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
const log = (o) => console.log(json({ t: new Date().toISOString(), ...o }));
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, accept, last-event-id, mcp-session-id, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id',
};
function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', ...CORS });
  res.end(json(body));
}
async function readBody(req) {
  const chunks = [];
  let n = 0;
  for await (const c of req) { n += c.length; if (n > 1_000_000) throw Object.assign(new Error('body too large'), { status: 413 }); chunks.push(c); }
  const s = Buffer.concat(chunks).toString('utf8');
  try { return s ? JSON.parse(s) : {}; } catch { throw Object.assign(new Error('body is not JSON'), { status: 400 }); }
}

function mcpServer() {
  const server = new McpServer({ name: 'castle', version: '0.2.0' });
  for (const [name, t] of Object.entries(tools)) {
    server.registerTool(name, { description: t.description, inputSchema: t.input }, async (args) => {
      try {
        const out = await t.run(args || {});
        return { content: [{ type: 'text', text: json(out) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: String(e?.shortMessage || e?.message || e) }] };
      }
    });
  }
  return server;
}

// SSE. Behind a proxy that buffers whole responses (the handoff tunnel relays a response only once it ends),
// a never-ending stream would never arrive. CASTLE_SSE_WINDOW_MS (or ?window=ms) closes each response after
// that window; EventSource reconnects on its own with Last-Event-ID (retry: 250), so the page still sees every
// event in order, just batched per window. 0 (the default) is a normal persistent stream.
function sse(req, res) {
  const url = new URL(req.url, 'http://x');
  const windowMs = Number(url.searchParams.get('window') ?? process.env.CASTLE_SSE_WINDOW_MS ?? 0);
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', ...CORS });
  const frame = (ev) => res.write(`id: ${ev.seq}\nevent: ${ev.type}\ndata: ${json(ev)}\n\n`);
  const last = Number(req.headers['last-event-id'] || url.searchParams.get('since') || NaN);
  if (windowMs > 0) res.write('retry: 250\n\n');
  if (Number.isFinite(last) && last > 0) {
    for (const ev of since(last)) frame(ev);   // a resume: the missed events, no second snapshot
  } else {
    const snap = snapshot();
    res.write(`id: ${snap.seq}\nevent: snapshot\ndata: ${json(snap)}\n\n`);
    if (last === 0) for (const ev of since(0)) frame(ev);   // ?since=0 replays the whole history after the snapshot
  }
  const on = (ev) => frame(ev);
  bus.on('event', on);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  const end = windowMs > 0 ? setTimeout(() => res.end(), windowMs) : null;
  req.on('close', () => { clearInterval(ping); clearTimeout(end); bus.off('event', on); });
}

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    if (p === '/ccip' || p.startsWith('/ccip/')) { await gateway(req, res, p, send, readBody, log); return; }
    if (p === '/mcp') {
      if (req.method !== 'POST') { send(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'POST only (stateless Streamable HTTP)' }, id: null }); return; }
      for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
      const body = await readBody(req);
      const server = mcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }
    if (p === '/stream' && req.method === 'GET') return sse(req, res);
    if (p === '/state' && req.method === 'GET') return send(res, 200, snapshot());
    if (p === '/health') return send(res, 200, { ok: true, ...fiStatus(), foPolling: foPolling(), ...health() });
    if (p === '/report' && req.method === 'POST') {
      try { return send(res, 200, await acceptReport(await readBody(req))); }
      catch (e) { log({ report: 'refused', status: e.status || 500, message: e.message }); return send(res, e.status || 500, { error: e.message }); }
    }
    if (p === '/fo/next' && req.method === 'GET') {
      try {
        const job = await foNext(req.headers, url.searchParams, Math.min(15_000, Number(url.searchParams.get('wait') ?? 10_000)));
        if (!job) { res.writeHead(204, CORS); res.end(); return; }
        return send(res, 200, job);
      } catch (e) { return send(res, e.status || 500, { error: e.message }); }
    }
    if (p === '/fo/answer' && req.method === 'POST') {
      try { return send(res, 200, await foAnswer(await readBody(req))); }
      catch (e) { return send(res, e.status || 500, { error: e.message }); }
    }
    if (p === '/tools' && req.method === 'GET') return send(res, 200, { tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, params: Object.keys(t.input) })) });
    const m = p.match(/^\/tools\/([a-z_]+)$/);
    if (m && req.method === 'POST') {
      const t = tools[m[1]];
      if (!t) return send(res, 404, { error: `no tool ${m[1]}` });
      // The same input schema the MCP tool enforces, so a REST call gets a validation error, not a TypeError.
      const parsed = z.object(t.input).safeParse(await readBody(req));
      if (!parsed.success) return send(res, 400, { error: 'invalid arguments', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
      try { return send(res, 200, await t.run(parsed.data)); }
      catch (e) { return send(res, 400, { error: String(e?.shortMessage || e?.message || e) }); }
    }
    if (p === '/') return send(res, 200, { service: 'castle', gateway: '/ccip/{sender}/{data}.json', mcp: '/mcp', tools: '/tools', stream: '/stream', state: '/state', health: '/health' });
    send(res, 404, { error: 'not found' });
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: String(e?.message || e) });
  }
});

start();
srv.listen(env.port, () => log({ service: 'castle', port: env.port, rpcs: env.rpcs.length, ...fiStatus() }));
