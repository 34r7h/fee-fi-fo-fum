// Calls one castle-service MCP tool over Streamable HTTP and prints its result text.
//   node scripts/mcp-call.mjs <mcp-url> [tool (auction_status)] [json-args ({})]
import { Client } from '../../service/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../service/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';

const [url, tool = 'auction_status', args = '{}'] = process.argv.slice(2);
if (!url) { console.error('usage: node scripts/mcp-call.mjs <mcp-url> [tool] [json-args]'); process.exit(2); }
const c = new Client({ name: 'mcp-call', version: '1.0.0' });
await c.connect(new StreamableHTTPClientTransport(new URL(url)));
const r = await c.callTool({ name: tool, arguments: JSON.parse(args) });
console.log(r.content?.[0]?.text ?? JSON.stringify(r));
await c.close();
process.exit(r.isError ? 1 : 0);
