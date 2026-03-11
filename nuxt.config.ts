// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint', // '@nuxt/ui',
    '@nuxt/fonts',
    'nuxt-og-image',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxthub/core',
    'nuxt-auth-utils',
    'nuxt-authorization',
    '@pinia/nuxt'
  ],

  hub: {
    db: 'sqlite',
    kv: true,
    cache: true,
    blob: true
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

  // Prerender disabled for D1: DB binding is not available at build time, so routes that
  // call the API (/, /api/search.json) would fail. They are server-rendered on demand in production.
  routeRules: {
    '/': { prerender: false },
    '/api/search.json': { prerender: false }
  },
  
  runtimeConfig: {
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || 'change-me-in-production-min-32-chars-long'
    },
    oauth: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET
      },
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET
      }
    },
    spoonacular: {
      apiKey: process.env.SPOON_API_KEY
    },
    adminGithubIds: process.env.ADMIN_GITHUB_IDS || '',
    adminGoogleIds: process.env.ADMIN_GOOGLE_IDS || ''
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
