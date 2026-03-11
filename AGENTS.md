# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Megwyn CookBook is a full-stack Nuxt 4 recipe management app using NuxtHub (Cloudflare-targeted), SQLite/D1 in production, and Drizzle ORM. See `README.md` for full details. Deployment docs at `docs/cloudflare-deployment.md`.

### Running the dev server

```bash
bun run dev
```

Runs on `http://localhost:3000`. NuxtHub auto-provisions PGlite (embedded PostgreSQL), blob storage, KV, and cache in dev mode — no external services required.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `bun install` |
| Dev server | `bun run dev` |
| Lint | `bun run lint` |
| Typecheck | `bun run typecheck` |
| Build | `bun run build` |
| Generate DB migrations | `npx nuxt db generate` |

### Non-obvious gotchas

- **`better-sqlite3` required by `@nuxt/content`**: Already in devDependencies. If missing, `nuxt prepare` will interactively prompt — the update script handles this via `bun install`.
- **Local dev DB**: NuxtHub uses an embedded SQLite database locally (no external DB needed). Production uses Cloudflare D1.
- **Seeding data**: Use `curl -X POST http://localhost:3000/api/migrate -H "Authorization: Bearer migration-secret"` to import the 4 sample recipes from `content/recipes/` into the database.
- **Auth is optional for browsing**: GitHub OAuth (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) is only needed for login/recipe creation. The app works for read-only browsing of public recipes without it.
- **Authorization via `nuxt-authorization`**: All permissions are defined as abilities in `shared/utils/abilities.ts`. Server routes use `authorize(event, ability)` / `allows(event, ability)`. Frontend uses `<Can :ability="...">` components and `denies(ability)` in middleware. Resolvers connect to `nuxt-auth-utils` via plugins in `app/plugins/authorization-resolver.ts` and `server/plugins/authorization-resolver.ts`.
- **Role-based access**: Users have roles (`viewer`/`editor`/`admin`). Editors can CRUD recipes. Admins can also manage user roles at `/admin/users`. Set `ADMIN_GITHUB_IDS` env var (comma-separated GitHub user IDs) to auto-promote users to admin on login.
- **Recipe visibility**: Recipes have `visibility` (`public`/`private`). Unauthenticated users see only public recipes. Signed-in users see all.
- **Hub config**: `hub.db` must be `'sqlite'` (not an object with `connection.databaseId`). Passing resource IDs via env vars creates duplicate wrangler bindings. Bindings are managed via Cloudflare Pages dashboard instead.
- **Pre-existing lint/type errors**: The codebase has ~340 ESLint errors and type errors. These are pre-existing and not blocking dev server startup.
