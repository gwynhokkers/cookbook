# cookbook-mcp

A Cloudflare Worker that serves the Humboldt Kitchen cookbook as an [MCP](https://modelcontextprotocol.io) server for AI agents.

It is separate from the Nuxt app, which runs on Cloudflare Pages. It reads the same D1 database.

## What it does today

Agents connect with OAuth and sign in with GitHub or Google. Every tool is read-only and needs the `recipes:read` scope:

| Tool | Does | Same as |
| --- | --- | --- |
| `get_recipe` | One recipe by id, with its ingredients (in order) and steps. Unknown ids answer `Recipe not found: <id>`. | `GET /api/recipes/:id` |
| `search_recipes` | Ranked search on a query of two or more characters, 12 per page, with the tag, source, diet and time filters. | `GET /api/recipes/search?q=` |
| `list_recipes` | Newest first, 12 per page, with the same filters. | `GET /api/recipes/search` with no query (the web's filtered browsing) |
| `list_tags` | Tags in alphabetical order, without diet tags, optionally narrowed by `q`. | `GET /api/recipes/tags` |
| `list_sources` | Sources in alphabetical order, optionally narrowed by `q`. | `GET /api/recipes/sources` |

They all call the shared queries in `server/domain/recipes/`. Image paths are returned as absolute URLs on `APP_ORIGIN`. The search ranks the user's favourites higher, as on the web.

Every `/mcp` request needs a token, so every caller is signed in and can read private recipes. The queries still take a `null` viewer for the guest case, which is the public-only rule of `viewRecipe` in `shared/utils/abilities.ts`. Keep the two in step until INK-384 makes abilities callable from the Worker.

### Sign-in is invite-only

The consent page has one button per sign-in provider: GitHub always, and Google when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Both return to `/callback`, which looks up the existing `users` row by `githubId` or `googleId`, using the app's own `decideOAuthLogin` with no invite and no env-admin override, so it can only sign in or reject. It never creates or updates users. An account with no cookbook user, or one only matching by email or linked through the other provider, is sent back to the client with `access_denied`. If the provider itself fails, the client gets `server_error`. Sign in to the web app with GitHub or Google once to link it.

### Scopes

| Scope | Lets the agent |
| --- | --- |
| `recipes:read` | Read recipes, their tags and sources |
| `recipes:write` | Create, edit and delete recipes |
| `favorites:write` | Add and remove your favourite recipes |
| `shopping:read` | Read your shopping lists |
| `shopping:write` | Change your shopping lists |

The consent page lists the scopes the client asked for, ignoring unknown ones. If it asked for none, it gets `recipes:read`, which is also advertised as the resource's required scope. The user allows or denies the whole list. Each tool checks that its scope was granted and that the user's role, read from D1 on every call, may use it (`scopeRoles` in `src/scopes.ts`: `recipes:write` is editors and admins only, everything else any role). Either failure returns a tool error that says which.

The grant stores `{ userId, scopes }`. The user's row (and role) is read from D1 on every `/mcp` request; if the user has been deleted the request gets `401`, and re-authorizing then fails at the callback. Grants issued before scopes existed have none, so those clients must reconnect.

## How it is built

- `createMcpHandler` from the Agents SDK (`agents/mcp/server`) with an MCP SDK v2 server (`@modelcontextprotocol/server`). It is stateless: each request builds a fresh server, and there is no Durable Object. `McpAgent` is deprecated, so it is not used.
- `OAuthProvider` from `@cloudflare/workers-oauth-provider` (1.x) wraps it. The provider serves discovery, Dynamic Client Registration (`/register`) and the token endpoint (`/token`, including refresh and revocation), and only lets requests with a valid token through to `/mcp`, with the grant props in `ctx.props`.
- `/authorize` is ours: a consent page (required because any client can register itself), then a redirect to GitHub or Google. `/callback` finishes the sign-in and issues the grant.
- Streamable HTTP only, at `/mcp`. The old HTTP+SSE transport (`/sse`) is deprecated in the MCP spec and not served.
- Drizzle reads D1 using the app's own schema, `server/db/schema.ts`.

| File | Role |
| --- | --- |
| `src/index.ts` | Worker entry: binds D1 to Drizzle |
| `src/oauthWorker.ts` | `createOAuthWorker(getDb)`: the `OAuthProvider` around everything |
| `src/authHandler.ts` | `/authorize` (consent, then GitHub or Google) and `/callback` |
| `src/providerLogin.ts` | Matches a GitHub or Google profile to an existing user |
| `src/scopes.ts` | The scopes, their descriptions, and what a grant gets |
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
| `GOOGLE_CLIENT_ID` | secret | Optional. Google OAuth client for MCP sign-in; without both Google values the consent page offers only GitHub. |
| `GOOGLE_CLIENT_SECRET` | secret | |

Each environment needs its **own** GitHub OAuth app (a GitHub OAuth app has one callback URL, and the web app's points at the Pages site). Its callback URL is `${MCP_ORIGIN}/callback`.

A Google OAuth client can have several redirect URIs, so the web app's client can be reused by every environment: add each `${MCP_ORIGIN}/callback` to its **Authorized redirect URIs** in Google Cloud Console.

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

Choose **Streamable HTTP**, enter `http://localhost:8787/mcp`, and use **Open Auth Settings → Quick OAuth Flow** (or just **Connect**). You'll see the consent page, then GitHub (or Google, if configured). Then call `get_recipe` with `recipeId=dal`, or `search_recipes` with `query=dal`.

## Tests and types

```bash
bun run test tests/mcp
bun run mcp:typecheck
```

The tests run the Worker against an in-memory SQLite database built from the real migrations and an in-memory KV. `oauthFlow.test.ts` runs the whole flow (register, consent, GitHub and Google callbacks with their APIs stubbed, scopes, token, `/mcp`, refresh). The provider imports `cloudflare:workers`, which Vitest aliases to `tests/mcp/cloudflareWorkersStub.ts`.

## Deploying

GitHub Actions deploys the Worker (`.github/workflows/mcp-deploy.yml`). Each run typechecks the Worker, runs the whole test suite, then runs `wrangler deploy`:

| Push to | Deploys | Address | Wrangler environment |
| --- | --- | --- | --- |
| `main` | `cookbook-mcp` (production) | `https://mcp.humboldt.inkythesquid.dev` | top level |
| `release/cycle-*` | `cookbook-mcp-preview` | `https://cookbook-mcp-preview.gwyn-29d.workers.dev` | `preview` |

You can also run the workflow by hand (**Actions → Deploy MCP Worker → Run workflow**): the branch you pick deploys to production if it is `main`, otherwise to preview. Previews share one Worker, so the latest deploy wins.

Both environments read the production D1, as the website's preview deploys do; they have separate KV namespaces, so tokens from one don't work on the other. Production serves only its custom domain: `workers_dev` and preview URLs are off, because OAuth ties tokens to `MCP_ORIGIN` and no other address could sign anyone in. The custom domain needs no `allowedHostnames`: `createMcpHandler` only checks the `Host` header on localhost and `workers.dev`, and leaves custom domains to Cloudflare's routing.

The workflow never applies D1 migrations; the Pages app owns them.

### Secrets

| Where | Name | Notes |
| --- | --- | --- |
| GitHub repository secret | `CLOUDFLARE_API_TOKEN` | An account API token with **Workers: Editor** on this account and **Zone → Workers Routes → Write** on `inkythesquid.dev` (to attach the custom domain). Editor can only update Workers that exist, which both do; creating a new one needs Workers Admin, so do that by hand. The account id is in `wrangler.jsonc`. |
| Worker secret, each environment | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | That environment's GitHub OAuth app |
| Worker secret, each environment | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. The shared Google client |

Worker secrets live on the Worker and survive deploys, so CI never needs them. Set them once per environment (add `--env preview` for preview):

```bash
bunx wrangler secret put GITHUB_CLIENT_ID -c mcp/wrangler.jsonc
bunx wrangler secret put GITHUB_CLIENT_SECRET -c mcp/wrangler.jsonc
bunx wrangler secret put GOOGLE_CLIENT_ID -c mcp/wrangler.jsonc
bunx wrangler secret put GOOGLE_CLIENT_SECRET -c mcp/wrangler.jsonc
```

### OAuth callbacks

| Environment | GitHub OAuth app callback URL | Google redirect URI |
| --- | --- | --- |
| production | `https://mcp.humboldt.inkythesquid.dev/callback` | the same |
| preview | `https://cookbook-mcp-preview.gwyn-29d.workers.dev/callback` | the same |

### Changing `MCP_ORIGIN`

Tokens are issued for `${MCP_ORIGIN}/mcp`, so changing an environment's address means every connected client must reconnect. Move that environment's GitHub app callback and Google redirect URI to the new address before the deploy, or sign-in fails until you do.

### Before the first production deploy from `main`

That deploy moves production from `https://cookbook-mcp.gwyn-29d.workers.dev` to `https://mcp.humboldt.inkythesquid.dev` and turns the old address off. In order:

1. Create the `CLOUDFLARE_API_TOKEN` (see the secrets table) and add it as a GitHub repository secret.
2. Change the production GitHub OAuth app's homepage and callback URL to the new address, and add the new callback to the Google client's redirect URIs.
3. Merge `release/cycle-<n>` into `main`. The workflow deploys and attaches the custom domain; Cloudflare creates its DNS record and certificate, which can take a few minutes.
4. Reconnect your MCP clients to `https://mcp.humboldt.inkythesquid.dev/mcp`.

A new environment's KV namespace is created with `bunx wrangler kv namespace create <name>`; put its id in that environment's `kv_namespaces`.

### Deploying by hand

```bash
bunx wrangler deploy -c mcp/wrangler.jsonc --env=           # production
bunx wrangler deploy -c mcp/wrangler.jsonc --env preview    # preview
```
