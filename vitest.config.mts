import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '/icons': resolve(import.meta.dirname, 'src/assets'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,js,vue}'],
      exclude: ['src/__tests__/**', 'src/**/*.d.ts'],
      thresholds: {
        statements: 40,
        branches: 35,
        functions: 30,
        lines: 42,
      },
    },
  },
})
