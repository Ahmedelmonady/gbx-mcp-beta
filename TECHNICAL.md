# Technical Guide

Architecture, internals, and contribution guide for the Gameball Integrations MCP Server.

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   MCP Client                     │
│         (Claude Code / Cursor / VS Code)         │
└──────────────────────┬──────────────────────────┘
                       │ stdio (JSON-RPC)
┌──────────────────────▼──────────────────────────┐
│                   index.ts                       │
│              Entry point + transport             │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                  server.ts                       │
│         getLatestCommitSha() — 1 API call        │
│         Promise.all([docs, openapi])             │
│         parseOpenApi() — shared endpoints         │
│         Register all tools + status tool          │
└───────┬──────────────┬───────────────┬──────────┘
        │              │               │
        │ docs         │ integration   │ status
        │              │               │
┌───────▼─────────┐ ┌──▼────────────┐ ┌▼──────────────┐
│ docs/index.ts   │ │ integration/  │ │ status-tool.ts │
│                 │ │   index.ts    │ │                │
│ fetchDocs(sha)  │ │               │ │ gameball-status│
│ indexDocs()     │ │ fetchOpenApi  │ │ tool           │
│ registerTools   │ │ (sha) → gzip  │ └────────────────┘
└─────┬───────────┘ │ createClient  │
      │             │ generateTools │
      │ 7 tools     └──────┬───────┘
      │                    │
