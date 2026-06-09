import { defineProvider } from '@nuxt/image/runtime'

/**
 * Custom Nuxt Image provider for NuxtHub blob storage.
 * Returns blob URLs as-is without IPX optimization so <NuxtImg> works with /api/images/ paths.
 */
export default defineProvider({
  getImage: (src) => ({ url: src })
})
