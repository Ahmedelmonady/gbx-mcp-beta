/** Comprehensive topic lookup combining tutorials, docs, and API endpoints in one call */

import type { DocIndex } from '../doc-indexer.js';
import type { ApiEndpoint } from '../../shared/types.js';

export function lookupTopic(
  docIndex: DocIndex,
  apiEndpoints: Map<string, ApiEndpoint>,
  topic: string
): string {
  const sections: string[] = [];
  const lower = topic.toLowerCase();

  // 1. Find matching tutorials (titles + paths only, not full content)
  const tutorials = [...docIndex.pages.entries()]
    .filter(([slug]) => slug.startsWith('tutorials-new/') || slug.startsWith('tutorials/'));

  const matchedTutorials = tutorials.filter(([slug, p]) =>
    slug.toLowerCase().includes(lower) ||
    p.title.toLowerCase().includes(lower) ||
    p.description.toLowerCase().includes(lower)
  );

  const searchedTutorials = docIndex.search.search(topic)
    .filter(r => {
      const slug = r.pageSlug as string;
      return slug.startsWith('tutorials-new/') || slug.startsWith('tutorials/');
    })
    .slice(0, 5);

  // Deduplicate
  const tutorialSlugs = new Set<string>();
  const tutorialLines: string[] = [];
  for (const [slug, p] of matchedTutorials) {
    if (tutorialSlugs.has(slug)) continue;
    tutorialSlugs.add(slug);
    tutorialLines.push(`- **${p.title}** → \`${slug}\``);
  }
  for (const r of searchedTutorials) {
    const slug = r.pageSlug as string;
    if (tutorialSlugs.has(slug)) continue;
    tutorialSlugs.add(slug);
    tutorialLines.push(`- **${r.pageTitle}** → \`${slug}\``);
  }

  if (tutorialLines.length) {
    sections.push(`## Tutorials\n\n${tutorialLines.join('\n')}\n\n_Use **get-doc** with a path above for full content._`);
  }

  // 2. Related doc pages (compact, deduplicated by page)
  const seenDocSlugs = new Set<string>(tutorialSlugs);
  const docResults = docIndex.search.search(topic)
    .filter(r => {
      const slug = r.pageSlug as string;
      if (seenDocSlugs.has(slug)) return false;
      seenDocSlugs.add(slug);
      return true;
    })
    .slice(0, 5);

  if (docResults.length) {
    const docLines = docResults.map(r => {
      const heading = r.heading !== r.pageTitle ? ` → ${r.heading}` : '';
      return `- **${r.pageTitle}**${heading} (\`${r.pageSlug}\`, ${r.section})`;
    });
    sections.push(`## Related Docs\n\n${docLines.join('\n')}\n\n_Use **get-doc** with a path above for full content._`);
  }

  // 3. Related API endpoints (compact list)
  const matchingEps = [...apiEndpoints.values()].filter(e =>
    e.summary.toLowerCase().includes(lower) ||
    e.description.toLowerCase().includes(lower) ||
    e.tags.some(t => t.toLowerCase().includes(lower)) ||
    e.path.toLowerCase().includes(lower)
  ).slice(0, 10);

  if (matchingEps.length) {
    const epLines = matchingEps.map(e => `- **${e.method}** \`${e.path}\` — ${e.summary}`);
    sections.push(`## API Endpoints\n\n${epLines.join('\n')}\n\n_Use **get-api-endpoint** with endpoint + method for full details, params, schemas, and cURL._`);
  }

  if (sections.length === 0) {
    return `No documentation found for "${topic}". Try different keywords or use \`list-sections\` to browse.`;
  }

  return sections.join('\n\n---\n\n');
}
