/** Registers the gameball-status tool for on-demand server health and configuration info */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocIndex } from './docs/doc-indexer.js';
import type { ApiEndpoint } from './shared/types.js';
import { CACHE_DIR, DEFAULT_BASE_URL } from './shared/github-cache.js';

export interface StatusInfo {
  docIndex: DocIndex;
  apiEndpoints: Map<string, ApiEndpoint>;
  commitSha: string;
  startedAt: number;
}

function timeAgo(since: number): string {
  const seconds = Math.floor((Date.now() - since) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function registerStatusTool(server: McpServer, info: StatusInfo): void {
  server.registerTool('gameball-status', {
    title: 'Gameball: Server Status',
    description: 'Shows server health, subsystem status, configuration, and cache info.',
    inputSchema: {},
  }, async () => {
    const integrationToolCount = info.apiEndpoints.size;
    const apiKeySet = !!process.env.GAMEBALL_API_KEY;
    const secretKeySet = !!process.env.GAMEBALL_SECRET_KEY;
    const baseUrl = process.env.GAMEBALL_BASE_URL || DEFAULT_BASE_URL;

    const lines: string[] = [
      'Subsystems',
      `  Integration   ${apiKeySet ? 'ready' : 'limited'}   ${integrationToolCount} tools${!apiKeySet ? ' (API key missing)' : ''}`,
      `  Docs          ready    7 tools`,
      '',
      'Configuration',
      `  API Key       ${apiKeySet ? 'configured' : 'not set ← set GAMEBALL_API_KEY'}`,
      `  Secret Key    ${secretKeySet ? 'configured' : 'not set ← set GAMEBALL_SECRET_KEY'}`,
      `  Base URL      ${baseUrl}`,
      '',
      'Cache',
      `  Location      ${CACHE_DIR}`,
      `  Last synced   ${info.commitSha === 'unknown' ? 'not synced' : `${timeAgo(info.startedAt)} (commit ${info.commitSha.slice(0, 7)})`}`,
      `  Docs index    ${info.docIndex.pages.size === 0 ? 'not loaded' : `cached (${info.docIndex.pages.size} pages, ${info.docIndex.chunks.size} chunks)`}`,
    ];

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  });
}
