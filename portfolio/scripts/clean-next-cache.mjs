import { rm } from 'node:fs/promises';
import path from 'node:path';

const nextCache = path.join(process.cwd(), '.next');

await rm(nextCache, { recursive: true, force: true });
console.log('[clean-next-cache] Removed .next cache.');
