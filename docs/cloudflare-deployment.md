# Deploying CookBook to Cloudflare

This guide walks you through deploying the CookBook app to Cloudflare using **Cloudflare Pages** with GitHub integration. The app uses D1 (SQLite), KV, R2, and NuxtHub; everything runs natively on Cloudflare.

---

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- The CookBook repository connected to GitHub
- [Bun](https://bun.sh) or Node.js 18+ (for local builds and commands)

---

## 1. Create Cloudflare resources

Create the following resources in the [Cloudflare dashboard](https://dash.cloudflare.com). Note each **ID** and **name**; you will need them for configuration and environment variables.

### 1.1 D1 database

1. Go to **Workers & Pages** → **D1** → **Create database**.
2. Name it (e.g. `cookbook-db`).
3. Choose a region (or leave default).
4. Click **Create**.
5. Open the new database and copy the **Database ID** (UUID). You will use this as `CLOUDFLARE_D1_DATABASE_ID`.

### 1.2 KV namespaces (two)

1. Go to **Workers & Pages** → **KV** → **Create a namespace**.
2. Create the first namespace (e.g. `cookbook-kv`). Copy its **Namespace ID** → this is `CLOUDFLARE_KV_NAMESPACE_ID`.
3. Create the second namespace (e.g. `cookbook-cache`). Copy its **Namespace ID** → this is `CLOUDFLARE_CACHE_NAMESPACE_ID`.

### 1.3 R2 bucket

1. Go to **R2** → **Create bucket**.
2. Name it (e.g. `cookbook-blob`). This name is `CLOUDFLARE_R2_BUCKET_NAME`.
3. Click **Create bucket**.

---

## 2. Configure the project for your D1 database (optional, for local migrations)

If you want to run D1 migrations from your machine (e.g. `npx wrangler d1 migrations apply DB --remote`), set your D1 database ID in the repo:

1. Open `wrangler.jsonc` in the project root.
2. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with your D1 **Database ID** (the UUID from step 1.1).

If you only deploy via Cloudflare Pages and run migrations in the build (see below), you can leave the placeholder; the build uses environment variables instead.

---

## 3. Create a Cloudflare API token (for migrations in the build)

The Pages build will run `wrangler d1 migrations apply`, which needs a Cloudflare API token.

1. Go to **My Profile** → **API Tokens** → **Create Token**.
2. Use the **Edit Cloudflare Workers** template, or create a custom token with:
   - **Account** → **Cloudflare Workers Scripts** → Edit
   - **Account** → **D1** → Edit
   - **Account** → **Workers KV Storage** → Edit
   - **Account** → **R2** → Edit
3. Create the token and copy it. Store it as **CLOUDFLARE_API_TOKEN** in your Pages environment variables (see step 5).
4. In the dashboard, note your **Account ID** (from the right-hand sidebar or the Workers overview). This is **CLOUDFLARE_ACCOUNT_ID**.

---

## 4. Connect the repository to Cloudflare Pages

1. Go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Select your GitHub account and authorise Cloudflare if prompted.
3. Choose the **CookBook repository**.
4. Configure the project as follows.

### Build configuration

| Setting | Value |
|--------|--------|
| **Production branch** | `main` (or your default branch) |
| **Framework preset** | None |
| **Build command** | See below |
| **Build output directory** | `dist` (Cloudflare Pages preset uses this) |

### Build command (includes D1 migrations)

The app does not run migrations at build time (`applyMigrationsDuringBuild: false`) because D1 is not available during the Nuxt build. Run migrations in the same build step after the build.

With **Cloudflare Pages**, Nitro generates the worker config at `dist/_worker.js/wrangler.json`. Use:

```bash
bun install && bun run build && node scripts/patch-wrangler-d1-migrations.mjs && npx wrangler d1 migrations apply DB --remote --config dist/_worker.js/wrangler.json
```

The patch script finds and patches whichever wrangler config exists (`dist/_worker.js/wrangler.json`, `dist/wrangler.json`, or `.output/wrangler.json`). The migrations command must use the same path; for a standard Pages deploy it is `dist/_worker.js/wrangler.json`.

Click **Save** and run a first deployment to confirm the build and migrations succeed.

### 4b. Add platform bindings

In your Pages project: **Settings** → **Functions** → scroll to **Bindings**. Add:

| Type | Binding name | Resource |
|------|-------------|----------|
| **D1 Database** | `DB` | Select your D1 database (e.g. `cookbook-db`) |
| **KV Namespace** | `KV` | Select your KV namespace (e.g. `cookbook-kv`) |
| **KV Namespace** | `CACHE` | Select your cache KV namespace (e.g. `cookbook-cache`) |
| **R2 Bucket** | `BLOB` | Select your R2 bucket (e.g. `cookbook-blob`) |

NuxtHub reads these bindings automatically at runtime. Do **not** pass resource IDs as environment variables — that causes duplicate binding errors.

---

## 5. Set environment variables

In your Pages project: **Settings** → **Environment variables**. Add the following for **Production** (and optionally **Preview** if you use branch deploys).

### Required for build (D1 migrations)

| Variable | Description | Encrypted (secret)? |
|----------|-------------|----------------------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | No |
| `CLOUDFLARE_API_TOKEN` | API token with Workers, D1, KV, R2 permissions | **Yes** |

> **Note:** D1, KV, R2, and Cache bindings are configured via the Cloudflare Pages dashboard (**Settings → Functions → Bindings**), not environment variables. NuxtHub reads them from the platform at runtime. See step 4b below.

### Required for the app (runtime)

| Variable | Description | Encrypted? |
|----------|-------------|------------|
| `BETTER_AUTH_SECRET` | Strong random secret (e.g. 32+ characters) | **Yes** |
| `BETTER_AUTH_URL` | Production URL (e.g. `https://your-project.pages.dev`) | No |
| `NUXT_SESSION_PASSWORD` | Session encryption password (min 32 characters) | **Yes** |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | No |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | **Yes** |

### Optional

| Variable | Description |
|----------|-------------|
| `SPOON_API_KEY` | Spoonacular API key (for nutrition/ingredient features) |
| `ADMIN_GITHUB_IDS` | Comma-separated GitHub user IDs for admin users |
| `MIGRATION_SECRET` | Secret for the `/api/migrate` content-import endpoint |

After adding variables, trigger a new deployment (e.g. **Deployments** → **Retry deployment** or push a commit) so the build and runtime use them.

---

## 6. Update GitHub OAuth for production

1. Open [GitHub → Developer settings → OAuth Apps](https://github.com/settings/developers) and select your CookBook OAuth App (or create one).
2. Set **Homepage URL** to your production URL (e.g. `https://your-project.pages.dev`).
3. Set **Authorization callback URL** to `https://your-project.pages.dev/api/auth/callback/github` (replace with your actual Pages URL).
4. Save. Ensure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in Cloudflare match this app.

---

## 7. Deploy and verify

1. Push a commit to the production branch or use **Retry deployment** in the Pages dashboard.
2. Wait for the build to finish. The build command will install dependencies, build the app, patch the wrangler config, and apply D1 migrations.
3. Open your Pages URL (e.g. `https://your-project.pages.dev`).
4. Check that the app loads, you can sign in with GitHub, and you can create or view recipes.
5. (Optional) To seed recipes from `content/recipes/`, call the migrate endpoint once:

   ```bash
   curl -X POST https://your-project.pages.dev/api/migrate \
     -H "Authorization: Bearer YOUR_MIGRATION_SECRET"
   ```

   Use the same value you set for `MIGRATION_SECRET` in the Pages environment variables.

---

## 8. Custom domain (optional)

1. In your Pages project, go to **Custom domains** → **Set up a custom domain**.
2. Add your domain and follow the DNS instructions (CNAME or proxy).
3. After the domain is active, update **BETTER_AUTH_URL** and the GitHub OAuth callback URL to use the custom domain instead of `*.pages.dev`.

---

## Troubleshooting

### Build fails with "DB binding not found"

Prerender is disabled for routes that need the database (`/`, `/api/search.json`) because D1 is not available at build time. If you see DB-related errors during build, ensure `routeRules` in `nuxt.config.ts` keep those routes as `prerender: false`.

### Migrations step fails in the build

- Ensure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set in the Pages environment variables.
- Ensure the token has **D1** and **Workers** permissions.
- Check that the build command uses the correct config path (`dist/wrangler.json` or `.output/wrangler.json`) after the patch script runs.

### Wrangler config not found

The patch script looks for `dist/_worker.js/wrangler.json`, then `dist/wrangler.json`, then `.output/wrangler.json` after `bun run build`. Cloudflare Pages uses `dist/_worker.js/wrangler.json`. Ensure your build command uses `--config dist/_worker.js/wrangler.json` for the migrations step. If your preset writes the config elsewhere, add that path to the `candidates` array in `scripts/patch-wrangler-d1-migrations.mjs` and use the same path in the `wrangler d1 migrations apply` command.

### Blank or 500 errors after deploy

- Confirm all runtime environment variables are set (especially `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NUXT_SESSION_PASSWORD`, and GitHub OAuth vars).
- Check the **Functions** or **Deployments** logs in the Pages dashboard for runtime errors.
- Ensure the GitHub OAuth callback URL exactly matches your deployed URL (including `https://` and no trailing slash except as required).

---

## Summary checklist

- [ ] D1 database created; ID copied
- [ ] Two KV namespaces created; IDs copied
- [ ] R2 bucket created; name noted
- [ ] API token created with D1, Workers, KV, R2 permissions
- [ ] Pages project connected to GitHub; build command includes migrations
- [ ] All environment variables set (build and runtime)
- [ ] GitHub OAuth App callback URL updated to production URL
- [ ] First deployment successful; app and sign-in tested
- [ ] (Optional) Custom domain and BETTER_AUTH_URL updated
