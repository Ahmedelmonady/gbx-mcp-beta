#!/usr/bin/env node
/** Entry point — starts the MCP server over stdio transport */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

try {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (err) {
  process.stderr.write(`[gameball-integrations] Fatal: ${err}\n`);
  process.exit(1);
}
