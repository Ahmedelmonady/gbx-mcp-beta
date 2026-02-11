/** Fetches and caches openapi.json independently with commit-SHA validation and gzip compression */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { CACHE_DIR, ensureCacheDir, fetchWithToken, rawUrl } from '../shared/github-cache.js';

const OPENAPI_MANIFEST = join(CACHE_DIR, 'openapi-manifest.json');
const OPENAPI_CACHE = join(CACHE_DIR, 'openapi.json.gz');

interface OpenApiManifest {
  commitSha: string;
  timestamp: number;
}

/** Loads the cached openapi manifest and compressed content if they exist */
async function loadCachedOpenApi(): Promise<{ manifest: OpenApiManifest | null; content: string | null }> {
  try {
    const raw = await readFile(OPENAPI_MANIFEST, 'utf-8');
    const manifest: OpenApiManifest = JSON.parse(raw);
    const compressed = await readFile(OPENAPI_CACHE);
    const content = gunzipSync(compressed).toString('utf-8');
    return { manifest, content };
  } catch {
    return { manifest: null, content: null };
  }
}

/** Writes openapi.json to cache as gzip with atomic writes to prevent corruption */
async function writeCachedOpenApi(commitSha: string, content: string): Promise<void> {
  await ensureCacheDir();

  const tmpGz = `${OPENAPI_CACHE}.tmp`;
  const tmpManifest = `${OPENAPI_MANIFEST}.tmp`;

  const compressed = gzipSync(Buffer.from(content));
  await writeFile(tmpGz, compressed);
  await rename(tmpGz, OPENAPI_CACHE);

  const manifest: OpenApiManifest = { commitSha, timestamp: Date.now() };
  await writeFile(tmpManifest, JSON.stringify(manifest), 'utf-8');
  await rename(tmpManifest, OPENAPI_MANIFEST);
}

/** Fetches api-reference/openapi.json with SHA-based cache and gzip storage */
export async function fetchOpenApiSpec(sha: string): Promise<string | null> {
  const cache = await loadCachedOpenApi();

  if (cache.manifest?.commitSha === sha && cache.content) {
    return cache.content;
  }

  try {
    const res = await fetchWithToken(rawUrl('api-reference/openapi.json'));
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`GitHub fetch ${res.status}`);
    }

    const content = await res.text();
    await writeCachedOpenApi(sha, content);
    return content;
  } catch (err) {
    if (cache.content) {
      process.stderr.write(`OpenAPI fetch failed, using stale cache: ${err}\n`);
      return cache.content;
    }
    return null;
  }
}
