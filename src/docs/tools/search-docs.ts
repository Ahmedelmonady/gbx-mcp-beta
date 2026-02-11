/** Full-text search across documentation chunks with section filtering and deduplication */

import type { DocIndex } from '../doc-indexer.js';

export function searchDocs(index: DocIndex, query: string, section?: string, limit = 5): string {
  let results = index.search.search(query);

  if (section) {
    const lower = section.toLowerCase();
    results = results.filter(r => (r.section as string)?.toLowerCase().includes(lower));
  }

  // Deduplicate by page — keep best chunk per page
  const seenPages = new Set<string>();
  const deduplicated = results.filter(r => {
    const slug = r.pageSlug as string;
    if (seenPages.has(slug)) return false;
    seenPages.add(slug);
    return true;
  });

  const top = deduplicated.slice(0, limit);
  if (top.length === 0) return 'No results found.';

  return top.map(r => {
    const chunk = index.chunks.get(r.id as string);
    const content = chunk?.content ?? '';
    // Cap chunk output at 500 chars for search results
    const snippet = content.length > 500
      ? content.slice(0, 500).replace(/\n/g, ' ').trim() + '...'
      : content.replace(/\n/g, ' ').trim();

    return [
      `**${r.pageTitle}** → ${r.heading}`,
      `\`${r.pageSlug}\` | ${r.section}`,
      snippet,
    ].join('\n');
  }).join('\n\n---\n\n');
}