┌─────▼─────────┐         │ 71 tools
│ docs/tools/*  │         │
│               │  ┌──────▼────────────┐
│ MiniSearch    │  │ generator.ts      │
│ MDX parsing   │  │                   │
│ Code gen      │  │ Auto-generates    │
└───────────────┘  │ from OpenAPI spec │
                   │ GameballClient    │
      shared/      └───────────────────┘
  ┌─────────────────────┐
  │ github-cache.ts     │ ← fetchWithToken (10s timeout)
  │ openapi-parser.ts   │ ← parseOpenApi()
  │ types.ts            │ ← ApiEndpoint, ApiParameter
  └─────────────────────┘
```

## Project Structure

```
src/
├── index.ts                     # Entry point, stdio transport
├── server.ts                    # Parallel init, graceful failure, tool registration
├── status-tool.ts               # gameball-status tool (health, config, cache info)
│
├── docs/                        # Documentation subsystem (7 tools)
│   ├── index.ts                 # initializeDocsSubsystem() + registerDocTools()
│   ├── types.ts                 # DocPage, DocChunk, NavTab, CacheManifest, etc.
│   ├── fetcher.ts               # GitHub fetch + SHA-based disk cache
│   ├── doc-indexer.ts           # MiniSearch indexing, heading-based chunking
│   ├── mdx-parser.ts            # YAML frontmatter + JSX stripping
│   ├── codegen.ts               # Code examples in 7 languages
│   └── tools/                   # 7 documentation tools
│       ├── lookup-topic.ts      # Composite topic lookup (tutorials + docs + endpoints)
│       ├── get-doc.ts           # Full page retrieval with fuzzy match
│       ├── get-api-endpoint.ts  # Endpoint detail or compact search results
│       ├── generate-code-example.ts  # Language-specific code generation
│       ├── search-docs.ts       # Full-text search with section filtering
│       ├── list-sections.ts     # Navigation structure browser
│       └── get-tutorial.ts      # Tutorial content with truncation
│
├── integration/                 # API integration subsystem (71 tools)
│   ├── index.ts                 # createGameballClient() + registerIntegrationTools()
│   ├── openapi-fetcher.ts       # Independent openapi.json fetch + gzip cache
│   ├── http-client.ts           # GameballClient (auth headers, error formatting)
│   └── generator.ts             # Auto-generates 71 tools from OpenAPI spec
│
└── shared/                      # Common utilities used by both subsystems
    ├── github-cache.ts          # fetchWithToken (10s timeout), getLatestCommitSha, rawUrl
    ├── types.ts                 # ApiEndpoint, ApiParameter, ResponseDetail
    └── openapi-parser.ts        # OpenAPI JSON → Map<string, ApiEndpoint>
```

## Subsystem Architecture

### Documentation Subsystem

**Purpose:** Provide AI-powered access to Gameball developer documentation without requiring API keys.

**Workflow:**
1. **Fetch Phase** (`docs/fetcher.ts`):
   - Receives commit SHA from `server.ts` (fetched once, shared)
   - Uses disk cache (`~/.cache/gameball-integrations/`) if SHA unchanged
   - Fetches all `.mdx` files and `docs.json` (not `openapi.json` — that's handled by the integration subsystem)
   - Batches requests (15 concurrent) to avoid overwhelming GitHub API
   - Falls back to stale cache if GitHub fetch fails

2. **Index Phase** (`docs/doc-indexer.ts`):
   - Parses YAML frontmatter from each `.mdx` file
   - Strips JSX components while preserving text content
   - Splits pages into chunks by heading boundaries (minimum 30 chars)
   - Creates MiniSearch full-text index with fuzzy matching and heading boost

3. **Query Phase** (`docs/tools/*.ts`):
   - Tools query the in-memory index
   - Returns compact results to minimize token usage
   - Provides drill-down capabilities for detailed content

### Integration Subsystem

**Purpose:** Wrap Gameball API v4.0 as 71 discrete MCP tools for direct API interaction, auto-generated from OpenAPI spec.

**Workflow:**
1. **OpenAPI Fetching** (`integration/openapi-fetcher.ts`):
   - Fetches `api-reference/openapi.json` independently from GitHub
   - Receives commit SHA from `server.ts` (same SHA used by docs subsystem)
   - Stores as gzip-compressed cache with atomic writes (`.tmp` + rename)
   - Falls back to stale cache on failure, returns `null` on cold start failure

2. **OpenAPI Parsing** (`shared/openapi-parser.ts`):
   - Called once in `server.ts` after both subsystems load
   - Resolves `$ref` pointers within the document
   - Produces a `Map<string, ApiEndpoint>` shared by both subsystems

3. **Client Creation** (`integration/http-client.ts`):
   - Instantiated with `baseUrl`, `apiKey`, `secretKey`
   - Provides `request()` method for all HTTP operations
   - Handles path interpolation, query params, auth headers
   - Never throws — returns error strings for graceful failure

4. **Tool Auto-Generation** (`integration/generator.ts`):
   - Iterates over `apiEndpoints` map at server startup
   - Dynamically registers all 71 tools using `endpoint.operationId` as tool name
   - Uses **Smart Adaptive Verbosity** for descriptions and schemas
   - Creates Zod schemas with selective descriptions

### Status Tool

**Purpose:** Provide on-demand server health and configuration info.

**Registered as:** `gameball-status` in `status-tool.ts`

**Output:**
```
Subsystems
  Integration   ready   71 tools
  Docs          ready    7 tools

Configuration
  API Key       configured
  Secret Key    configured
  Base URL      https://api.gameball.co

Cache
  Location      ~/.cache/gameball-integrations/
  Last synced   3 min ago (commit e4a1b2c)
  Docs index    cached (42 pages, 187 chunks)
```

Shows "not set" with hints for missing API keys. Shows "not synced" if GitHub was unreachable.

## Data Flow

### Startup Sequence

```
index.ts
  └─ createServer()                          server.ts
       │
       ├─ getLatestCommitSha()               shared/github-cache.ts
       │    └─ 1 API call (10s timeout)
       │
       ├─ Promise.all([                      ← PARALLEL
       │     initializeDocsSubsystem(sha),   docs/index.ts
       │       ├─ fetchDocs(sha)               docs/fetcher.ts
       │       └─ indexDocs(files)              docs/doc-indexer.ts
       │     fetchOpenApiSpec(sha),           integration/openapi-fetcher.ts
       │       └─ gzip cache or GitHub fetch
       │   ])
       │
       ├─ parseOpenApi(openapiJson)           shared/openapi-parser.ts
       │    └─ Map<string, ApiEndpoint>       ← shared by both subsystems
       │
       ├─ createGameballClient(config)        integration/http-client.ts
       │
       ├─ registerDocTools(server, docIndex, apiEndpoints)        7 tools
       ├─ registerIntegrationTools(server, client, apiEndpoints)  71 tools
       ├─ registerStatusTool(server, statusInfo)                  1 tool
       │
       └─ server.connect(transport)           ← Ready — 79 tools
```

**stderr output during startup:**
```
Checking for updates...
Loading...
Ready — 79 tools
```

### Graceful Failure

All GitHub fetches use `fetchWithToken()` from `shared/github-cache.ts` which applies a **10-second timeout** via `AbortSignal.timeout(10_000)`.

**Failure chain:**

| Failure Point | With Cache | Without Cache (Cold Start) |
|---------------|------------|---------------------------|
| `getLatestCommitSha()` | Skip both subsystems, use empty defaults | Same — server starts with 0 tools + status |
| `fetchDocs(sha)` | Stale cache used | Throws → caught in server.ts → empty docIndex |
| `fetchOpenApiSpec(sha)` | Stale cache used | Returns `null` → empty apiEndpoints Map |

The `gameball-status` tool always registers regardless of failures.

### Documentation Tool Invocation

```
User: "How do I handle referrals?"

1. docs-lookup-topic("referral")
   ├─ Search tutorials matching "referral"
   ├─ Search docs matching "referral"
   └─ Search API endpoints matching "referral"
   → Returns compact list of titles + paths

2. docs-get-tutorial("referral")
   ├─ Find tutorial page by slug
   ├─ Truncate at 4000 chars
   └─ Return with pointer to full page

3. docs-get-api-endpoint({ endpoint: "/api/v4.0/integrations/referrals" })
   ├─ Lookup in apiEndpoints map
   ├─ Format params, schemas, responses
   └─ Include cURL example
```

### Integration Tool Invocation

```
User: "Create a customer with ID 'user123'"

1. create-customer tool called (auto-generated from OpenAPI)

2. Input validated with auto-generated Zod schema:
   {
     customerId: z.string(),              // Obvious field → no description
     email: z.string().optional(),        // Obvious field → no description
     customAttributes: z.record(z.any())  // Ambiguous → "Custom key-value data"
       .optional().describe('Custom key-value data')
   }

3. Path interpolation:
   interpolatePath('/api/v4.0/integrations/customers/{customerId}', input)
   → '/api/v4.0/integrations/customers/user123'

4. HTTP request with auto-injected headers:
   headers: { APIKey: '...', SecretKey: '...', Content-Type: 'application/json' }

5. Response returned as JSON string
```

## Cache Layout

```
~/.cache/gameball-integrations/
├── manifest.json               # Docs cache: { commitSha, timestamp, files[] }
├── [__-delimited .mdx files]   # Cached doc pages (e.g., tutorials__getting-started.mdx)
├── openapi-manifest.json       # OpenAPI cache: { commitSha, timestamp }
└── openapi.json.gz             # Gzip-compressed OpenAPI spec (atomic writes)
```

**Cache invalidation:** Commit-SHA based (not TTL). Cache is valid as long as the SHA matches the latest commit on the `main` branch of `gameballers/gameball-docs`.

**Atomic writes:** The OpenAPI cache uses `.tmp` + `rename` to prevent partial writes from corrupting the cache.

## Key Design Decisions

### 1. Parallel Subsystem Initialization

**Decision:** Fetch docs and OpenAPI spec in parallel via `Promise.all()`, sharing a single commit SHA.

**Rationale:**
- Docs subsystem fetches ~60-80 MDX files (~5MB)
- Integration subsystem only needs `openapi.json` (~200KB)
- Previously sequential — integration waited for all docs to download
- One SHA fetch covers both subsystems (saves 1 API call)

### 2. Independent OpenAPI Fetching with Gzip Cache

**Decision:** Integration subsystem fetches `openapi.json` independently from GitHub and caches it gzip-compressed.

**Rationale:**
- Decouples integration from docs (either can fail independently)
- Gzip masks the raw JSON on disk (not readable as plain text)
- Atomic writes prevent cache corruption from interrupted writes
- SHA-based validation means no stale data when cache hits

### 3. Fetch Timeout + Graceful Cold Start

**Decision:** 10-second timeout on all GitHub fetches. Server starts with empty data if GitHub is unreachable.

**Rationale:**
- Without timeout, a slow GitHub response could hang the server indefinitely
- MCP clients (Claude Code) have their own timeouts and would show the server as failed
- `gameball-status` tool always registers so users can diagnose the issue
- Stale cache fallback means warm starts almost never fail

### 4. Tool Name Prefixing

**Decision:** Prefix all documentation tools with `docs-`.

**Rationale:**
- Prevents collision between `docs-get-api-endpoint` (returns spec) and integration tools (make API calls)
- Integration tools use `operationId` from OpenAPI spec directly

### 5. Subsystem Isolation

**Decision:** Keep docs and integration logic in separate directories with shared utilities.

**Rationale:**
- Clear separation of concerns
- Independent failure and caching
- Shared code limited to `github-cache.ts`, `openapi-parser.ts`, and `types.ts`

### 6. OpenAPI-Driven Tool Generation

**Decision:** Auto-generate all 71 integration tools from OpenAPI spec instead of manual coding.

**Rationale:**
- **Zero maintenance**: New API endpoints appear automatically
- **Auto-sync**: Tools always match current API
- **Token efficiency**: Smart Adaptive Verbosity saves 78% tokens
- **Reduced code**: 26 files (~2,000 lines) → 1 file (~300 lines)

### 7. Smart Adaptive Verbosity

**Decision:** Use intelligent rules to decide when field descriptions add value.

**The 6 Rules:**
1. **Obvious fields** (customerId, email, amount) → No description
2. **Complex types** (objects, arrays) → Short description
3. **Enum fields** → Show options ("Options: points, cashback")
4. **Special formats** (ISO 8601, UUID) → Format hint only
5. **Ambiguous names** (metadata, reference) → Brief explanation
6. **Default** → No description if field name is clear

**Results:**
- Average 28 tokens per tool (vs 127 tokens manual)
- Descriptions only where they add value

## Dependencies

### Production Dependencies

| Package | Version | Purpose | Used By |
|---------|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.12.0 | MCP protocol implementation | Both |
| `minisearch` | ^7.0.0 | Full-text search engine | Docs only |
| `zod` | ^3.24.0 | Runtime schema validation | Integration (tool schemas) |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/node` | ^22.0.0 | Node.js type definitions |
| `tsx` | ^4.19.0 | TypeScript executor (dev mode) |
| `typescript` | ^5.7.0 | TypeScript compiler |

**No HTTP library needed:** Uses Node.js 20+ built-in `fetch()` API.

## Performance Characteristics

### Startup Time

| Scenario | Time | Notes |
|----------|------|-------|
| Cold start (no cache) | 2-3s | GitHub fetch (~60-80 API calls, parallel) |
| Warm start (cache valid) | 200-500ms | 1 API call to check SHA |
| Warm start (offline) | <100ms | Fallback to stale cache |
| Cold start (GitHub down) | ~10s | Timeout, then start with 0 tools |

### Memory Usage

| Component | Size | Notes |
|-----------|------|-------|
| Docs subsystem | 10-15 MB | Indexed content in memory |
| Integration subsystem | <1 MB | Generator code + runtime schemas |
| **Total** | **12-16 MB** | Lightweight for MCP server |

### Token Usage (System Prompt)

| Component | Tokens | Notes |
|-----------|--------|-------|
| Docs tools (7) | ~500 | Minimal descriptions |
| Integration tools (71) | ~2,000 | Smart Adaptive Verbosity |
| Status tool (1) | ~30 | Single tool |
| **Total** | **~2,500** | **78% reduction** vs manual approach |

## Error Handling

Both subsystems return error strings instead of throwing exceptions.

### Documentation Subsystem

```typescript
// GitHub fetch failure → stale cache fallback
export async function fetchDocs(sha: string): Promise<Map<string, string>> {
  const cache = await loadCache();
  try {
    if (cache.manifest?.commitSha === sha && cache.files) return cache.files;
    // ... fetch from GitHub ...
  } catch (err) {
    if (cache.files) {
      process.stderr.write(`Docs fetch failed, using stale cache: ${err}\n`);
      return cache.files;
    }
    throw err; // No cache available — caught by server.ts
  }
}
```

### Integration Subsystem

```typescript
// OpenAPI fetch failure → stale cache → null
export async function fetchOpenApiSpec(sha: string): Promise<string | null> {
  const cache = await loadCachedOpenApi();
  if (cache.manifest?.commitSha === sha && cache.content) return cache.content;
  try {
    // ... fetch from GitHub ...
  } catch (err) {
    if (cache.content) return cache.content; // Stale cache
    return null; // No cache — server starts with 0 integration tools
  }
}
```

### Server-Level

```typescript
// Wraps entire init in try/catch for graceful failure
try {
  commitSha = await getLatestCommitSha();
  const [docIndex, openapiJson] = await Promise.all([...]);
  // ...
} catch (err) {
  process.stderr.write(`Failed to fetch from GitHub: ${err}. Starting with limited functionality.\n`);
  // Uses empty defaults — status tool still registers
}
```

## Adding New Tools

### Adding a Documentation Tool

1. Create tool function in `src/docs/tools/my-tool.ts`
2. Register in `src/docs/index.ts` with `docs-` prefix
3. Update tool count in `status-tool.ts` (line showing "7 tools")

### Adding an Integration Tool

**Integration tools are auto-generated — no manual coding needed.**

When Gameball adds a new API endpoint to `openapi.json`, the tool appears automatically on next server start.

**For custom tools not in OpenAPI**, add them manually in `src/integration/index.ts` after `generateToolsFromOpenApi()`.

## Development

### Setup

```bash
git clone <repository-url>
cd gameball-integrations
npm install
npm run dev    # Dev mode with auto-reload
npm run build  # Production build
npm start      # Run built version
```

### Code Style

- TypeScript strict mode
- JSDoc comments (`/** ... */`) on all exported functions and non-trivial helpers
- File-level JSDoc comment describing the module's purpose
- Null safety: use `?.`, `??`, guard clauses

### Testing

```bash
# Build and verify
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js

