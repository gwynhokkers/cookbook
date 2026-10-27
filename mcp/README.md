# cookbook-mcp

A Cloudflare Worker that serves the Humboldt Kitchen cookbook as an [MCP](https://modelcontextprotocol.io) server for AI agents.

It is separate from the Nuxt app, which runs on Cloudflare Pages. It reads the same D1 database.

## What it does today

Agents connect with OAuth and sign in with GitHub. One tool, `get_recipe`. Given a recipe id, it returns the recipe with its ingredients (in order) and steps. Unknown ids answer `Recipe not found: <id>`. Image paths are returned as absolute URLs on `APP_ORIGIN`.

Every `/mcp` request needs a token, so every caller is signed in and can read private recipes. The query (`getRecipe`) still takes a `null` viewer for the guest case, which is the public-only rule of `viewRecipe` in `shared/utils/abilities.ts`. Keep the two in step until INK-384 makes abilities callable from the Worker.

### Sign-in is invite-only

The GitHub callback looks up the existing `users` row by `githubId`, using the app's own `decideOAuthLogin` with no invite and no env-admin override, so it can only sign in or reject. It never creates or updates users. A GitHub account with no cookbook user, or one only linked by email or Google, is sent back to the client with `access_denied`. If GitHub itself fails, the client gets `server_error`. Sign in to the web app with GitHub once to link it.

The grant stores only `{ userId }`. The user's row (and role) is read from D1 on every `/mcp` request; if the user has been deleted the request gets `401`, and re-authorizing then fails at the callback.

## How it is built

- `createMcpHandler` from the Agents SDK (`agents/mcp/server`) with an MCP SDK v2 server (`@modelcontextprotocol/server`). It is stateless: each request builds a fresh server, and there is no Durable Object. `McpAgent` is deprecated, so it is not used.
- `OAuthProvider` from `@cloudflare/workers-oauth-provider` (1.x) wraps it. The provider serves discovery, Dynamic Client Registration (`/register`) and the token endpoint (`/token`, including refresh and revocation), and only lets requests with a valid token through to `/mcp`, with the grant props in `ctx.props`.
- `/authorize` is ours: a consent page (required because any client can register itself), then a redirect to GitHub. `/callback` finishes the GitHub sign-in and issues the grant.
- Streamable HTTP only, at `/mcp`. The old HTTP+SSE transport (`/sse`) is deprecated in the MCP spec and not served.
- Drizzle reads D1 using the app's own schema, `server/db/schema.ts`.

| File | Role |
| --- | --- |
| `src/index.ts` | Worker entry: binds D1 to Drizzle |
| `src/oauthWorker.ts` | `createOAuthWorker(getDb)`: the `OAuthProvider` around everything |
| `src/authHandler.ts` | `/authorize` (consent, then GitHub) and `/callback` |
| `src/githubLogin.ts` | Matches a GitHub profile to an existing user |
| `src/worker.ts` | `createWorker(getDb)`: the `/mcp` handler; loads the signed-in user |
| `src/signedInUser.ts` | The grant props shape; reads the signed-in user and role from D1 |
| `src/server.ts` | The MCP server and its tools |
| `src/getRecipe.ts` | The recipe query |

| Endpoint | Served by |
| --- | --- |
| `/mcp` | MCP, token required |
| `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server` | Provider (discovery) |
| `/register`, `/token` | Provider |
| `/authorize`, `/callback` | `authHandler.ts` |

## Bindings, vars and secrets

| Name | Type | Notes |
| --- | --- | --- |
| `DB` | D1 | The app's database (`cookbook`). The Worker only runs `SELECT`s. D1 has no read-only binding, so read-only is enforced by the code, not the platform. |
| `OAUTH_KV` | KV | OAuth clients, grants and tokens. Tokens and secrets are stored hashed; grant props are encrypted. |
| `APP_ORIGIN` | var | The cookbook web app's origin, used to make image URLs absolute. |
| `MCP_ORIGIN` | var | This Worker's own origin. It is the OAuth issuer, and tokens are issued for `${MCP_ORIGIN}/mcp`, so it must match the URL clients connect to. |
| `GITHUB_CLIENT_ID` | secret | GitHub OAuth app for MCP sign-in |
| `GITHUB_CLIENT_SECRET` | secret | |

The MCP Worker needs its **own** GitHub OAuth app (a GitHub OAuth app has one callback URL, and the web app's points at the Pages site). Its callback URL is `${MCP_ORIGIN}/callback`.

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

Add yourself and a private recipe to try it with (use your numeric GitHub id, from `https://api.github.com/users/<login>`):

```bash
bunx wrangler d1 execute DB --local --command "INSERT INTO users (id, email, role, github_id, created_at, updated_at) VALUES ('me', 'me@example.com', 'editor', '<your GitHub id>', 0, 0);"
bunx wrangler d1 execute DB --local --command "INSERT INTO recipes (id, title, date, visibility, created_at, updated_at) VALUES ('dal', 'Tarka dal', 0, 'private', 0, 0);"
```

Create a GitHub OAuth app for local use (GitHub → Settings → Developer settings → OAuth Apps) with homepage `http://localhost:8787` and callback URL `http://localhost:8787/callback`. Copy `mcp/.dev.vars.example` to `mcp/.dev.vars` and fill in its client id and secret. `.dev.vars` is gitignored. Local KV needs no setup.

Start the Worker (from the repo root):

```bash
bun run mcp:dev
```

It serves `http://localhost:8787/mcp`. Connect with the MCP Inspector, which runs the whole OAuth flow in your browser:

```bash
bunx @modelcontextprotocol/inspector
```

Choose **Streamable HTTP**, enter `http://localhost:8787/mcp`, and use **Open Auth Settings → Quick OAuth Flow** (or just **Connect**). You'll see the consent page, then GitHub. Then call `get_recipe` with `recipeId=dal`.

## Tests and types

```bash
bun run test tests/mcp
bun run mcp:typecheck
```

The tests run the Worker against an in-memory SQLite database built from the real migrations and an in-memory KV. `oauthFlow.test.ts` runs the whole flow (register, consent, GitHub callback with GitHub's API stubbed, token, `/mcp`, refresh). The provider imports `cloudflare:workers`, which Vitest aliases to `tests/mcp/cloudflareWorkersStub.ts`.

## Deploying

One-time setup for production:

1. Create the KV namespace and put its id in `wrangler.jsonc` (`OAUTH_KV`):

   ```bash
   bunx wrangler kv namespace create OAUTH_KV -c mcp/wrangler.jsonc
   ```

2. Create a GitHub OAuth app with homepage `https://cookbook-mcp.gwyn-29d.workers.dev` and callback URL `https://cookbook-mcp.gwyn-29d.workers.dev/callback`, then set its secrets:

   ```bash
   bunx wrangler secret put GITHUB_CLIENT_ID -c mcp/wrangler.jsonc
   bunx wrangler secret put GITHUB_CLIENT_SECRET -c mcp/wrangler.jsonc
   ```

Then:

```bash
bunx wrangler deploy -c mcp/wrangler.jsonc
```

This publishes to `cookbook-mcp.<account>.workers.dev`. A CI pipeline and custom domain come in INK-380. For a custom domain, change `MCP_ORIGIN` (tokens issued for the old origin stop working, so clients reconnect), point the GitHub app's callback at it, and pass `allowedHostnames` to `createMcpHandler`, which by default only accepts localhost and the `workers.dev` hostname.
