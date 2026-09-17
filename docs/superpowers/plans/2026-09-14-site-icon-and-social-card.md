# Site Icon and Social Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the chef-squid SVGs as the light/dark favicon and header mark, and publish a Humboldt Kitchen social card plus a public-only sitemap through `@nuxtjs/seo`.

**Architecture:** SEO defaults live in `app/config/seo.ts` and feed `site`, `schemaOrg`, and page meta. `@nuxtjs/seo` replaces the standalone `nuxt-og-image` module. Public recipe URLs are mapped by a pure function so the sitemap filter can be tested without a database. One Takumi OG component draws the split-panel card for the site default and for recipe pages.

**Tech Stack:** Nuxt 4, `@nuxtjs/seo` 5.3.0 (same pin as inkythesquid), `nuxt-og-image` v6 via that module, Takumi (`@takumi-rs/core` for local Node, `@takumi-rs/wasm` for Cloudflare), Drizzle, Vitest.

## Global Constraints

- Canonical URL is `https://cookbook.megwyn.co.uk`.
- Site name is `Humboldt Kitchen`. Description is `A collection of recipes by Inky the Squid`. Locale stays `en`.
- Schema identity is an Organization named `Humboldt Kitchen`. Author is a Person named `Inky the Squid` with URL `https://inkythesquid.co.uk`. No email, job title, or social profiles.
- Light icon is `/inky-chef.svg`. Dark icon is `/inky-chef-white.svg`. No PNG apple-touch icon.
- Favicon uses `prefers-color-scheme` only. The in-app color toggle will not swap the tab icon.
- Header shows the icon beside the “Humboldt Kitchen” wordmark, not instead of it.
- Card layout is a 1200×630 split panel: left column 34% wide, white chef SVG, right column text. Domain on the card is `cookbook.megwyn.co.uk`.
- Site card eyebrow is `Inky the Squid`. Recipe card eyebrow is `Humboldt Kitchen`.
- `@nuxtjs/seo` is pinned to `5.3.0`. Do not register `nuxt-og-image` as its own module. The v6 renderer requires the component file `app/components/OgImage/OgImageKitchen.takumi.vue` and `defineOgImage('Kitchen.takumi', ...)`. That suffix is the module’s required form of the spec’s `OgImageKitchen` component.
- Install both `@takumi-rs/core` and `@takumi-rs/wasm`. This app runs on Node locally and Cloudflare in production. The module picks the binding.
- Do not set `sitemap.zeroRuntime`. The production database is not available at build time.
- Do not list private recipe IDs in `robots.txt`.
- Robots disallow: `/admin`, `/login`, `/recipes/new`, `/recipes/*/edit`, `/shopping-list`, `/search`, `/humphry`, `/api`.
- If the sitemap database query throws, return an empty URL list. Do not 500.
- If OG generation fails, do not add a PNG fallback.
- Delete `public/social-card.png`. It is the Nuxt UI docs-template image.
- Do not index `/search`, `/humphry`, or `/shopping-list`.
- Do not change recipe visibility rules.
- Skip `@nuxtjs/seo` in Vitest the same way `nuxt-og-image` is skipped today.

---

### Task 1: Public recipe sitemap mapper

**Files:**
- Create: `server/utils/recipeSitemap.ts`
- Test: `tests/server/utils/recipeSitemap.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `SitemapRecipe`: `{ id: string, visibility: string, updatedAt: Date | string | number | null }`
  - `SitemapUrl`: `{ loc: string, lastmod?: string }`
  - `publicRecipeSitemapUrls(recipes: SitemapRecipe[]): SitemapUrl[]`
  - `loadPublicRecipeSitemapUrls(load: () => Promise<SitemapRecipe[]>): Promise<SitemapUrl[]>`

- [ ] **Step 1: Write the failing test**

Create `tests/server/utils/recipeSitemap.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  loadPublicRecipeSitemapUrls,
  publicRecipeSitemapUrls
} from '~~/server/utils/recipeSitemap'

