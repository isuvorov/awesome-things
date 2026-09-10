import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '../utils/mcp-server.js';
import { errorMessage } from './errors.js';
import { MCP_CORS_HEADERS } from './http.js';
import { logError } from './logger.js';

export interface McpFinishInfo {
  /** HTTP status actually sent to the client. */
  status: number;
  /** Error text returned by a tool (`isError: true` in the MCP result). */
  toolError?: string;
}

/** How an MCP request reports itself to the request log. */
export interface McpLogSink {
  /** Called synchronously when the log line has to wait for a streamed response. */
  defer(): void;
  /** Called once, when the response is fully written or aborted. */
  finish(info: McpFinishInfo): void;
}

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function jsonRpcError(message: string, status: number, extraHeaders?: HeadersInit): Response {
  return withCors(
    new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }), {
      status,
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
    }),
  );
}

/** Pull the tool error (if any) out of the SSE payload the transport wrote. */
function extractToolError(sseText: string): string | undefined {
  try {
    const dataMatch = sseText.match(/^data: (.+)$/m);
    if (!dataMatch?.[1]) return undefined;
    const rpcBody = JSON.parse(dataMatch[1]);
    if (!rpcBody?.result?.isError) return undefined;
    const content = rpcBody.result.content;
    if (!Array.isArray(content)) return undefined;
    const textItem = content.find((item: { type?: string }) => item?.type === 'text');
    return typeof textItem?.text === 'string' ? textItem.text : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Handle one MCP-over-HTTP request in stateless mode: a fresh transport + server
 * per request, always torn down once the response is done.
 *
 * GET is answered with 405 on purpose. In stateless mode the server never pushes
 * anything to the client, so an SSE stream opened by GET would just hang forever —
 * that is exactly the connection Bun eventually aborts, which used to take the
 * whole process down. The MCP spec allows 405 for endpoints without server-initiated streams.
 */
export async function handleMcpRequest(req: Request, log: McpLogSink): Promise<Response> {
  if (req.method === 'GET') {
    log.finish({ status: 405 });
    return jsonRpcError(
      'Method Not Allowed: this endpoint does not offer server-initiated SSE streams',
      405,
      { Allow: 'POST, DELETE, OPTIONS' },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport();
  const mcpServer = createMcpServer();

  let closed = false;
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    try {
      await transport.close();
    } catch {}
    try {
      await mcpServer.close();
    } catch {}
  };

  let response: Response;
  try {
    await mcpServer.connect(transport);
    response = withCors(await transport.handleRequest(req));
  } catch (err) {
    await cleanup();
    logError('MCP request failed', err);
    log.finish({ status: 500, toolError: errorMessage(err) });
    return jsonRpcError(`MCP request failed: ${errorMessage(err)}`, 500);
  }

  if (!response.body) {
    await cleanup();
    log.finish({ status: response.status });
    return response;
  }

  // Tap the stream: collect the payload for logging, then tear everything down.
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      chunks.push(decoder.decode(chunk, { stream: true }));
      controller.enqueue(chunk);
    },
    flush() {
      void cleanup();
      log.finish({ status: response.status, toolError: extractToolError(chunks.join('')) });
    },
  });

  response.body.pipeTo(writable).catch((err) => {
    // Client disconnected mid-stream (common with cloud MCP proxies). flush()
    // never runs on abort, so clean up and log the request here instead.
    void cleanup();
    log.finish({
      status: response.status,
      toolError: `client disconnected mid-stream: ${errorMessage(err)}`,
    });
  });

  // From here the log line waits for the stream to end.
  log.defer();
  return new Response(readable, { status: response.status, headers: response.headers });
}
