# Gameball Integrations

Unified Model Context Protocol (MCP) server providing comprehensive access to Gameball's developer documentation and API integration.

## Features

This server combines two subsystems and a status tool:

### Documentation Tools (7 tools)
- **No API keys required** - Automatically fetches and indexes documentation from GitHub
- Search and browse Gameball developer docs
- Get API endpoint specifications
- Generate code examples in multiple languages (JavaScript, Python, C#, Go, PHP, Java)
- Access tutorials and guides

### Integration Tools (71 tools)
- **Requires API keys** - Make real API calls to Gameball's services
- Customer management (create, update, query, balance, tags, notifications)
- Transaction handling (cashback, redemption, holds, refunds, OTP)
- Order tracking and queries
- Coupon validation and burning
- Batch operations
- Configuration queries
- Referral system
- Leaderboards
- Events and payments

### Status Tool (1 tool)
- `gameball-status` - Shows server health, subsystem status, configuration, and cache info

**Total: 79 tools in one server**

## Installation

### Prerequisites

- Node.js >= 20
- Clone and build the project:

```bash
git clone <repository-url> gameball-integrations
cd gameball-integrations
npm install
npm run build
```

### Add to Your Project (recommended)

Create a `.mcp.json` file at the root of your project. Claude Code automatically detects this file and loads the MCP server for that workspace.

**Docs only** (no API keys needed):
```json
{
  "mcpServers": {
    "gameball": {
      "command": "node",
      "args": ["/path/to/gameball-integrations/dist/index.js"]
    }
  }
}
```

**Docs + Integration** (requires API keys):
```json
{
  "mcpServers": {
    "gameball": {
      "command": "node",
      "args": ["/path/to/gameball-integrations/dist/index.js"],
      "env": {
        "GAMEBALL_API_KEY": "your-api-key",
        "GAMEBALL_SECRET_KEY": "your-secret-key"
      }
    }
  }
}
```

> **Tip:** If the MCP repo is a sibling directory, use a relative path:
> `"args": ["../gameball-integrations/dist/index.js"]`

### Add Globally (all projects)

To make the tools available across all projects, add the config to `~/.claude/settings.json` under the same `mcpServers` structure shown above.

### Via Claude Code CLI

```bash
# Docs only
claude mcp add gameball node /path/to/gameball-integrations/dist/index.js

# With API keys
claude mcp add gameball node /path/to/gameball-integrations/dist/index.js \
  -e GAMEBALL_API_KEY=your-api-key \
  -e GAMEBALL_SECRET_KEY=your-secret-key
```

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `GAMEBALL_API_KEY` | For integration tools | Your Gameball API key | `""` |
| `GAMEBALL_SECRET_KEY` | For sensitive operations | Your Gameball secret key | `undefined` |
| `GAMEBALL_BASE_URL` | No | API base URL | `https://api.gameball.co` |
| `GITHUB_TOKEN` | No | GitHub token for higher rate limits | `undefined` |

## Tool Categories

### Documentation Tools (docs-* prefix)

All documentation tools work without API keys:

| Tool | Description |
|------|-------------|
| `docs-lookup-topic` | **START HERE** - Comprehensive lookup returning tutorials, docs, and API endpoints for a topic |
| `docs-get-doc` | Get full content of a specific documentation page |
| `docs-get-api-endpoint` | Get detailed API endpoint specification with parameters and schemas |
| `docs-generate-code-example` | Generate code examples in JavaScript, Python, C#, Go, PHP, or Java |
| `docs-search-docs` | Full-text search across all documentation |
| `docs-list-sections` | Browse documentation structure and available topics |
| `docs-get-tutorial` | Get step-by-step tutorial content |

### Integration Tools (by domain)

All integration tools require `GAMEBALL_API_KEY`. Tools marked with 🔒 also require `GAMEBALL_SECRET_KEY`.

#### Authentication (1 tool)
- `generate-session-token` - Generate JWT session token

#### Customers (21 tools)
- `create-customer`, `get-customer`, `update-customer`, `delete-customer`
- `get-customer-balance`, `adjust-customer-balance` 🔒
- `get-customer-referrals`, `send-customer-notification`
- `get-customer-tags`, `add-customer-tag`, `remove-customer-tag`
- And more...

#### Transactions (13 tools)
- `cashback-transaction`, `redeem-points`, `redeem-points-otp`
- `hold-points`, `cancel-hold`, `refund-transaction`
- `query-transactions`, `reverse-transaction`
- And more...

#### Orders (4 tools)
- `track-order`, `refund-order`, `query-orders`, `cancel-order`

#### Coupons (7 tools)
- `validate-coupon`, `burn-coupon`, `lock-coupon`, `unlock-coupon`
- `revoke-burn-coupon`, `revoke-validation`, `list-customer-coupons`

#### Batch Operations (9 tools)
- `batch-adjust-balance`, `batch-send-events`, `batch-cashback`
- `batch-redeem`, `batch-refund`, `batch-hold`, `batch-cancel-hold`
- And more...

#### Configuration (10 tools)
- `get-action-config`, `get-challenge-config`, `get-level-config`
- `get-tier-config`, `query-tiers`, `query-levels`
- And more...

#### Other Domains
- **Custom** (2 tools): Utilities like customer count, cart tracking
- **Events** (1 tool): Send customer events
- **Leaderboard** (1 tool): Get leaderboard rankings
- **Payments** (1 tool): Record payments
- **Referrals** (1 tool): Validate referral codes

### Status Tool

| Tool | Description |
|------|-------------|
| `gameball-status` | Shows subsystem health, API key configuration, cache location, and sync status |

## How It Works

### Startup

1. Fetches the latest commit SHA from GitHub (single API call)
2. Loads both subsystems **in parallel**:
   - **Docs subsystem**: Fetches `.mdx` files and `docs.json`, builds MiniSearch index
   - **Integration subsystem**: Fetches `openapi.json` independently (gzip-cached)
3. Parses the OpenAPI spec into endpoint definitions (shared by both subsystems)
4. Registers all tools and connects via stdio

Progress is reported to stderr during loading:
```
Checking for updates...
Loading...
Ready — 79 tools
```

### Documentation Subsystem
- **GitHub Fetching**: Fetches Gameball docs from GitHub with batched requests
- **Commit-SHA Cache**: Validates cache with 1 API call, re-fetches only when docs change
- **Full-Text Indexing**: MiniSearch with fuzzy matching and heading-based chunking
- **Stale-Cache Fallback**: Uses cached docs if GitHub is unreachable

### Integration Subsystem
- **Independent OpenAPI Fetch**: Fetches only `openapi.json` (not the full docs repo)
- **Gzip Cache**: Stores the OpenAPI spec compressed with atomic writes
- **Auto-Generated Tools**: All 71 tools generated from OpenAPI spec at startup
- **Smart Adaptive Verbosity**: Intelligent descriptions save 78% tokens (~7,000 tokens)
- **HTTP Client**: Wraps Gameball API v4.0 with automatic auth header injection

### Graceful Failure

All GitHub fetches have a **10-second timeout**. If GitHub is unavailable:
- With cache: Falls back to stale cached data
- Without cache (cold start): Server starts with 0 tools + status tool
- The `gameball-status` tool always registers and shows the error state

**First run**: ~2-3 seconds (fetches from GitHub)
**Subsequent runs**: ~200-500ms (validates cache with 1 API call)

## Architecture

```
gameball-integrations/
├── src/
│   ├── index.ts              # Entry point (stdio transport)
│   ├── server.ts             # Server creation (parallel init, graceful failure)
│   ├── status-tool.ts        # gameball-status tool
│   ├── docs/                 # Documentation subsystem (7 tools)
│   │   ├── index.ts          # Init + tool registration
│   │   ├── fetcher.ts        # GitHub fetching + SHA-based cache
│   │   ├── doc-indexer.ts    # MiniSearch indexing + chunking
│   │   ├── mdx-parser.ts     # MDX → plain text
│   │   ├── codegen.ts        # Multi-language code generation
│   │   ├── types.ts          # Doc-specific types
│   │   └── tools/            # 7 documentation tools
│   ├── integration/          # API integration subsystem (71 tools)
│   │   ├── index.ts          # Client creation + tool registration
│   │   ├── openapi-fetcher.ts # Independent openapi.json fetch + gzip cache
│   │   ├── http-client.ts    # GameballClient (auth, error formatting)
│   │   └── generator.ts      # Auto-generates 71 tools from OpenAPI
│   └── shared/               # Common utilities
│       ├── github-cache.ts   # GitHub fetch, SHA check, cache dir, timeout
│       ├── types.ts          # Shared type definitions (ApiEndpoint, etc.)
│       └── openapi-parser.ts # OpenAPI JSON → ApiEndpoint map
```

## Cache Layout

```
~/.cache/gameball-integrations/
├── manifest.json             # Docs cache manifest (commitSha, file list)
├── [__-delimited .mdx files] # Cached documentation pages
├── openapi-manifest.json     # OpenAPI cache manifest (commitSha, timestamp)
└── openapi.json.gz           # Gzip-compressed OpenAPI spec
```

## Usage Examples

### Learning about Gameball

```
Use docs-lookup-topic to learn about "customer referrals"
Use docs-get-doc to read "tutorials-new/referral-setup"
Use docs-generate-code-example for JavaScript customer creation
```

### Making API Calls

```
Use create-customer to register a new customer
Use cashback-transaction to reward points
Use query-transactions to check transaction history
```

### Checking Server Health

```
Use gameball-status to see subsystem status, config, and cache info
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with auto-reload)
npm run dev

# Build for production
npm run build

# Run built version
npm start
```

## Requirements

- Node.js >= 20
- For integration tools: Valid Gameball API credentials

## License

MIT

## Links

- [Gameball Documentation](https://docs.gameball.co)
- [Gameball API Reference](https://api.gameball.co)
- [MCP Protocol](https://modelcontextprotocol.io)

## Support

For issues or questions:
- Documentation tools: Check cache at `~/.cache/gameball-integrations/`
- Integration tools: Verify API credentials in environment variables
- GitHub Issues: [Report bugs or request features]