describe('publicRecipeSitemapUrls', () => {
  it('keeps public recipes and drops private ones', () => {
    const urls = publicRecipeSitemapUrls([
      { id: 'mapo-tofu', visibility: 'public', updatedAt: new Date('2026-01-02T03:04:05.000Z') },
      { id: 'secret-cake', visibility: 'private', updatedAt: new Date('2026-02-03T04:05:06.000Z') }
    ])

    expect(urls).toEqual([
      { loc: '/recipes/mapo-tofu', lastmod: '2026-01-02T03:04:05.000Z' }
    ])
  })

  it('omits lastmod when updatedAt is missing', () => {
    expect(publicRecipeSitemapUrls([
      { id: 'no-date', visibility: 'public', updatedAt: null }
    ])).toEqual([{ loc: '/recipes/no-date' }])
  })
})

describe('loadPublicRecipeSitemapUrls', () => {
  it('returns an empty list when the query throws', async () => {
    await expect(loadPublicRecipeSitemapUrls(async () => {
      throw new Error('db down')
    })).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test tests/server/utils/recipeSitemap.test.ts`

Expected: FAIL because `~~/server/utils/recipeSitemap` cannot be resolved.

- [ ] **Step 3: Write the mapper**

Create `server/utils/recipeSitemap.ts`:

```ts
export type SitemapRecipe = {
  id: string
  visibility: string
  updatedAt: Date | string | number | null
}

export type SitemapUrl = {
  loc: string
  lastmod?: string
}

export function publicRecipeSitemapUrls(recipes: SitemapRecipe[]): SitemapUrl[] {
  return recipes
    .filter(recipe => recipe.visibility === 'public')
    .map((recipe) => {
      const lastmod = toLastmod(recipe.updatedAt)
      return lastmod
        ? { loc: `/recipes/${recipe.id}`, lastmod }
        : { loc: `/recipes/${recipe.id}` }
    })
}

export async function loadPublicRecipeSitemapUrls(
  load: () => Promise<SitemapRecipe[]>
): Promise<SitemapUrl[]> {
  try {
    return publicRecipeSitemapUrls(await load())
  } catch {
    return []
  }
}

function toLastmod(value: SitemapRecipe['updatedAt']): string | undefined {
  if (value == null || value === '') return undefined
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test tests/server/utils/recipeSitemap.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/utils/recipeSitemap.ts tests/server/utils/recipeSitemap.test.ts
git commit -m "$(cat <<'EOF'
feat: map public recipes into sitemap urls

EOF
)"
```

---

### Task 2: Install `@nuxtjs/seo` and publish the runtime sitemap

**Files:**
- Create: `app/config/seo.ts`
- Create: `server/api/__sitemap__/urls.ts`
- Modify: `package.json`
- Modify: `nuxt.config.ts` (modules list near lines 6–16, `routeRules` near lines 47–50)
- Modify: `app/app.config.ts` (import at top, `seo.siteName` at line 26)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `loadPublicRecipeSitemapUrls` and `SitemapRecipe` from `server/utils/recipeSitemap.ts`
- Produces:
  - `siteUrl` = `'https://cookbook.megwyn.co.uk'`
  - `seoDefaults.siteName` = `'Humboldt Kitchen'`
  - `seoDefaults.description` = `'A collection of recipes by Inky the Squid'`
  - `seoDefaults.locale` = `'en'`
  - `seoDefaults.authorName` = `'Inky the Squid'`
  - `seoDefaults.authorUrl` = `'https://inkythesquid.co.uk'`
  - `app.config` `seo.siteName` equals `seoDefaults.siteName`

- [ ] **Step 1: Swap the SEO module**

Run:

```bash
bun remove nuxt-og-image
bun add @nuxtjs/seo@5.3.0 @takumi-rs/core @takumi-rs/wasm
```

Expected: `package.json` no longer lists `nuxt-og-image`. It lists `@nuxtjs/seo` at `5.3.0` and both Takumi packages.

- [ ] **Step 2: Add SEO defaults**

Create `app/config/seo.ts`:

```ts
export const siteUrl = 'https://cookbook.megwyn.co.uk'

export const seoDefaults = {
  siteName: 'Humboldt Kitchen',
  description: 'A collection of recipes by Inky the Squid',
  locale: 'en',
  authorName: 'Inky the Squid',
  authorUrl: 'https://inkythesquid.co.uk'
} as const
```

- [ ] **Step 3: Point app config at the site name**

At the top of `app/app.config.ts`, add:

```ts
import { seoDefaults } from './config/seo'
```

Replace the `seo` block:

```ts
  seo: {
    siteName: seoDefaults.siteName,
  },
```

- [ ] **Step 4: Register the module, identity, robots, and sitemap**

In `nuxt.config.ts`, add the import next to the existing session import:

```ts
import { seoDefaults, siteUrl } from './app/config/seo'
```

Replace the vitest module line:

```ts
    ...(isVitest ? [] : ['@nuxt/fonts', '@nuxtjs/seo']),
```

Do not add `nuxt-og-image` back. Do not set `sitemap.zeroRuntime`.

Add these blocks to `defineNuxtConfig` (alongside the existing `routeRules`; leave the prerender rules in place):

```ts
  site: {
    url: siteUrl,
    name: seoDefaults.siteName,
    description: seoDefaults.description,
    defaultLocale: seoDefaults.locale
  },

  schemaOrg: {
    identity: {
      type: 'Organization',
      name: seoDefaults.siteName,
      url: siteUrl,
      logo: '/inky-chef.svg'
    }
  },

  robots: {
    disallow: [
      '/admin',
      '/login',
      '/recipes/new',
      '/recipes/*/edit',
      '/shopping-list',
      '/search',
      '/humphry',
      '/api'
    ]
  },

  sitemap: {
    exclude: [
      '/admin/**',
      '/login',
      '/recipes/new',
      '/recipes/**/edit',
      '/shopping-list',
      '/search',
      '/humphry',
      '/api/**'
    ],
    sources: ['/api/__sitemap__/urls']
  },
```

In `app.vue` is not part of this task. The Person author node is added in Task 4 with the rest of the page head, so schema and the card share one edit. This task only sets the Organization identity.

- [ ] **Step 5: Add the sitemap source**

Create `server/api/__sitemap__/urls.ts`:

```ts
import { defineSitemapEventHandler } from '#imports'
import { db, schema } from '../../db'
import { loadPublicRecipeSitemapUrls } from '../../utils/recipeSitemap'

export default defineSitemapEventHandler(async () => {
  return loadPublicRecipeSitemapUrls(() => {
    return db
      .select({
        id: schema.recipes.id,
        visibility: schema.recipes.visibility,
        updatedAt: schema.recipes.updatedAt
      })
      .from(schema.recipes)
  })
})
```

The query stays in the handler. The try/catch stays in `loadPublicRecipeSitemapUrls`.

- [ ] **Step 6: Ignore brainstorm mockups**

Append to `.gitignore`:

```
# Brainstorm visual companion mockups
.superpowers/
```

- [ ] **Step 7: Confirm the mapper tests still pass**

Run: `bun run test tests/server/utils/recipeSitemap.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add package.json bun.lock app/config/seo.ts app/app.config.ts nuxt.config.ts server/api/__sitemap__/urls.ts .gitignore
git commit -m "$(cat <<'EOF'
feat: add seo module and public recipe sitemap

EOF
)"
```

Do not commit `.superpowers/`.

---

### Task 3: Favicon and header mark

**Files:**
- Modify: `app/app.vue` (head links)
- Modify: `app/app.config.ts` (`header.logo` around lines 149–153)
- Modify: `app/components/AppHeader.vue` (`#title` slot, lines 55–64)

**Interfaces:**
- Consumes: `seoDefaults.siteName` from `app/config/seo.ts` (`Humboldt Kitchen`)
- Produces: header logo `light` `/inky-chef.svg`, `dark` `/inky-chef-white.svg`, `alt` `Humboldt Kitchen`

- [ ] **Step 1: Fill the header logo slots**

In `app/app.config.ts`, replace the empty logo object:

```ts
    logo: {
      alt: seoDefaults.siteName,
      light: '/inky-chef.svg',
      dark: '/inky-chef-white.svg'
    },
```

`seoDefaults` is already imported from Task 2.

- [ ] **Step 2: Show the mark beside the wordmark**

Replace the `#title` slot in `app/components/AppHeader.vue`:

```vue
    <template #title>
      <NuxtLink to="/" class="flex items-center gap-2 font-serif text-base sm:text-lg">
        <UColorModeImage
          v-if="header?.logo?.dark || header?.logo?.light"
          v-bind="{ class: 'h-8 w-8', ...header.logo }"
        />
        <span>Humboldt <span class="text-biolume-600">Kitchen</span></span>
      </NuxtLink>
    </template>
```

Do not wrap this in `v-else`. The wordmark must stay when the logo is set.

- [ ] **Step 3: Swap the favicon links**

In `app/app.vue`, replace the `useHead` link array. Leave the viewport meta and `lang: 'en'` as they are. Do not add an apple-touch icon. Do not point at `/favicon.ico`.

```ts
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/inky-chef.svg', media: '(prefers-color-scheme: light)' },
    { rel: 'icon', type: 'image/svg+xml', href: '/inky-chef-white.svg', media: '(prefers-color-scheme: dark)' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})
```

- [ ] **Step 4: Commit**

```bash
git add app/app.config.ts app/components/AppHeader.vue app/app.vue
git commit -m "$(cat <<'EOF'
feat: use chef squid as favicon and header mark

EOF
)"
```

---

### Task 4: Split-panel social card

**Files:**
- Create: `app/components/OgImage/OgImageKitchen.takumi.vue`
- Delete: `app/components/OgImage/OgImageRecipe.vue`
- Delete: `public/social-card.png`
- Modify: `app/app.vue`
- Modify: `app/pages/recipes/[id]/index.vue` (seo + og block around lines 348–359)
- Modify: `app/pages/recipes/new.vue` (og block around lines 68–79)
- Modify: `app/pages/recipes/[id]/edit.vue` (og block around lines 84–95)
- Modify: `nuxt.config.ts` (`fonts` block around lines 112–116)

**Interfaces:**
- Consumes: `seoDefaults` and `siteUrl` from `app/config/seo.ts`. `seo.siteName` is `Humboldt Kitchen`.
- Produces: `defineOgImage('Kitchen.takumi', { eyebrow, title, description })`. Domain is hardcoded in the component as `cookbook.megwyn.co.uk`.

- [ ] **Step 1: Load the card fonts**

In `nuxt.config.ts`, replace the `fonts` block so Outfit and Italiana are fetched for the site and the OG renderer:

```ts
  fonts: {
    experimental: {
      processCSSVariables: true
    },
    families: [
      { name: 'Outfit', provider: 'google', weights: [400, 500], global: true },
      { name: 'Italiana', provider: 'google', weights: [400], global: true }
    ]
  },
```

- [ ] **Step 2: Add the Kitchen card**

Create `app/components/OgImage/OgImageKitchen.takumi.vue`. Do not create `OgImageKitchen.vue`. Do not add a static image fallback.

```vue
<script setup lang="ts">
defineProps({
  eyebrow: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: false, default: '' }
})
</script>

<template>
  <div
    class="flex h-full w-full overflow-hidden bg-[#060a0f] text-[#e8eef0]"
    style="font-family: Outfit, ui-sans-serif, system-ui, sans-serif;"
  >
    <div
      class="flex w-[34%] items-center justify-center"
      style="background: linear-gradient(160deg, #004645, #060a0f);"
    >
      <img src="/inky-chef-white.svg" alt="" width="280" height="280">
    </div>
    <div class="flex flex-1 flex-col justify-between p-14">
      <p class="m-0 text-sm uppercase tracking-[0.28em] text-[#00ccca]">
        {{ eyebrow }}
      </p>
      <div>
        <h1
          class="m-0 text-[64px] font-normal leading-[1.05] text-[#f0f4f6]"
          style="font-family: Italiana, Outfit, ui-sans-serif, serif;"
        >
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="m-0 mt-6 max-w-[680px] text-[28px] leading-snug text-[#a8b8c4]"
        >
          {{ description }}
        </p>
      </div>
      <p class="m-0 text-lg text-[#5a6d7d]">
        cookbook.megwyn.co.uk
      </p>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Set the site default card, title template, and author**

Replace the script in `app/app.vue` with:

```vue
<script setup lang="ts">
import { seoDefaults } from '~/config/seo'

const { seo } = useAppConfig()
const siteName = seo?.siteName || seoDefaults.siteName

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/inky-chef.svg', media: '(prefers-color-scheme: light)' },
    { rel: 'icon', type: 'image/svg+xml', href: '/inky-chef-white.svg', media: '(prefers-color-scheme: dark)' }
  ],
  htmlAttrs: {
    lang: 'en'
  },
  titleTemplate: (title) => {
    if (!title || title === siteName || title.includes(siteName)) {
      return title || siteName
    }
    return `${title} · ${siteName}`
  }
})

