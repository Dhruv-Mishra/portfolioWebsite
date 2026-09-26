import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';

const SITE_VERSION: string = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
).version;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    include: ['lib/__tests__/**/*.test.ts'],
    environment: 'node',
    env: {
      NEXT_PUBLIC_SITE_VERSION: SITE_VERSION,
    },
  },
});
