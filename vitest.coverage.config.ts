import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/brain/**/*.ts', 'src/adapters/**/*.ts', 'src/ledger/**/*.ts'],
      exclude: ['src/brain/matchers/**'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'node_modules/.cache/mycelium-coverage',
    },
  },
})
