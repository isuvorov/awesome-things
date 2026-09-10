#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { formatError } from './server/errors.js';
import { installProcessGuards } from './server/guards.js';
import { createMcpServer } from './utils/mcp-server.js';

export async function startMcpServer() {
  // Same as the HTTP server: a stray rejection must not kill a long-lived MCP process.
  installProcessGuards();

  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  startMcpServer().catch((error) => {
    // stdout belongs to the MCP protocol — diagnostics go to stderr.
    console.error(`MCP server failed to start:\n${formatError(error)}`);
    process.exit(1);
  });
}
