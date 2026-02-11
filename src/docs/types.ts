/** Type definitions for the documentation subsystem */

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  section: string;
  content: string;
  rawContent: string;
  chunks: DocChunk[];
}

export interface DocChunk {
  id: string;
  pageSlug: string;
  pageTitle: string;
  heading: string;
  content: string;
  section: string;
}

export interface NavTab {
  tab: string;
  groups?: NavGroup[];
  versions?: NavVersion[];
}

export interface NavVersion {
  version: string;
  groups: NavGroup[];
}

export interface NavGroup {
  group: string;
  pages: (string | NavGroup)[];
}

export type CodeLanguage = 'curl' | 'javascript' | 'python' | 'csharp' | 'go' | 'php' | 'java';

export interface FetchedFile {
  path: string;
  content: string;
}

export interface CacheManifest {
  timestamp: number;
  commitSha: string;
  files: string[];
}
