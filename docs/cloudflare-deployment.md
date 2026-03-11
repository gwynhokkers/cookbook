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

## 2. Wrangler config is the source of truth

This project uses a **Wrangler configuration file** (`wrangler.jsonc` in the repo root) with `pages_build_output_dir`. That makes the file the **source of truth** for your Pages project: [you cannot edit bindings or non-secret environment variables in the dashboard](https://developers.cloudflare.com/pages/functions/wrangler-configuration/#source-of-truth). The dashboard will show: *"Environment variables for this project are being managed through wrangler. Only Secrets (encrypted variables) can be managed via the Dashboard."*

- **Bindings** (D1, KV, R2, Workers AI) and **non-secret vars** → define them in `wrangler.jsonc`.
- **Secrets** (encrypted values) → set them in **Settings → Environment variables** in the dashboard; only these remain editable there.

If bindings or vars “disappear”, it’s usually because the deployed config was a minimal generated wrangler (e.g. from the build output) instead of this full `wrangler.jsonc`. Commit and deploy with the complete `wrangler.jsonc` from this repo so Pages uses it.

### Fill in `wrangler.jsonc`

1. Open `wrangler.jsonc` in the project root.
2. Replace every placeholder:
   - **KV / CACHE** → `id` with your KV namespace IDs (from Workers & Pages → KV).
   - **BLOB** → `bucket_name` with your R2 bucket name (e.g. `cookbook-blob`).
   - **vars.GITHUB_CLIENT_ID** → your GitHub OAuth Client ID.
   - **vars.BETTER_AUTH_URL** → your production URL (e.g. `https://cookbook.megwyn.co.uk`).
   - **vars.ADMIN_GITHUB_IDS** → optional; comma-separated GitHub user IDs for admin.
3. D1 `database_id` is already set; change it only if you use a different D1 database.
4. If you don’t use Workers AI (recipe-from-image), you can remove the `"ai"` block.

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

### 4b. Bindings and vars (in wrangler.jsonc)

Bindings and non-secret vars are defined in **`wrangler.jsonc`** (see step 2). Ensure every placeholder in that file is replaced with your real IDs and values. NuxtHub reads the bindings at runtime. If you add an API route that calls `extractRecipeFromImage`, pass the request event so the AI binding is used: `extractRecipeFromImage(imageBase64, event)`.

---

## 5. Set Secrets (dashboard) and build vars

Because `wrangler.jsonc` is the source of truth, **non-secret** runtime vars (`BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `ADMIN_GITHUB_IDS`) live in **`wrangler.jsonc` under `vars`** (see step 2). Only **Secrets** and **build-time** vars are set in the dashboard.

In your Pages project: **Settings** → **Environment variables**. Add:

### Build (migrations)

| Variable | Encrypted? | Description |
|----------|------------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | No | Your Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | **Yes** | API token with Workers, D1, KV, R2 permissions |

### Runtime (Secrets only — these are the only runtime vars you can set in the dashboard)

| Variable | Encrypted? | Description |
|----------|------------|-------------|
| `NUXT_SESSION_PASSWORD` | **Yes** | Session encryption password (min 32 characters) |
| `GITHUB_CLIENT_SECRET` | **Yes** | GitHub OAuth App Client Secret |

### Optional Secrets

| Variable | Description |
|----------|-------------|
| `SPOON_API_KEY` | Spoonacular API key (nutrition/ingredient features) |
| `MIGRATION_SECRET` | Secret for the `/api/migrate` content-import endpoint |

After adding, trigger a new deployment so the build and runtime use them.

---

## 6. Update GitHub OAuth for production

1. Open [GitHub → Developer settings → OAuth Apps](https://github.com/settings/developers) and select your CookBook OAuth App (or create one).
2. Set **Homepage URL** to your production URL (e.g. `https://cookbook.megwyn.co.uk`).
3. Set **Authorization callback URL** to `https://your-domain/auth/github` (e.g. `https://cookbook.megwyn.co.uk/auth/github` — this app uses `/auth/github`, not `/api/auth/callback/github`).
4. Save. Ensure `GITHUB_CLIENT_ID` in `wrangler.jsonc` and `GITHUB_CLIENT_SECRET` (Secret) in the dashboard match this app.

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

## If your variables or bindings keep disappearing

When your project uses a Wrangler file with `pages_build_output_dir`, that file is the [source of truth](https://developers.cloudflare.com/pages/functions/wrangler-configuration/#source-of-truth). The dashboard will show: *"Environment variables for this project are being managed through wrangler. Only Secrets (encrypted variables) can be managed via the Dashboard."*

If bindings or non-secret vars seemed to “disappear”, it’s usually because Pages was using a **minimal generated** wrangler config (e.g. from the build output) instead of your repo’s full `wrangler.jsonc`. Fix it by:

1. Ensuring **`wrangler.jsonc`** in the repo root contains all bindings (D1, KV, CACHE, R2, AI) and all non-secret **vars** (see step 2).
2. Replacing every placeholder in that file with your real resource IDs and values.
3. Setting **Secrets** in **Settings** → **Environment variables** (only encrypted vars are editable there).
4. Deploying again (push a commit or **Retry deployment**) so Pages picks up the repo’s `wrangler.jsonc`.

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

- Confirm `wrangler.jsonc` has no placeholders left and Secrets are set in the dashboard (`NUXT_SESSION_PASSWORD`, `GITHUB_CLIENT_SECRET`).
- Check **Functions** or **Deployments** logs in the Pages dashboard for runtime errors.
- Ensure the GitHub OAuth callback URL is exactly `https://your-domain/auth/github` (no trailing slash).

---

## Summary checklist

- [ ] D1 database created; ID in `wrangler.jsonc`
- [ ] Two KV namespaces created; IDs in `wrangler.jsonc`
- [ ] R2 bucket created; name in `wrangler.jsonc`
- [ ] API token created; `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in dashboard (build)
- [ ] Pages project connected to GitHub; build command includes migrations
- [ ] All placeholders in `wrangler.jsonc` replaced; Secrets set in dashboard
- [ ] GitHub OAuth App callback URL set to `https://your-domain/auth/github`
- [ ] First deployment successful; app and sign-in tested
- [ ] (Optional) Custom domain and `BETTER_AUTH_URL` in `wrangler.jsonc` updated
