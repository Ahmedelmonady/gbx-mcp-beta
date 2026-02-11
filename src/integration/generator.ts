/** Auto-generates MCP tools from OpenAPI spec with smart adaptive verbosity */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GameballClient } from './http-client.js';
import type { ApiEndpoint } from '../shared/types.js';

/** Generates all integration tools from OpenAPI specification */
export function generateToolsFromOpenApi(
  server: McpServer,
  client: GameballClient,
  apiEndpoints: Map<string, ApiEndpoint>
): void {
  for (const [, endpoint] of apiEndpoints.entries()) {
    if (!endpoint.operationId) continue;

    const description = generateMinimalDescription(endpoint);
    const inputSchema = generateSmartSchema(endpoint);

    server.registerTool(endpoint.operationId, {
      description,
      inputSchema,
    }, async (input) => ({
      content: [{
        type: 'text' as const,
        text: await client.request({
          method: endpoint.method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE',
          path: interpolatePath(endpoint.path, input as Record<string, string>),
          body: input,
          requiresSecretKey: endpoint.requiresSecretKey,
        })
      }]
    }));
  }
}

/** Generates minimal 3-5 word tool description */
function generateMinimalDescription(endpoint: ApiEndpoint): string {
  const verbMap: Record<string, string> = {
    'GET': 'Get',
    'POST': 'Create',
    'PUT': 'Update',
    'DELETE': 'Delete',
    'PATCH': 'Update'
  };
  const verb = verbMap[endpoint.method.toUpperCase()] || endpoint.method;

  // Extract resource from path
  const segments = endpoint.path.split('/').filter(s => s && !s.startsWith('{'));
  const resource = segments[segments.length - 1] || 'resource';
  const singular = resource.replace(/s$/, ''); // Remove plural

  const prefix = endpoint.requiresSecretKey ? '🔒 ' : '';

  // Special cases
  if (endpoint.path.includes('/hold')) return `${prefix}Hold points`;
  if (endpoint.path.includes('/release')) return `${prefix}Release points`;
  if (endpoint.path.includes('/balance')) return `${prefix}Get balance`;
  if (endpoint.path.includes('/redeem')) return `${prefix}Redeem points`;
  if (endpoint.path.includes('/reverse')) return `${prefix}Reverse transaction`;

  return `${prefix}${verb} ${singular}`;
}

/** Generates Zod schema with smart adaptive verbosity */
function generateSmartSchema(endpoint: ApiEndpoint): Record<string, z.ZodTypeAny> {
  const schema: Record<string, z.ZodTypeAny> = {};

  // Add path parameters
  const pathParams = extractPathParams(endpoint.path);
  for (const paramName of pathParams) {
    // Path params are always required strings
    if (!isObviousField(paramName)) {
      schema[paramName] = z.string().describe(paramName.replace(/([A-Z])/g, ' $1').trim());
    } else {
      schema[paramName] = z.string();
    }
  }

  // Add query/body parameters from requestBodySchema
  if (endpoint.requestBodySchema) {
    const bodySchema = endpoint.requestBodySchema;
    const properties = bodySchema.properties as Record<string, Record<string, unknown>> | undefined;
    const required = (bodySchema.required as string[]) || [];

    if (properties) {
      for (const [fieldName, fieldSchema] of Object.entries(properties)) {
        const isRequired = required.includes(fieldName);
        const zodType = mapSchemaToZod(fieldName, fieldSchema, isRequired);
        schema[fieldName] = zodType;
      }
    }
  }

  // Add explicit parameters
  for (const param of endpoint.parameters) {
    if (param.in === 'path') continue; // Already handled above

    const zodType = z.string();
    if (!isObviousField(param.name)) {
      schema[param.name] = param.required
        ? zodType.describe(abbreviate(param.description, 30))
        : zodType.optional().describe(abbreviate(param.description, 30));
    } else {
      schema[param.name] = param.required ? zodType : zodType.optional();
    }
  }

  return schema;
}

