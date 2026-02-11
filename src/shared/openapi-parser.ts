/** Parses an OpenAPI JSON document into structured ApiEndpoint objects with resolved $refs */

import type { ApiEndpoint, ApiParameter, ResponseDetail } from './types.js';

type OpenApiDoc = {
  paths: Record<string, Record<string, OpenApiOp>>;
  components?: { schemas?: Record<string, unknown> };
};

type OpenApiOp = {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses?: Record<string, Record<string, unknown>>;
};

/** Resolves a $ref pointer within the OpenAPI document */
function resolveRef(doc: OpenApiDoc, ref: string): Record<string, unknown> {
  const parts = ref.replace('#/', '').split('/');
  let current: unknown = doc;
  for (const part of parts) {
    current = (current as Record<string, unknown>)[part];
    if (current === undefined) return {};
  }
  return current as Record<string, unknown>;
}

/** Recursively summarizes a JSON schema into a human-readable string */
function summarizeSchema(doc: OpenApiDoc, schema: Record<string, unknown>, indent = 0): string {
  if (schema['$ref']) {
    return summarizeSchema(doc, resolveRef(doc, schema['$ref'] as string), indent);
  }

  const pad = '  '.repeat(indent);
  const type = schema['type'] as string;

  if (type === 'object' && schema['properties']) {
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    const required = (schema['required'] as string[]) || [];
    const lines: string[] = [];
    for (const [name, prop] of Object.entries(props)) {
      const resolved = prop['$ref'] ? resolveRef(doc, prop['$ref'] as string) : prop;
      const pType = (resolved['type'] as string) || 'object';
      const req = required.includes(name) ? ', required' : '';
      const desc = resolved['description'] ? `: ${resolved['description']}` : '';
      lines.push(`${pad}- ${name} (${pType}${req})${desc}`);
      if (pType === 'object' && resolved['properties']) {
        lines.push(summarizeSchema(doc, resolved, indent + 1));
      }
      if (pType === 'array' && resolved['items']) {
        const items = resolved['items'] as Record<string, unknown>;
        lines.push(`${pad}  items: ${summarizeSchema(doc, items['$ref'] ? resolveRef(doc, items['$ref'] as string) : items, indent + 2)}`);
      }
    }
    return lines.join('\n');
  }

  if (type === 'array' && schema['items']) {
    const items = schema['items'] as Record<string, unknown>;
    return `${pad}array of ${(items['type'] as string) || 'object'}`;
  }

  return `${pad}${type || 'unknown'}`;
}

/** Parses an OpenAPI JSON string into a map of ApiEndpoint objects */
export function parseOpenApi(json: string): Map<string, ApiEndpoint> {
  const doc: OpenApiDoc = JSON.parse(json);
  const endpoints = new Map<string, ApiEndpoint>();

  for (const [path, methods] of Object.entries(doc.paths || {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'delete', 'patch'].indexOf(method) === -1) continue;

      const params: ApiParameter[] = (op.parameters || []).map(p => {
        const resolved = p['$ref'] ? resolveRef(doc, p['$ref'] as string) : p;
        const schema = (resolved['schema'] as Record<string, unknown>) || {};
        return {
          name: (resolved['name'] as string) || '',
          in: (resolved['in'] as string) || '',
          required: (resolved['required'] as boolean) || false,
          description: (resolved['description'] as string) || '',
          type: (schema['type'] as string) || 'string',
        };
      });

      let requestBody: string | undefined;
      let requestBodySchema: Record<string, unknown> | undefined;
      if (op.requestBody) {
        const content = (op.requestBody['content'] as Record<string, Record<string, unknown>>) || {};
        const jsonContent = content['application/json'];
        if (jsonContent?.['schema']) {
          let schema = jsonContent['schema'] as Record<string, unknown>;
          if (schema['$ref']) {
            schema = resolveRef(doc, schema['$ref'] as string);
          }
          requestBodySchema = schema;
          requestBody = summarizeSchema(doc, schema);
        }
      }

      const responses: Record<string, ResponseDetail> = {};
      for (const [code, resp] of Object.entries(op.responses || {})) {
        const detail: ResponseDetail = {
          description: (resp['description'] as string) || '',
        };
        const respContent = (resp['content'] as Record<string, Record<string, unknown>>) || {};
        const respJson = respContent['application/json'];
        if (respJson?.['schema']) {
          detail.schema = summarizeSchema(doc, respJson['schema'] as Record<string, unknown>);
        }
        responses[code] = detail;
      }

      const security = op.security ?? [];
      const requiresSecretKey = security.some(scheme => 'secretKey' in scheme);

      const key = `${method.toUpperCase()} ${path}`;
      endpoints.set(key, {
        method: method.toUpperCase(),
        path,
        summary: op.summary || '',
        description: op.description || '',
        tags: op.tags || [],
        operationId: op.operationId,
        requiresSecretKey,
        parameters: params,
        requestBody,
        requestBodySchema,
        responses,
      });
    }
  }

  return endpoints;
}