# Test with Claude Code
# Add to ~/.claude/settings.json and use tools
```

### Verification Checklist

1. `npm run build` — no TypeScript errors
2. `npm run dev` — server starts, stderr shows "Ready — 79 tools"
3. Call `gameball-status` — shows subsystem status, config, cache info
4. Delete cache dir, restart — cold start fetches from GitHub
5. Second run — warm start loads from cache
6. Offline with cache — falls back to stale cache
7. Offline without cache — starts with 0 tools + status tool

## Troubleshooting

### Server Hangs on Startup

**Cause:** GitHub is slow or unreachable.
**Fix:** The 10s timeout in `fetchWithToken()` handles this. If it still hangs, check if `GITHUB_TOKEN` is set (avoids rate limiting).

### Tool Not Found

**Cause:** Tool name mismatch.
**Fix:** Documentation tools use `docs-` prefix. Integration tools use `operationId` from OpenAPI spec.

### API Key Errors

**Cause:** Missing environment variables.
**Fix:** Call `gameball-status` to see which keys are configured.

### Cache Issues

**Location:** `~/.cache/gameball-integrations/`
**Fix:** Safe to delete entirely — will re-fetch on next run.

## Security Considerations

- API keys stored only in environment variables, never logged
- Cache contains public documentation only (no secrets)
- OpenAPI cache is gzip-compressed (not plain text on disk)
- All GitHub/API requests use HTTPS
- No user data cached by integration subsystem

## License

MIT License - See LICENSE file for details.
