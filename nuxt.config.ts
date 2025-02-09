// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  future: {
    compatibilityVersion: 4
  },

  compatibilityDate: '2024-07-30',

  modules: [
    '@nuxt/content',
    '@nuxt/eslint',
    // '@nuxt/ui',
    '@nuxt/ui-pro',
    '@nuxt/fonts',
    '@nuxthq/studio'
  ],

  //   hooks: {
  //     // Define `@nuxt/ui` components as global to use them in `.md` (feel free to add those you need)
  //     'components:extend': (components) => {
  //       const globals = components.filter(c => ['UButton', 'UIcon'].includes(c.pascalName))

  //       globals.forEach(c => c.global = true)
  //     }
  //   },

  css: ['~/assets/css/main.css'],

  // Temporary workaround for prerender regression. see https://github.com/nuxt/nuxt/issues/27490
  routeRules: {
    '/': { prerender: true },
    '/api/search.json': { prerender: true }
  },

  ui: {
    icons: ['heroicons', 'simple-icons']
  },

  colorMode: {
    disableTransition: true
  },

  devtools: {
    enabled: true
  },

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
  }

})
