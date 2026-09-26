// castle service HTTP surface:
//   POST /mcp            MCP over Streamable HTTP (stateless), the seven castle tools
//   GET  /tools          tool list;  POST /tools/<name>  the same tools as REST (JSON body in, JSON out)
//   GET  /stream         SSE, miniapp/STREAM.md v1 (snapshot first, id = seq, Last-Event-ID resumes, ping 15s)
//   GET  /state          the snapshot as JSON
//   GET  /fills?from_block=N   every fill attempt since N, reverted ones included
//   GET  /health
// CORS is open (Access-Control-Allow-Origin: *): the miniapp reads this cross-origin from handoff.lol.
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { env } from './config.mjs';
import { tools } from './tools.mjs';
import { bus, start, snapshot, since, fillsFrom, health } from './indexer.mjs';

const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
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
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

function mcpServer() {
  const server = new McpServer({ name: 'castle', version: '0.1.0' });
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

function sse(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', ...CORS });
  const frame = (ev) => res.write(`id: ${ev.seq}\nevent: ${ev.type}\ndata: ${json(ev)}\n\n`);
  const snap = snapshot();
  res.write(`id: ${snap.seq}\nevent: snapshot\ndata: ${json(snap)}\n\n`);
  const last = Number(req.headers['last-event-id'] || new URL(req.url, 'http://x').searchParams.get('since') || NaN);
  if (Number.isFinite(last)) for (const ev of since(last)) frame(ev);
  const on = (ev) => frame(ev);
  bus.on('event', on);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => { clearInterval(ping); bus.off('event', on); });
}

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
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
    if (p === '/fills' && req.method === 'GET') return send(res, 200, { fills: fillsFrom(Number(url.searchParams.get('from_block') || 0)) });
    if (p === '/health') return send(res, 200, { ok: true, ...health() });
    if (p === '/tools' && req.method === 'GET') return send(res, 200, { tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, params: Object.keys(t.input) })) });
    const m = p.match(/^\/tools\/([a-z_]+)$/);
    if (m && req.method === 'POST') {
      const t = tools[m[1]];
      if (!t) return send(res, 404, { error: `no tool ${m[1]}` });
      try { return send(res, 200, await t.run(await readBody(req))); }
      catch (e) { return send(res, 400, { error: String(e?.shortMessage || e?.message || e) }); }
    }
    if (p === '/') return send(res, 200, { service: 'castle', mcp: '/mcp', tools: '/tools', stream: '/stream', state: '/state', fills: '/fills', health: '/health' });
    send(res, 404, { error: 'not found' });
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: String(e?.message || e) });
  }
});

start();
srv.listen(env.port, () => console.log(`castle service on :${env.port} (rpcs: ${env.rpcs.length})`));
