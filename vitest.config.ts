import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['shared/**/*.ts', 'server/utils/**/*.ts'],
      exclude: ['**/*.d.ts', '**/node_modules/**']
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/shared/**/*.{test,spec}.ts', 'tests/server/**/*.{test,spec}.ts'],
          environment: 'node'
        }
      },
      // Reserved for Nuxt-runtime tests (composables, components) — unused in V1 bootstrap.
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['tests/nuxt/**/*.{test,spec}.ts'],
          environment: 'nuxt'
        }
      }),
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.{test,spec}.ts'],
          environment: 'node'
        }
      }
    ]
  }
})
