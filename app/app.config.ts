export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'stone'
    },
    footer: {
      bottom: {
        left: 'text-sm text-gray-500 dark:text-gray-400',
        wrapper: 'border-t border-gray-200 dark:border-gray-800'
      }
    }
  },
  //   uiPro: {
  //     pageHeader: {
  //       slots: {
  //         headline: 'mb-2.5 text-sm font-normal text-(--ui-primary) flex items-center gap-1.5'
  //       }
  //     }
  //   },
  seo: {
    siteName: 'CookBook - A Megwyn site'
  },
  header: {
    navigation: [
      [
        {
          label: 'Links',
          type: 'label'
        },
        {
          label: 'Guide',
          icon: 'i-lucide-book-open',
          children: [
            {
              label: 'Introduction',
              description: 'Fully styled and customizable components for Nuxt.',
              icon: 'i-lucide-house'
            },
            {
              label: 'Installation',
              description: 'Learn how to install and configure Nuxt UI in your application.',
              icon: 'i-lucide-cloud-download'
            },
            {
              label: 'Icons',
              icon: 'i-lucide-smile',
              description: 'You have nothing to do, @nuxt/icon will handle it automatically.'
            },
            {
              label: 'Colors',
              icon: 'i-lucide-swatch-book',
              description: 'Choose a primary and a neutral color from your Tailwind CSS theme.'
            },
            {
              label: 'Theme',
              icon: 'i-lucide-cog',
              description: 'You can customize components by using the `class` / `ui` props or in your app.config.ts.'
            }
          ]
        },
        {
          label: 'Composables',
          icon: 'i-lucide-database',
          children: [
            {
              label: 'defineShortcuts',
              icon: 'i-lucide-file-text',
              description: 'Define shortcuts for your application.',
              to: '/composables/define-shortcuts'
            },
            {
              label: 'useModal',
              icon: 'i-lucide-file-text',
              description: 'Display a modal within your application.',
              to: '/composables/use-modal'
            },
            {
              label: 'useSlideover',
              icon: 'i-lucide-file-text',
              description: 'Display a slideover within your application.',
              to: '/composables/use-slideover'
            },
            {
              label: 'useToast',
              icon: 'i-lucide-file-text',
              description: 'Display a toast within your application.',
              to: '/composables/use-toast'
            }
          ]
        },
        {
          label: 'Components',
          icon: 'i-lucide-box',
          to: '/components',
          active: true,
          defaultOpen: true,
          children: [
            {
              label: 'Link',
              icon: 'i-lucide-file-text',
              description: 'Use NuxtLink with superpowers.',
              to: '/components/link'
            },
            {
              label: 'Modal',
              icon: 'i-lucide-file-text',
              description: 'Display a modal within your application.',
              to: '/components/modal'
            },
            {
              label: 'NavigationMenu',
              icon: 'i-lucide-file-text',
              description: 'Display a list of links.',
              to: '/components/navigation-menu'
            },
            {
              label: 'Pagination',
              icon: 'i-lucide-file-text',
              description: 'Display a list of pages.',
              to: '/components/pagination'
            },
            {
              label: 'Popover',
              icon: 'i-lucide-file-text',
              description: 'Display a non-modal dialog that floats around a trigger element.',
              to: '/components/popover'
            },
            {
              label: 'Progress',
              icon: 'i-lucide-file-text',
              description: 'Show a horizontal bar to indicate task progression.',
              to: '/components/progress'
            }
          ]
        }
      ]
    //   [
    //     {
    //       label: 'GitHub',
    //       icon: 'i-simple-icons-github',
    //       badge: '3.8k',
    //       to: 'https://github.com/nuxt/ui',
    //       target: '_blank'
    //     },
    //     {
    //       label: 'Help',
    //       icon: 'i-lucide-circle-help',
    //       disabled: true
    //     }
    //   ]
    ],
    logo: {
      alt: '',
      light: '',
      dark: ''
    },
    search: true,
    colorMode: true,
    links: [{
      'icon': 'i-simple-icons-github',
      'to': 'https://github.com/gwynhokkers/cookbook',
      'target': '_blank',
      'aria-label': 'Cookbook on GitHub'
    }]
  },
  footer: {
    credits: 'Copyright © 2023',
    colorMode: false,
    links: [
      {
        'icon': 'i-lucide-globe',
        'to': 'https://inkythesquid.co.uk',
        'target': '_blank',
        'aria-label': 'Inky the squid'
      },
      {
        'icon': 'i-simple-icons-nuxtdotjs',
        'to': 'https://nuxt.com',
        'target': '_blank',
        'aria-label': 'Nuxt Website'
      },
      // {
      //   'icon': 'i-simple-icons-discord',
      //   'to': 'https://discord.com/invite/ps2h6QT',
      //   'target': '_blank',
      //   'aria-label': 'Nuxt UI on Discord'
      // },
      // {
      //   'icon': 'i-simple-icons-x',
      //   'to': 'https://x.com/nuxt_js',
      //   'target': '_blank',
      //   'aria-label': 'Nuxt on X'
      // },
      {
        'icon': 'i-simple-icons-github',
        'to': 'https://github.com/gwynhokkers/cookbook',
        'target': '_blank',
        'aria-label': 'Cookbook on GitHub'
      }]
  },
  toc: {
    title: 'Table of Contents',
    bottom: {
      title: 'Community',
      edit: 'https://github.com/nuxt-ui-pro/docs/edit/main/content',
      links: [{
        icon: 'i-heroicons-star',
        label: 'Star on GitHub',
        to: 'https://github.com/nuxt/ui',
        target: '_blank'
      }, {
        icon: 'i-heroicons-book-open',
        label: 'Nuxt UI Pro docs',
        to: 'https://ui.nuxt.com/pro/guide',
        target: '_blank'
      }, {
        icon: 'i-simple-icons-nuxtdotjs',
        label: 'Purchase a license',
        to: 'https://ui.nuxt.com/pro/purchase',
        target: '_blank'
      }]
    }
  }
})
