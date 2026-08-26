# Testing strategy: utils-first with `@nuxt/test-utils`

We are introducing automated tests with `@nuxt/test-utils` (Vitest) to protect domain/utils and API/auth contracts while developing features. Tests live under a mirrored `tests/` tree. We unit-test pure helpers (abilities, amalgamation, unit conversion, etc.) heavily and add only a few route-level smokes later; coverage is reported but not a CI gate. V1 excludes component/page mounts, Playwright, and Humphry/AI integration tests.

**Considered options**: full Nuxt route/e2e harness for auth from day one; Playwright happy-paths in the same programme; colocated `*.test.ts` next to source. Rejected for cost, noise against current goals, and keeping production dirs clean.
