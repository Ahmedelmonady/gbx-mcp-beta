/** Retrieves a full documentation page by slug with fuzzy-match suggestions */

import type { DocIndex } from '../doc-indexer.js';

export function getDoc(index: DocIndex, path: string): string {
  const normalized = path
    .replace(/^\/+/, '')
    .replace(/\.mdx$/, '')
    .replace(/\\/g, '/');

  const page = index.pages.get(normalized);
  if (page) {
    return `# ${page.title}\n\n${page.description ? `> ${page.description}\n\n` : ''}${page.content}`;
  }

  // Fuzzy match
  const candidates = [...index.pages.keys()].filter(k =>
    k.includes(normalized) || normalized.includes(k) || k.endsWith('/' + normalized)
  );

  if (candidates.length > 0) {
    return `Page not found: "${path}"\n\nDid you mean:\n${candidates.slice(0, 5).map(c => `- ${c}`).join('\n')}`;
  }

  return `Page not found: "${path}". Use list-sections to browse available pages.`;
}
