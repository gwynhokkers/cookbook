// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint', // '@nuxt/ui',
    '@nuxt/fonts',
    'nuxt-og-image',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/content',
    '@nuxthub/core',
    'nuxt-auth-utils',
    '@pinia/nuxt'
  ],

  hub: {
    db: 'postgresql',
    blob: true,
    kv: true,
    cache: true
  },

  image: {
    providers: {
      blob: {
        provider: '~/providers/blob',
        options: {}
      }
    }
  },

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
  
  runtimeConfig: {
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || 'change-me-in-production-min-32-chars-long'
    },
    oauth: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET
      }
    },
    spoonacular: {
      apiKey: process.env.SPOON_API_KEY
    },
    adminGithubIds: process.env.ADMIN_GITHUB_IDS || ''
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
  },

  // vite: {
  //   resolve: {
  //     alias: {
  //       'unenv/runtime/mock/empty': 'unenv/dist/runtime/mock/empty.mjs'
  //     }
  //   }
  // },

  nitro: {
    experimental: {
      wasm: true
    },
    // Ensure hub: imports are properly resolved
    esbuild: {
      options: {
        // Allow hub: protocol imports
        target: 'esnext'
      }
    }
  }

})
