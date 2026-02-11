/** Indexes MDX documentation into a MiniSearch full-text index with heading-based chunking */

import MiniSearch from 'minisearch';
import { parseMdx } from './mdx-parser.js';
import type { DocPage, DocChunk, NavTab } from './types.js';

export interface DocIndex {
  pages: Map<string, DocPage>;
  chunks: Map<string, DocChunk>;
  search: MiniSearch<DocChunk>;
  nav: NavTab[];
}

const MINISEARCH_OPTIONS = {
  fields: ['heading', 'content'],
  storeFields: ['pageSlug', 'pageTitle', 'heading', 'section'],
  idField: 'id' as const,
  searchOptions: {
    boost: { heading: 3 },
    fuzzy: 0.2,
    prefix: true,
  },
};

/** Creates an empty DocIndex for graceful failure scenarios */
export function emptyDocIndex(): DocIndex {
  return {
    pages: new Map(),
    chunks: new Map(),
    search: new MiniSearch<DocChunk>(MINISEARCH_OPTIONS),
    nav: [],
  };
}

/** Determines the section name from a doc slug */
function sectionFromSlug(slug: string): string {
  const map: Record<string, string> = {
    'api-reference': 'API Reference',
    'installation-guide': 'Installation Guide',
    'tutorials-new': 'Tutorials',
    'tutorials': 'Tutorials',
    'changelog': 'Changelog',
    'essentials': 'Essentials',
    'ai-tools': 'AI Tools',
    'snippets': 'Snippets',
  };
  return map[slug.split('/')[0]] || slug.split('/')[0];
}

/** Splits page content into chunks by heading boundaries */
function splitIntoChunks(slug: string, pageTitle: string, section: string, content: string): DocChunk[] {
  const lines = content.split('\n');
  const chunks: DocChunk[] = [];
  let currentHeading = pageTitle;
  let currentLines: string[] = [];
  let chunkIdx = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch && currentLines.length > 0) {
      const text = currentLines.join('\n').trim();
      if (text.length > 30) {
        chunks.push({
          id: `${slug}#${chunkIdx}`,
          pageSlug: slug,
          pageTitle,
          heading: currentHeading,
          content: text,
          section,
        });
        chunkIdx++;
      }
      currentLines = [];
      currentHeading = headingMatch[1];
    }
    currentLines.push(line);
  }

  // Last chunk
  const text = currentLines.join('\n').trim();
  if (text.length > 30) {
    chunks.push({
      id: `${slug}#${chunkIdx}`,
      pageSlug: slug,
      pageTitle,
      heading: currentHeading,
      content: text,
      section,
    });
  }

  // If no headings found, single chunk for the whole page
  if (chunks.length === 0 && content.trim().length > 0) {
    chunks.push({
      id: `${slug}#0`,
      pageSlug: slug,
      pageTitle,
      heading: pageTitle,
      content: content.trim(),
      section,
    });
  }

  return chunks;
}

/** Indexes all MDX files into section-level chunks with a MiniSearch full-text index */
export function indexDocs(files: Map<string, string>): DocIndex {
  const docsJson = files.get('docs.json');
  let nav: NavTab[] = [];
  if (docsJson) {
    try {
      const config = JSON.parse(docsJson);
      nav = config.navigation?.tabs || [];
    } catch { /* ignore parse errors */ }
  }

  const pages = new Map<string, DocPage>();
  const allChunks = new Map<string, DocChunk>();

  for (const [path, raw] of files) {
    if (!path.endsWith('.mdx')) continue;
    const slug = path.replace(/\.mdx$/, '');
    const { title, description, content } = parseMdx(raw);
    const pageTitle = title || slug.split('/').pop() || slug;
    const section = sectionFromSlug(slug);

    const chunks = splitIntoChunks(slug, pageTitle, section, content);

    pages.set(slug, {
      slug,
      title: pageTitle,
      description,
      section,
      content,
      rawContent: raw,
      chunks,
    });

    for (const chunk of chunks) {
      allChunks.set(chunk.id, chunk);
    }
  }

  const search = new MiniSearch<DocChunk>(MINISEARCH_OPTIONS);

  search.addAll([...allChunks.values()]);

  return { pages, chunks: allChunks, search, nav };
}
