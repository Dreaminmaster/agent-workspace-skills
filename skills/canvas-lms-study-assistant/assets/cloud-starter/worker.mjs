import { routedTools, sourceTools, authTool, query } from './router.mjs';
import { browserRoute, browserService, fallbackTarget, indexRead } from './browser.mjs';

const pingTool = {
  name: 'ping',
  description: 'Verify the private Canvas Study plugin connection. Returns a fixed marker and server UTC time. Does not access Canvas.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
};
export default {
  async fetch(request, env, ctx) {
    if(ctx?.waitUntil) env={...env,enqueueIndex:work=>ctx.waitUntil(work)};
    if (new URL(request.url).pathname !== '/mcp') {
      if (!env.OWNER_EMAIL || request.headers.get('oai-authenticated-user-email')?.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) return new Response('Owner identity required', { status: 403 });
      return browserRoute(request, env, query);
    }
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    let message;
    try { message = await request.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
    if (!('id' in message)) return new Response(null, { status: 202 });
    let result;
    switch (message.method) {
      case 'initialize':
        result = { protocolVersion: message.params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'Canvas Study', version: '0.5.1' } }; break;
      case 'ping': result = {}; break;
      case 'tools/list': result = { tools: [pingTool, authTool, ...sourceTools, ...routedTools] }; break;
      case 'tools/call':
        if (message.params?.name === 'ping') {
          result = { content: [{ type: 'text', text: JSON.stringify({ marker: 'CANVAS_STUDY_PING_OK', utc: new Date().toISOString(), canvasTokenConfigured: Boolean(env.CANVAS_API_TOKEN) }) }] };
        } else {
          if (!env.OWNER_EMAIL || request.headers.get('oai-authenticated-user-email')?.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) return new Response('Owner identity required', { status: 403 });
          if (![authTool,...sourceTools,...routedTools].some(t => t.name === message.params?.name)) return Response.json({ jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'Unknown tool'} });
          try {
            const data = await query(message.params.name,message.params.arguments||{},env);
            result = {isError:data.status==='unavailable',content:[{type:'text',text:JSON.stringify(data)}]};
          } catch { result = {isError:true,content:[{type:'text',text:'Invalid or unsupported Canvas query. No credentials were changed.'}]}; }

        }
        break;
      default: return Response.json({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } });
    }
    return Response.json({ jsonrpc: '2.0', id: message.id, result });
  }
};
