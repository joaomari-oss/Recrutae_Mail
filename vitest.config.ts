import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: { alias: { '@': rootDir } },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    clearMocks: true,
    // A fila de geração da revisão faz várias rodadas assíncronas; sob a carga
    // da suíte inteira o padrão de 5 s estourava e deixava o teste instável.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
