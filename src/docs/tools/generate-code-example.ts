/** Generates language-specific code examples for API endpoints */

import type { ApiEndpoint } from '../../shared/types.js';
import type { CodeLanguage } from '../types.js';
import { generateCode } from '../codegen.js';

const LANGUAGES: CodeLanguage[] = ['curl', 'javascript', 'python', 'csharp', 'go', 'php', 'java'];

export function generateCodeExample(
  endpoints: Map<string, ApiEndpoint>,
  endpointPath: string,
  method: string,
  language: string,
  body?: string
): string {
  const lang = language.toLowerCase() as CodeLanguage;
  if (!LANGUAGES.includes(lang)) {
    return `Unsupported language: "${language}". Supported: ${LANGUAGES.join(', ')}`;
  }

  const path = endpointPath.startsWith('/') ? endpointPath : '/' + endpointPath;
  const key = `${method.toUpperCase()} ${path}`;
  const ep = endpoints.get(key);

  if (!ep) return `Endpoint not found: ${key}`;

  const code = generateCode(ep, lang, body);
  return `### ${ep.method} ${ep.path} — ${lang}\n\n\`\`\`${lang === 'csharp' ? 'csharp' : lang}\n${code}\n\`\`\``;
}
