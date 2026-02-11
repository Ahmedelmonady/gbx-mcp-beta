/** Creates and configures the MCP server with docs + integration tools */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getLatestCommitSha, DEFAULT_BASE_URL } from './shared/github-cache.js';
import { parseOpenApi } from './shared/openapi-parser.js';
import { initializeDocsSubsystem, registerDocTools } from './docs/index.js';
import { emptyDocIndex, type DocIndex } from './docs/doc-indexer.js';
import { createGameballClient, registerIntegrationTools } from './integration/index.js';
import { fetchOpenApiSpec } from './integration/openapi-fetcher.js';
import { registerStatusTool } from './status-tool.js';
import type { ApiEndpoint } from './shared/types.js';

export async function createServer(): Promise<McpServer> {
  let docIndex: DocIndex = emptyDocIndex();
  let apiEndpoints = new Map<string, ApiEndpoint>();
  let commitSha = 'unknown';

  try {
    process.stderr.write('Checking for updates...\n');
    commitSha = await getLatestCommitSha();

    process.stderr.write('Loading...\n');
    const [fetchedDocIndex, openapiJson] = await Promise.all([
      initializeDocsSubsystem(commitSha),
      fetchOpenApiSpec(commitSha),
    ]);

    docIndex = fetchedDocIndex;
    if (openapiJson) {
      apiEndpoints = parseOpenApi(openapiJson);
    }
  } catch (err) {
    process.stderr.write(`Failed to fetch from GitHub: ${err}. Starting with limited functionality.\n`);
  }

  const client = createGameballClient({
    baseUrl: process.env.GAMEBALL_BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.GAMEBALL_API_KEY || '',
    secretKey: process.env.GAMEBALL_SECRET_KEY,
  });

  const server = new McpServer({
    name: 'gameball-integrations',
    version: '1.0.0',
  });

  registerDocTools(server, docIndex, apiEndpoints);
  registerIntegrationTools(server, client, apiEndpoints);
  registerStatusTool(server, {
    docIndex,
    apiEndpoints,
    commitSha,
    startedAt: Date.now(),
  });

  const toolCount = 7 + apiEndpoints.size + 1;
  process.stderr.write(`Ready — ${toolCount} tools\n`);

  return server;
}
