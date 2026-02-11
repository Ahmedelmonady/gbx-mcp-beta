/** Retrieves tutorial content by topic with truncation and related tutorial suggestions */

import type { DocIndex } from '../doc-indexer.js';

export function getTutorial(index: DocIndex, topic: string): string {
  const lower = topic.toLowerCase();
  const MAX_CONTENT = 4000;

  const tutorials = [...index.pages.entries()]
    .filter(([slug]) => slug.startsWith('tutorials-new/') || slug.startsWith('tutorials/'));

  const exact = tutorials.find(([slug]) => slug.toLowerCase().includes(lower));

  const searched = !exact
    ? index.search.search(topic).filter(r => {
        const slug = r.pageSlug as string;
        return slug.startsWith('tutorials-new/') || slug.startsWith('tutorials/');
      })
    : [];

  const match = exact
    ? { slug: exact[0], page: exact[1] }
    : searched.length > 0
      ? { slug: searched[0].pageSlug as string, page: index.pages.get(searched[0].pageSlug as string)! }
      : null;

  if (!match || !match.page) {
    const available = tutorials.slice(0, 15).map(([slug, p]) => `- ${p.title} (\`${slug}\`)`).join('\n');
    return `No tutorial found for "${topic}".\n\nAvailable:\n${available}`;
  }

  const { page } = match;
  let content = page.content;
  let truncated = false;

  if (content.length > MAX_CONTENT) {
    content = content.slice(0, MAX_CONTENT);
    const lastNewline = content.lastIndexOf('\n');
    if (lastNewline > MAX_CONTENT * 0.8) content = content.slice(0, lastNewline);
    truncated = true;
  }

  let out = `# ${page.title}\n\n${page.description ? `> ${page.description}\n\n` : ''}${content}`;

  if (truncated) {
    out += `\n\n---\n_Content truncated. Use **get-doc** with path \`${match.slug}\` for the full page._`;
  }

  // Find related tutorials (deduplicate by page slug)
  const relatedSearch = index.search.search(topic)
    .filter(r => {
      const slug = r.pageSlug as string;
      return (slug.startsWith('tutorials-new/') || slug.startsWith('tutorials/')) && slug !== match.slug;
    });

  const seenSlugs = new Set<string>();
  const others = relatedSearch.filter(r => {
    const slug = r.pageSlug as string;
    if (seenSlugs.has(slug)) return false;
    seenSlugs.add(slug);
    return true;
  }).slice(0, 3);

  if (others.length) {
    out += `\n\n**Related:** ${others.map(r => `${r.pageTitle} (\`${r.pageSlug}\`)`).join(', ')}`;
  }

  return out;
}