useSeoMeta({
  ogSiteName: siteName,
  twitterCard: 'summary_large_image'
})

useSchemaOrg([
  defineWebSite({
    name: seoDefaults.siteName,
    description: seoDefaults.description,
    author: definePerson({
      name: seoDefaults.authorName,
      url: seoDefaults.authorUrl
    })
  })
])

defineOgImage('Kitchen.takumi', {
  eyebrow: seoDefaults.authorName,
  title: seoDefaults.siteName,
  description: seoDefaults.description
})
</script>
```

Remove the docs-template `ogImage` and `twitterImage` URLs. Do not set another static image URL. Keep the existing template markup.

- [ ] **Step 4: Point recipe pages at the Kitchen card**

In `app/pages/recipes/[id]/index.vue`, replace the `useSeoMeta` / `defineOgImage` block:

```ts
useSeoMeta({
  title: recipe.value?.title,
  ogTitle: `${recipe.value?.title} | ${seo?.siteName}`,
  description: recipe.value?.description,
  ogDescription: recipe.value?.description,
  robots: computed(() => (recipe.value?.visibility === 'private' ? 'noindex, nofollow' : undefined))
})

defineOgImage('Kitchen.takumi', {
  eyebrow: seo?.siteName,
  title: recipe.value?.title,
  description: recipe.value?.description
})
```

In `app/pages/recipes/new.vue`, replace the `defineOgImage` call only (leave the existing `useSeoMeta` title text):

```ts
defineOgImage('Kitchen.takumi', {
  eyebrow: 'Humboldt Kitchen',
  title: 'Create New Recipe',
  description: 'Create a new recipe'
})
```

In `app/pages/recipes/[id]/edit.vue`, replace the `defineOgImage` call only:

```ts
defineOgImage('Kitchen.takumi', {
  eyebrow: seo?.siteName,
  title: `Edit ${recipe.value?.title}`,
  description: `Edit ${recipe.value?.title} recipe`
})
```

- [ ] **Step 5: Remove the old card and the placeholder PNG**

Delete `app/components/OgImage/OgImageRecipe.vue`.

Delete `public/social-card.png`.

Confirm nothing still references `component: "Recipe"` or `docs-template.nuxt.dev`:

```bash
rg -n "component: ['\"]Recipe['\"]|docs-template.nuxt.dev|OgImageRecipe" app
```

Expected: no matches.

- [ ] **Step 6: Run the sitemap tests**

Run: `bun run test tests/server/utils/recipeSitemap.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 7: Refresh the knowledge graph**

Run: `graphify update .`

Expected: the command finishes without rewriting the SEO files.

- [ ] **Step 8: Commit**

```bash
git add app/components/OgImage/OgImageKitchen.takumi.vue app/components/OgImage/OgImageRecipe.vue app/app.vue app/pages/recipes/new.vue app/pages/recipes/\[id\]/index.vue app/pages/recipes/\[id\]/edit.vue nuxt.config.ts public/social-card.png
git commit -m "$(cat <<'EOF'
feat: generate Humboldt Kitchen social cards

EOF
)"
```

---

## Manual check

After the four tasks:

1. Light OS theme shows the black chef in the tab and header. Dark OS theme shows the white chef. The wordmark stays beside the icon.
2. View source on `/` has no `docs-template.nuxt.dev` URL. `og:image` points at a generated `/_og/` or `__og-image__` URL, not a static PNG.
3. `/sitemap.xml` includes a public recipe path and does not include a private recipe id, `/search`, `/humphry`, or `/shopping-list`.
4. A private recipe page response includes `noindex`.
