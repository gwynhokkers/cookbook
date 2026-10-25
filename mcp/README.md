# cookbook-mcp

A Cloudflare Worker that serves the Humboldt Kitchen cookbook as an [MCP](https://modelcontextprotocol.io) server for AI agents.

It is separate from the Nuxt app, which runs on Cloudflare Pages. It reads the same D1 database.

## What it does today

One tool, `get_recipe`. Given a recipe id, it returns a **public** recipe with its ingredients (in order) and steps. Private and unknown ids both answer `Recipe not found: <id>`, so a caller can't tell a private recipe exists. Image paths are returned as absolute URLs on `APP_ORIGIN`.

The public-only filter is the guest case of `viewRecipe` in `shared/utils/abilities.ts`, written as a query. Keep the two in step until INK-384 makes abilities callable from the Worker.

There is no sign-in yet. OAuth arrives in INK-379.

## How it is built

- `createMcpHandler` from the Agents SDK (`agents/mcp/server`) with an MCP SDK v2 server (`@modelcontextprotocol/server`). It is stateless: each request builds a fresh server, and there is no Durable Object. `McpAgent` is deprecated, so it is not used.
- Streamable HTTP only, at `/mcp`. The old HTTP+SSE transport (`/sse`) is deprecated in the MCP spec and not served.
- Drizzle reads D1 using the app's own schema, `server/db/schema.ts`.
- Tool schemas use zod 4 through the `zod4` alias, because the Nuxt app is still on zod 3.

| File | Role |
| --- | --- |
| `src/index.ts` | Worker entry: binds D1 to Drizzle |
| `src/worker.ts` | `createWorker(getDb)`: the fetch handler, served at `/mcp` |
| `src/server.ts` | The MCP server and its tools |
| `src/getPublicRecipe.ts` | The recipe query |

## Bindings

| Binding | Type | Notes |
| --- | --- | --- |
| `DB` | D1 | The app's database (`cookbook`). The Worker only runs `SELECT`s. D1 has no read-only binding, so read-only is enforced by the code, not the platform. |
| `APP_ORIGIN` | var | The cookbook web app's origin, used to make image URLs absolute. |

The Pages app owns the D1 migrations (`server/db/migrations/sqlite`). Don't add a `migrations_dir` to this Worker's config.

## Local development

From the repo root:

```bash
bun install
```

`wrangler dev` uses a local, empty D1. Apply the app's migrations to it once, from `mcp/`:

```bash
cd mcp
for f in ../server/db/migrations/sqlite/*.sql; do bunx wrangler d1 execute DB --local --file "$f"; done
```

Add a public recipe to try it with:

```bash
bunx wrangler d1 execute DB --local --command "INSERT INTO recipes (id, title, date, visibility, created_at, updated_at) VALUES ('dal', 'Tarka dal', 0, 'public', 0, 0);"
```

Start the Worker (from the repo root):

```bash
bun run mcp:dev
```

It serves `http://localhost:8787/mcp`. Check it with the MCP Inspector:

```bash
bunx @modelcontextprotocol/inspector --cli http://localhost:8787/mcp --transport http --method tools/call --tool-name get_recipe --tool-arg recipeId=dal
```

Or run `bunx @modelcontextprotocol/inspector` for the web UI, choose **Streamable HTTP** and connect to the same URL.

## Tests and types

```bash
bun run test tests/mcp
bun run mcp:typecheck
```

The tests run the Worker's fetch handler against an in-memory SQLite database built from the real migrations.

## Deploying

The Worker has not been deployed yet; only a `--dry-run` build has been checked.

```bash
bunx wrangler deploy -c mcp/wrangler.jsonc
```

This publishes to `cookbook-mcp.<account>.workers.dev`. A CI pipeline and custom domain come in INK-380. `createMcpHandler` only accepts requests addressed to localhost or the Worker's `workers.dev` hostname by default, so a custom domain needs its `allowedHostnames` option.
