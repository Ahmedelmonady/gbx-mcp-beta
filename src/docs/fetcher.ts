/** Fetches documentation files from GitHub with commit-based cache invalidation */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CACHE_DIR, REPO, BRANCH, ensureCacheDir, fetchWithToken, rawUrl } from '../shared/github-cache.js';
import type { CacheManifest, FetchedFile } from './types.js';

const MANIFEST_FILE = join(CACHE_DIR, 'manifest.json');

/** Reads the cached manifest and all cached files if they exist */
async function loadCache(): Promise<{ manifest: CacheManifest | null; files: Map<string, string> | null }> {
  try {
    const raw = await readFile(MANIFEST_FILE, 'utf-8');
    const manifest: CacheManifest = JSON.parse(raw);
    const files = new Map<string, string>();
    for (const f of manifest.files) {
      const content = await readFile(join(CACHE_DIR, f.replace(/\//g, '__')), 'utf-8');
      files.set(f, content);
    }
    return { manifest, files };
  } catch {
    return { manifest: null, files: null };
  }
}

/** Writes all fetched doc files and manifest to the cache directory */
async function writeCache(commitSha: string, files: Map<string, string>): Promise<void> {
  await ensureCacheDir();
  const manifest: CacheManifest = { timestamp: Date.now(), commitSha, files: [...files.keys()] };
  for (const [path, content] of files) {
    await writeFile(join(CACHE_DIR, path.replace(/\//g, '__')), content, 'utf-8');
  }
  await writeFile(MANIFEST_FILE, JSON.stringify(manifest), 'utf-8');
}

/** Fetches docs from GitHub with commit-based cache invalidation and stale-cache fallback */
export async function fetchDocs(sha: string): Promise<Map<string, string>> {
  const cache = await loadCache();

  try {
    // Cache is valid if commit SHA matches — no TTL needed
    if (cache.manifest?.commitSha === sha && cache.files) {
      return cache.files;
    }

    // SHA changed or no cache — full re-fetch
    const treeUrl = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
    const res = await fetchWithToken(treeUrl);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);

    const data = await res.json() as { tree: Array<{ path: string; type: string }> };
    const paths = data.tree
      .filter(f => f.type === 'blob' && (f.path.endsWith('.mdx') || f.path === 'docs.json'))
      .map(f => f.path);

    const files = new Map<string, string>();
    const batchSize = 15;
    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (p) => {
          const r = await fetchWithToken(rawUrl(p));
          if (!r.ok) return null;
          return { path: p, content: await r.text() } as FetchedFile;
        })
      );
      for (const r of results) {
        if (r) files.set(r.path, r.content);
      }
    }

    await writeCache(sha, files);
    return files;
  } catch (err) {
    if (cache.files) {
      process.stderr.write(`Docs fetch failed, using stale cache: ${err}\n`);
      return cache.files;
    }
    throw err;
  }
}
