import type { ProviderGetImage } from '@nuxt/image'
import { getImage as getImageWithNone } from '#image/providers/none'

/**
 * Custom Nuxt Image provider for NuxtHub blob storage
 * Uses 'none' provider to return blob URLs as-is without optimization
 * This allows <NuxtImg> to work with blob storage images
 */
export const getImage: ProviderGetImage = (src, options, ctx) => {
  // For blob storage URLs (starting with /api/images/), use none provider
  // This returns the URL as-is without IPX optimization
  if (src.startsWith('/api/images/')) {
    return getImageWithNone(src, options, ctx)
  }
  
  // For other URLs, fall back to none provider as well
  return getImageWithNone(src, options, ctx)
}
