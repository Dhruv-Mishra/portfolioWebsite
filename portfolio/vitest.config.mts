import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const SITE_VERSION: string = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
).version;

export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir,
      'server-only': path.join(rootDir, 'node_modules/server-only/empty.js'),
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