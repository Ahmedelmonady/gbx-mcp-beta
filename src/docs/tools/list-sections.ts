/** Lists documentation structure from navigation config or fallback section grouping */

import type { DocIndex } from '../doc-indexer.js';
import type { NavGroup } from '../types.js';

/** Recursively formats a navigation group into an indented markdown list */
function formatGroup(g: NavGroup, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines = [`${pad}- **${g.group}**`];
  for (const p of g.pages) {
    if (typeof p === 'string') {
      lines.push(`${pad}  - ${p}`);
    } else {
      lines.push(formatGroup(p, indent + 1));
    }
  }
  return lines.join('\n');
}

/** Lists documentation sections from the navigation structure */
export function listSections(index: DocIndex, section?: string): string {
  if (!index.nav.length) {
    const sections = new Set<string>();
    for (const p of index.pages.values()) sections.add(p.section);
    return `Available sections:\n${[...sections].map(s => `- ${s}`).join('\n')}`;
  }

  if (section) {
    const lower = section.toLowerCase();
    for (const tab of index.nav) {
      if (tab.tab.toLowerCase().includes(lower)) {
        const groups = tab.groups || tab.versions?.flatMap(v => v.groups) || [];
        return `## ${tab.tab}\n\n${groups.map(g => formatGroup(g)).join('\n\n')}`;
      }
    }
    return `Section "${section}" not found. Available: ${index.nav.map(t => t.tab).join(', ')}`;
  }

  return index.nav.map(tab => {
    const groups = tab.groups || tab.versions?.flatMap(v => v.groups) || [];
    const pageCount = groups.reduce((n, g) => n + g.pages.length, 0);
    const versions = tab.versions?.map(v => v.version).join(', ');
    return `- **${tab.tab}** (${pageCount} pages${versions ? `, versions: ${versions}` : ''})`;
  }).join('\n');
}
