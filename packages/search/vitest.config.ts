import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@search': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared/src'),
      '@vector': path.resolve(__dirname, '../vector/src'),
      '@embedding-core': path.resolve(__dirname, '../embedding-core/src'),
    },
  },
})
