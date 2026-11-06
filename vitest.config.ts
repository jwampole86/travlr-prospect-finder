import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Scoped to the AVA assistant for now; the rest of the app has no unit tests yet.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['src/lib/ava/**/*.test.{ts,mjs}', 'src/lib/seller/**/*.test.ts', 'src/lib/services/sourceCircuit.test.ts', 'src/lib/registry/**/*.test.ts', 'src/lib/media/**/*.test.ts', 'src/components/ava/**/*.test.{ts,tsx}'],
    environment: 'node'
  }
});
