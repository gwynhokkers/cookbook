import { describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'

describe('GET /api/shopping-lists/today', async () => {
  await setup({
    server: true,
    browser: false,
    // NuxtHub first boot can be slow in CI / cold worktrees.
    setupTimeout: 120_000
  })

  it('returns 401 when signed out', async () => {
    const res = await fetch('/api/shopping-lists/today')
    expect(res.status).toBe(401)
  })
})
