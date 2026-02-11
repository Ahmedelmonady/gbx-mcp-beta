/** Public API for the docs subsystem — initialization and tool registration */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchDocs } from './fetcher.js';
import { indexDocs, type DocIndex } from './doc-indexer.js';
import { searchDocs } from './tools/search-docs.js';
import { getDoc } from './tools/get-doc.js';
import { listSections } from './tools/list-sections.js';
import { getApiEndpoint } from './tools/get-api-endpoint.js';
import { generateCodeExample } from './tools/generate-code-example.js';
import { getTutorial } from './tools/get-tutorial.js';
import { lookupTopic } from './tools/lookup-topic.js';
import type { ApiEndpoint } from '../shared/types.js';

/** Initializes the documentation subsystem by fetching and indexing docs from GitHub */
export async function initializeDocsSubsystem(sha: string): Promise<DocIndex> {
  const files = await fetchDocs(sha);
  return indexDocs(files);
}

/** Registers all 7 documentation tools with the MCP server using docs- prefix */
export function registerDocTools(
  server: McpServer,
  docIndex: DocIndex,
  apiEndpoints: Map<string, ApiEndpoint>
): void {
  // Tool 1: docs-lookup-topic (START HERE for broad questions)
  server.registerTool('docs-lookup-topic', {
    title: 'Docs: Lookup Topic',
    description: 'START HERE. Comprehensive single-call lookup that returns tutorials, related docs, AND relevant API endpoints for a topic. Use this first for any broad question (e.g. "how to create an order with redemption", "referral setup", "customer management"). Only use the other tools if you need to drill deeper into a specific page or endpoint.',
    inputSchema: {
      topic: z.string().describe('Topic to look up, e.g. "order redemption", "referral", "points"'),
    },
  }, async ({ topic }) => ({
    content: [{ type: 'text' as const, text: lookupTopic(docIndex, apiEndpoints, topic) }],
  }));

  // Tool 2: docs-get-doc (drill into a specific page)
  server.registerTool('docs-get-doc', {
    title: 'Docs: Get Doc Page',
    description: 'Get the full content of a specific doc page by path. Use after docs-lookup-topic when you need to read a specific page in full.',
    inputSchema: {
      path: z.string().describe('Document path, e.g. "installation-guide/web/getting-started"'),
    },
  }, async ({ path }) => ({
    content: [{ type: 'text' as const, text: getDoc(docIndex, path) }],
  }));

  // Tool 3: docs-get-api-endpoint (drill into a specific endpoint)
  server.registerTool('docs-get-api-endpoint', {
    title: 'Docs: Get API Endpoint',
    description: 'Get full details of a specific REST API endpoint including parameters, request/response schemas, and a cURL example. Use after docs-lookup-topic when you need details on a specific endpoint.',
    inputSchema: {
      endpoint: z.string().optional().describe('API path, e.g. "/api/v4.0/integrations/transactions/hold"'),
      method: z.string().optional().describe('HTTP method: GET, POST, PUT, DELETE'),
      search: z.string().optional().describe('Search by keyword in endpoint summaries'),
    },
  }, async ({ endpoint, method, search }) => ({
    content: [{ type: 'text' as const, text: getApiEndpoint(apiEndpoints, { endpoint, method, search }) }],
  }));

  // Tool 4: docs-generate-code-example
  server.registerTool('docs-generate-code-example', {
    title: 'Docs: Generate Code Example',
    description: 'Generate a code example for a Gameball API endpoint in a specific programming language. Use when the user asks for code in a specific language (not cURL, which is already included in docs-get-api-endpoint).',
    inputSchema: {
      endpoint: z.string().describe('API path, e.g. "/api/v4.0/integrations/customers"'),
      method: z.string().describe('HTTP method: GET, POST, PUT, DELETE'),
      language: z.string().describe('Language: javascript, python, csharp, go, php, java'),
      body: z.string().optional().describe('Optional JSON request body to include'),
    },
  }, async ({ endpoint, method, language, body }) => ({
    content: [{ type: 'text' as const, text: generateCodeExample(apiEndpoints, endpoint, method, language, body) }],
  }));

  // Tool 5: docs-search-docs (narrower search)
  server.registerTool('docs-search-docs', {
    title: 'Docs: Search Docs',
    description: 'Full-text search across all Gameball docs. Returns titles and snippets. Use when docs-lookup-topic did not find what you need or you need to search within a specific section.',
    inputSchema: {
      query: z.string().describe('Search query'),
      section: z.string().optional().describe('Filter by section: API Reference, Tutorials, Installation Guide, etc.'),
      limit: z.number().optional().describe('Max results (default 5)'),
    },
  }, async ({ query, section, limit }) => ({
    content: [{ type: 'text' as const, text: searchDocs(docIndex, query, section, limit) }],
  }));

  // Tool 6: docs-list-sections (browsing)
  server.registerTool('docs-list-sections', {
    title: 'Docs: List Sections',
    description: 'List the documentation structure: tabs, sections, and page slugs. Use when the user wants to browse available topics or you need to discover page paths.',
    inputSchema: {
      section: z.string().optional().describe('Drill into a specific section by name'),
    },
  }, async ({ section }) => ({
    content: [{ type: 'text' as const, text: listSections(docIndex, section) }],
  }));

  // Tool 7: docs-get-tutorial (specific tutorial)
  server.registerTool('docs-get-tutorial', {
    title: 'Docs: Get Tutorial',
    description: 'Get a specific Gameball tutorial by topic. Use when you need the full step-by-step tutorial content. For broad questions, use docs-lookup-topic instead.',
    inputSchema: {
      topic: z.string().describe('Tutorial topic, e.g. "referral", "points-redemption", "order-handling"'),
    },
  }, async ({ topic }) => ({
    content: [{ type: 'text' as const, text: getTutorial(docIndex, topic) }],
  }));
}