/** Maps OpenAPI schema to Zod type with adaptive verbosity */
function mapSchemaToZod(
  fieldName: string,
  schema: Record<string, unknown>,
  isRequired: boolean
): z.ZodTypeAny {
  const type = schema.type as string | undefined;
  const description = schema.description as string | undefined;
  const enumValues = schema.enum as string[] | undefined;
  const format = schema.format as string | undefined;

  let zodType: z.ZodTypeAny;

  // Handle enums (RULE 3)
  if (enumValues && enumValues.length > 0) {
    zodType = z.enum(enumValues as [string, ...string[]]);
    const options = enumValues.slice(0, 4).join(', ');
    const suffix = enumValues.length > 4 ? '...' : '';
    zodType = zodType.describe(`Options: ${options}${suffix}`);
    return isRequired ? zodType : zodType.optional();
  }

  // Handle arrays
  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined;
    const itemType = items?.type as string | undefined;
    const itemSchema = itemType === 'string' ? z.string() : z.any();
    zodType = z.array(itemSchema);

    // RULE 2: Complex types need description
    if (description && !isObviousField(fieldName)) {
      zodType = zodType.describe(abbreviate(description, 25));
    }
    return isRequired ? zodType : zodType.optional();
  }

  // Handle objects (RULE 2)
  if (type === 'object') {
    zodType = z.record(z.any());
    if (description) {
      zodType = zodType.describe(abbreviate(description, 25));
    } else if (isAmbiguous(fieldName)) {
      zodType = zodType.describe('Custom key-value data');
    }
    return isRequired ? zodType : zodType.optional();
  }

  // Handle primitives
  switch (type) {
    case 'string':
      zodType = z.string();
      break;
    case 'number':
    case 'integer':
      zodType = z.number();
      break;
    case 'boolean':
      zodType = z.boolean();
      break;
    default:
      zodType = z.any();
  }

  // Apply smart adaptive rules

  // RULE 1: Skip obvious fields
  if (isObviousField(fieldName)) {
    return isRequired ? zodType : zodType.optional();
  }

  // RULE 4: Format hints
  if (format && needsFormatHint(format, fieldName)) {
    zodType = zodType.describe(formatHint(format));
    return isRequired ? zodType : zodType.optional();
  }

  // RULE 5: Clarify ambiguous fields
  if (isAmbiguous(fieldName) && description) {
    zodType = zodType.describe(abbreviate(description, 30));
    return isRequired ? zodType : zodType.optional();
  }

  // RULE 6: Default - no description for clear field names
  return isRequired ? zodType : zodType.optional();
}

/** Extracts path parameter names from path template */
function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1));
}

/** Interpolates path parameters with actual values */
function interpolatePath(pathTemplate: string, params: Record<string, string>): string {
  let path = pathTemplate;

  for (const [key, value] of Object.entries(params)) {
    const placeholder = `{${key}}`;
    if (path.includes(placeholder)) {
      path = path.replace(placeholder, encodeURIComponent(String(value)));
    }
  }

  return path;
}

/** Checks if field name is self-explanatory */
function isObviousField(fieldName: string): boolean {
  const obviousFields = [
    'customerId', 'playerId', 'userId', 'id',
    'email', 'mobile', 'phone', 'phoneNumber',
    'firstName', 'lastName', 'displayName', 'name',
    'amount', 'points', 'quantity', 'price', 'total',
    'transactionId', 'orderId', 'couponCode',
    'title', 'description', 'category', 'status',
    'enabled', 'active', 'visible', 'value'
  ];
  return obviousFields.includes(fieldName);
}

/** Checks if field needs format hint */
function needsFormatHint(format: string, fieldName: string): boolean {
  const specialFormats = ['date-time', 'date', 'uuid', 'uri', 'ipv4', 'ipv6'];

  // Don't add hint for obvious formats
  if (fieldName === 'email' || fieldName === 'uri') return false;

  return specialFormats.includes(format);
}

/** Returns human-readable format hint */
function formatHint(format: string): string {
  const hints: Record<string, string> = {
    'date-time': 'ISO 8601',
    'date': 'YYYY-MM-DD',
    'uuid': 'UUID v4',
    'uri': 'Valid URI',
    'ipv4': 'IPv4 address',
    'ipv6': 'IPv6 address'
  };
  return hints[format] || format;
}

/** Checks if field name is ambiguous */
function isAmbiguous(fieldName: string): boolean {
  const ambiguousPatterns = [
    /reference/i,
    /metadata/i,
    /attributes/i,
    /options/i,
    /config/i,
    /settings/i,
    /params/i,
    /data$/i,
    /info$/i
  ];

  return ambiguousPatterns.some(pattern => pattern.test(fieldName));
}

/** Abbreviates text by removing verbose phrases */
function abbreviate(text: string, maxLength: number): string {
  if (!text) return '';

  return text
    .replace(/The unique identifier for/gi, '')
    .replace(/maximum \d+ characters/gi, '')
    .replace(/\(optional\)/gi, '')
    .replace(/A valid /gi, '')
    .replace(/This is the /gi, '')
    .replace(/This field /gi, '')
    .trim()
    .slice(0, maxLength);
}

