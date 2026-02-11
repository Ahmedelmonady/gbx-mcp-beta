/** Shared GitHub fetching and cache utilities used by both docs and integration subsystems */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const REPO = 'gameballers/gameball-docs';
export const BRANCH = 'main';
export const CACHE_DIR = join(homedir(), '.cache', 'gameball-integrations');
export const DEFAULT_BASE_URL = 'https://api.gameball.co';
const FETCH_TIMEOUT_MS = 10_000;

/** Builds a raw.githubusercontent.com URL for a file in the docs repo */
export function rawUrl(path: string): string {
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`;
}

/** Ensures the cache directory exists */
export async function ensureCacheDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

/** Fetches a URL with optional GITHUB_TOKEN for higher rate limits */
export function fetchWithToken(url: string, extraHeaders?: Record<string, string>): Promise<Response> {
  const headers: Record<string, string> = { 'User-Agent': 'gameball-integrations', ...extraHeaders };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

/** Gets the latest commit SHA on the main branch (1 API call) */
export async function getLatestCommitSha(): Promise<string> {
  const res = await fetchWithToken(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
    'Accept': 'application/vnd.github.sha',
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return (await res.text()).trim();
}
