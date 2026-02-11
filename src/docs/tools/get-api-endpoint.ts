/** Looks up API endpoints with compact search results or full detail view */

import type { ApiEndpoint } from '../../shared/types.js';
import { generateCode } from '../codegen.js';

function formatCompact(ep: ApiEndpoint): string {
  return `- **${ep.method}** \`${ep.path}\` — ${ep.summary}`;
}

/** Full formatted endpoint with params, schemas, curl, and language prompt */
function formatFull(ep: ApiEndpoint): string {
  const lines = [
    `## ${ep.method} \`${ep.path}\``,
    '',
    ep.summary ? ep.summary : null,
    ep.description ? `\n${ep.description}` : null,
    '',
    `| Detail | Value |`,
    `|--------|-------|`,
    `| **Method** | \`${ep.method}\` |`,
    `| **Path** | \`${ep.path}\` |`,
    ep.tags.length ? `| **Tags** | ${ep.tags.join(', ')} |` : null,
    `| **Auth** | \`APIKey\` + \`SecretKey\` headers |`,
  ];

  if (ep.parameters.length) {
    lines.push('', '### Parameters', '');
    lines.push('| Name | In | Type | Req | Description |');
    lines.push('|------|----|------|-----|-------------|');
    for (const p of ep.parameters) {
      lines.push(`| \`${p.name}\` | ${p.in} | ${p.type} | ${p.required ? 'Y' : 'N'} | ${p.description} |`);
    }
  }

  if (ep.requestBody) {
    lines.push('', '### Request Body', '', ep.requestBody);
  }

  if (Object.keys(ep.responses).length) {
    lines.push('', '### Responses');
    for (const [code, detail] of Object.entries(ep.responses)) {
      lines.push('', `**${code}** — ${detail.description}`);
      if (detail.schema) lines.push('', detail.schema);
    }
  }

  lines.push('', '### cURL', '', '```bash', generateCode(ep, 'curl'), '```');
  lines.push('', '_Use **generate-code-example** for javascript, python, csharp, go, php, or java._');

  return lines.filter(Boolean).join('\n');
}

/** Looks up API endpoints — compact list for search, full detail for specific lookups */
export function getApiEndpoint(
  endpoints: Map<string, ApiEndpoint>,
  options: { endpoint?: string; method?: string; search?: string }
): string {
  // Specific endpoint+method → full detail
  if (options.endpoint) {
    const path = options.endpoint.startsWith('/') ? options.endpoint : '/' + options.endpoint;
    const method = options.method?.toUpperCase();

    if (method) {
      const ep = endpoints.get(`${method} ${path}`);
      return ep ? formatFull(ep) : `Endpoint not found: ${method} ${path}`;
    }

    const matching = [...endpoints.values()].filter(e => e.path === path);
    if (matching.length) return matching.map(formatFull).join('\n\n---\n\n');
    return `No endpoints for path: ${path}`;
  }

  // Search → compact list (saves tokens)
  if (options.search) {
    const q = options.search.toLowerCase();
    const matching = [...endpoints.values()].filter(e =>
      e.summary.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.tags.some(t => t.toLowerCase().includes(q)) ||
      e.path.toLowerCase().includes(q)
    );
    if (!matching.length) return `No endpoints matching "${options.search}".`;
    const list = matching.slice(0, 15).map(formatCompact).join('\n');
    return `Found ${matching.length} endpoint(s):\n\n${list}\n\n_Use **get-api-endpoint** with a specific endpoint path and method for full details._`;
  }

  // No params → grouped compact list
  const grouped = new Map<string, string[]>();
  for (const ep of endpoints.values()) {
    const tag = ep.tags[0] || 'Other';
    if (!grouped.has(tag)) grouped.set(tag, []);
    grouped.get(tag)!.push(formatCompact(ep));
  }

  return [...grouped.entries()].map(([tag, eps]) =>
    `**${tag}**\n${eps.join('\n')}`
  ).join('\n\n');
}
