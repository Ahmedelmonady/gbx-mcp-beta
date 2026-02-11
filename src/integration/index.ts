/** Public API for the integration subsystem — client creation and tool registration */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GameballClient, type HttpClientConfig } from './http-client.js';
import { generateToolsFromOpenApi } from './generator.js';
import type { ApiEndpoint } from '../shared/types.js';

/** Creates a GameballClient with the provided configuration */
export function createGameballClient(config: HttpClientConfig): GameballClient {
  return new GameballClient(config);
}

/** Registers all 71 integration tools auto-generated from OpenAPI spec */
export function registerIntegrationTools(
  server: McpServer,
  client: GameballClient,
  apiEndpoints: Map<string, ApiEndpoint>
): void {
  generateToolsFromOpenApi(server, client, apiEndpoints);
}
