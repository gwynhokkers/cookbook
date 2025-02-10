// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint', // '@nuxt/ui',
    '@nuxt/fonts',
    'nuxt-og-image',
    '@nuxt/image',
    '@nuxt/ui-pro',
    '@nuxt/content'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  content: {
    preview: {
      api: 'https://api.nuxt.studio'
    }
  },
  //   colorMode: {
  //     disableTransition: true
  //   },

  //   ui: {
  //     icons: ['heroicons', 'simple-icons']
  //   },

  // Temporary workaround for prerender regression. see https://github.com/nuxt/nuxt/issues/27490
  routeRules: {
    '/': { prerender: true },
    '/api/search.json': { prerender: true }
  },
  future: {
    compatibilityVersion: 4
  },

  compatibilityDate: '2024-07-30',

  typescript: {
    strict: false
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  fonts: {
    experimental: {
      processCSSVariables: true
    }
  }

})
