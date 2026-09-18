# Site icon, favicon, and social card

**Date:** 2026-09-14
**Status:** Approved
**Scope:** Light and dark chef-squid icons as favicon and header mark; `@nuxtjs/seo` for site identity, robots, sitemap, and schema; a generated split-panel social card for the site and for recipes

## Problem

1. The tab icon points at `/favicon.ico`, which is not in `public`. The header logo slots are empty, so the wordmark has no mark.
2. Default Open Graph and Twitter images still point at the Nuxt UI docs-template card. `public/social-card.png` is that same placeholder.
3. Recipe pages already call `defineOgImage`, but the template is an unbranded slate block.
4. The app has no site URL, robots, or sitemap. Private recipes must not be advertised to crawlers.

## Goals

- Use `public/inky-chef.svg` (black) for light mode and `public/inky-chef-white.svg` (white) for dark mode, as both the favicon and the header mark beside the existing wordmark.
- Add `@nuxtjs/seo` the way inkythesquid does, and drop the standalone `nuxt-og-image` module so it is not registered twice.
- Generate one social-card frame for the site default and for recipe pages.
- Publish a runtime sitemap of public recipes only. Keep private recipe URLs out of `robots.txt`.

## Non-goals

- A PNG apple-touch icon or any other raster favicon.
- A static social-card PNG, including a fallback if OG generation fails.
- Indexing `/search`, `/humphry`, or `/shopping-list`.
- Changing recipe visibility rules. Guests already cannot load a private recipe.
- Adopting inkythesquid's intro loader, `nuxt-ai-ready`, or Person-as-site identity.

## Decisions

| Question | Choice |
|----------|--------|
| Social-card scope | Full `@nuxtjs/seo` (sitemap, robots, schema) and keep per-recipe cards |
| Canonical URL | `https://cookbook.megwyn.co.uk` |
| Schema identity | Organization `Humboldt Kitchen`, plus a Person author `Inky the Squid` |
| Implementation | Mirror inkythesquid: one SEO module, generated card, SVG icons |
| Card layout | Split panel. Icon in the left third, text in the right column |
| Header | Icon beside the wordmark, not instead of it |
| Placeholder PNG | Delete `public/social-card.png` |

## Icons and favicon

`app/app.config.ts` `header.logo`:

- `light`: `/inky-chef.svg`
- `dark`: `/inky-chef-white.svg`
- `alt`: `Humboldt Kitchen`

`AppHeader.vue` currently shows the logo **or** the wordmark. Change it so both show: the color-mode image, then the existing “Humboldt Kitchen” link.

Favicon, replacing the `/favicon.ico` link:

- `/inky-chef.svg` with `media="(prefers-color-scheme: light)"`
- `/inky-chef-white.svg` with `media="(prefers-color-scheme: dark)"`
- Type `image/svg+xml`

The in-app color toggle will not swap the tab icon. Browsers only follow `prefers-color-scheme` for favicons. That is accepted.

## SEO config

Add `@nuxtjs/seo` (inkythesquid uses `5.3.0`; pick a release compatible with this app’s Nuxt 4). Remove `nuxt-og-image` from `modules` and from `package.json`. In Vitest, skip `@nuxtjs/seo` the same way `nuxt-og-image` is skipped today.

SEO defaults live in `app/config/seo.ts`, imported by `nuxt.config.ts` the way inkythesquid does.

| Field | Value |
|-------|--------|
| URL | `https://cookbook.megwyn.co.uk` |
| Name | `Humboldt Kitchen` |
| Description | `A collection of recipes by Inky the Squid` |
| Locale | `en` (keep the existing `html` lang) |
| Author | Person `Inky the Squid`, URL `https://inkythesquid.co.uk` |

`app.config.ts` `seo.siteName` becomes `Humboldt Kitchen` so title suffixes are not the long marketing line.

Title template, in `app.vue`: append ` · Humboldt Kitchen` only when the page title is missing that name. Do not produce `Humboldt Kitchen - … - Humboldt Kitchen`.

### Schema

`schemaOrg.identity` is an Organization. `WebSite` is not a valid identity type.

- Organization: name `Humboldt Kitchen`, URL `https://cookbook.megwyn.co.uk`, logo `/inky-chef.svg`
- Person author: name `Inky the Squid`, URL `https://inkythesquid.co.uk`

No email, job title, or social profiles. Those belong to the portfolio site, not this cookbook.

### Robots and sitemap

`robots` disallow:

- `/admin`
- `/login`
- `/recipes/new`
- `/recipes/*/edit`
- `/shopping-list`
- `/search`
- `/humphry`
- `/api`

Do not list private recipe IDs in `robots.txt`. That would advertise them.

Sitemap is generated at request time. Do not use `zeroRuntime: true`. The production database is not available at build time.

`server/api/__sitemap__/urls.ts` returns `{ loc: '/recipes/:id', lastmod }` for recipes whose `visibility` is `public` only. `lastmod` is `updatedAt`. If the database query throws, return an empty URL list so the sitemap request does not 500.

Also exclude the disallowed paths from the sitemap, so a crawler does not learn those routes from the URL list either.

Public recipe pages may be indexed. When a recipe page renders a private recipe, set `robots` to `noindex`.

## Social card

One component, used everywhere `defineOgImage` is called today (`app.vue`, recipe view, new, and edit). `@nuxtjs/seo` 5.3.0 ships `nuxt-og-image` v6, which requires a renderer suffix, so the file is `app/components/OgImage/OgImageKitchen.takumi.vue` and pages call `defineOgImage('Kitchen.takumi', ...)`. Delete `OgImageRecipe.vue` once nothing references `component: "Recipe"`.

Frame (1200×630):

- Page background `#060a0f`
- Left column 34% wide, gradient `linear-gradient(160deg, #004645, #060a0f)`, white chef SVG centered
- Right column, Outfit: uppercase eyebrow in `#00ccca`, Italiana title in `#f0f4f6`, description in `#a8b8c4`, domain `cookbook.megwyn.co.uk` in `#5a6d7d`

Props: `eyebrow`, `title`, `description`. Domain is fixed.

| Surface | Eyebrow | Title | Description |
|---------|---------|-------|-------------|
| Site default (`app.vue`) | `Inky the Squid` | `Humboldt Kitchen` | `A collection of recipes by Inky the Squid` |
| Recipe pages | `Humboldt Kitchen` | Recipe title | Recipe description |

`defineOgImage` in `app.vue` is the default. Recipe pages override it. Remove the docs-template `ogImage` and `twitterImage` URLs. Keep `twitterCard: summary_large_image`. Do not set a static image URL that would override the generated card.

If OG generation fails, there is no PNG fallback.

## Testing

- A unit test for the sitemap mapper: public recipes become `/recipes/:id` entries; private recipes are omitted; a thrown database error becomes an empty list. Keep the query at the edge of the handler so the filter can be tested without a database.
- No snapshot test of the OG component.
- Manual check: light and dark favicon, header mark beside the wordmark, a public recipe card, `/sitemap.xml` containing a public recipe and not a private one, and view-source no longer referencing `docs-template.nuxt.dev`.

## Small cleanup

Add `.superpowers/` to `.gitignore` so brainstorm mockups are not committed.
