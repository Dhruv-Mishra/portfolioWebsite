#!/usr/bin/env node
/**
 * Compute per-route First Load JS from .next build output.
 *
 * Turbopack in Next.js 16 no longer prints the classic route-sizes table, so we
 * reconstruct it from:
 *   - .next/build-manifest.json             (rootMainFiles + polyfillFiles for the shared baseline)
 *   - .next/server/app/<route>_client-reference-manifest.js  (per-route entryJSFiles)
 *
 * Output is a stable, sortable table: route | chunks | First Load JS (bytes).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] ?? '.');
const NEXT_DIR = path.join(ROOT, '.next');

function fileSize(p) {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}

function collectChunkBytes(relPaths) {
  let total = 0;
  for (const rel of relPaths) {
    total += fileSize(path.join(NEXT_DIR, rel));
  }
  return total;
}

const buildManifest = JSON.parse(
  readFileSync(path.join(NEXT_DIR, 'build-manifest.json'), 'utf8'),
);

// `rootMainFiles` always include turbopack-<hash>.js which is not listed in the
// static/chunks dir but in build-manifest with a "static/chunks/" prefix — some
// Turbopack builds put it directly in .next/static. Accept both.
const rootMainFiles = buildManifest.rootMainFiles ?? [];
const polyfillFiles = buildManifest.polyfillFiles ?? [];
const sharedBaselineFiles = [...rootMainFiles, ...polyfillFiles];
const sharedBaseline = collectChunkBytes(sharedBaselineFiles);

// Walk .next/server/app to find every <route>_client-reference-manifest.js
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const APP_DIR = path.join(NEXT_DIR, 'server', 'app');
const routeMap = new Map(); // routeName -> { chunkFiles: Set<string>, cssFiles: Set<string> }

if (existsSync(APP_DIR)) {
  for (const file of walk(APP_DIR)) {
    if (!file.endsWith('_client-reference-manifest.js')) continue;
    const src = readFileSync(file, 'utf8');
    // Extract the route name from the first `globalThis.__RSC_MANIFEST["/..."] = `
    const routeMatch = src.match(/globalThis\.__RSC_MANIFEST\["([^"]+)"\]/);
    if (!routeMatch) continue;
    const routeName = routeMatch[1]; // e.g. "/page", "/projects/page"

    // Extract the JSON literal passed to the assignment and parse just the entryJSFiles map.
    // Cheap-but-good: slice from the first `{` and do a bracket count.
    const jsonStart = src.indexOf('{', routeMatch.index ?? 0);
    let depth = 0;
    let inString = false;
    let escape = false;
    let jsonEnd = -1;
    for (let i = jsonStart; i < src.length; i++) {
      const c = src[i];
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (c === '\\') {
          escape = true;
          continue;
        }
        if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
    if (jsonEnd === -1) continue;
    const manifest = JSON.parse(src.slice(jsonStart, jsonEnd));
    const entryJSFiles = manifest.entryJSFiles ?? {};
    const entryCSSFiles = manifest.entryCSSFiles ?? {};

    const chunks = new Set();
    const cssChunks = new Set();
    for (const [entry, files] of Object.entries(entryJSFiles)) {
      // All page entries contribute — we take the union of all entries for the route
      // (layout, template, page, error, loading, not-found). Next.js hydration loads
      // all ancestors in parallel.
      if (!entry.includes('/app/')) continue;
      for (const f of files) chunks.add(f);
    }
    for (const [entry, files] of Object.entries(entryCSSFiles)) {
      if (!entry.includes('/app/')) continue;
      for (const f of files) cssChunks.add(f?.path ?? f);
    }
    routeMap.set(routeName, { chunks, cssChunks });
  }
}

const sortedRoutes = [...routeMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

console.log('Shared baseline (rootMainFiles + polyfillFiles):');
for (const f of sharedBaselineFiles) {
  console.log(`  ${f.padEnd(60)} ${fileSize(path.join(NEXT_DIR, f)).toLocaleString().padStart(10)} B`);
}
console.log(`  TOTAL:`.padEnd(62) + sharedBaseline.toLocaleString().padStart(10) + ' B');
console.log('');

console.log('Per-route First Load JS (JS only, plus CSS noted):');
const rows = [];
for (const [route, { chunks, cssChunks }] of sortedRoutes) {
  const jsBytes = collectChunkBytes([...chunks]);
  const cssBytes = collectChunkBytes([...cssChunks]);
  const uniqueJsBytes = collectChunkBytes(
    [...chunks].filter((c) => !sharedBaselineFiles.includes(c)),
  );
  rows.push({ route, chunkCount: chunks.size, jsBytes, cssBytes, uniqueJsBytes });
}
rows.sort((a, b) => b.jsBytes - a.jsBytes);
const w = (s, n) => String(s).padEnd(n);
const wr = (s, n) => String(s).padStart(n);
console.log(
  `${w('Route', 24)}${wr('Chunks', 8)}${wr('Unique JS', 14)}${wr('Total JS', 14)}${wr('Total CSS', 14)}`,
);
console.log('-'.repeat(74));
for (const r of rows) {
  console.log(
    `${w(r.route, 24)}${wr(r.chunkCount, 8)}${wr(r.uniqueJsBytes.toLocaleString(), 14)}${wr(r.jsBytes.toLocaleString(), 14)}${wr(r.cssBytes.toLocaleString(), 14)}`,
  );
}
console.log('');

// Top 20 largest individual client chunks
const staticDir = path.join(NEXT_DIR, 'static', 'chunks');
const chunkSizes = [];
if (existsSync(staticDir)) {
  for (const f of readdirSync(staticDir)) {
    if (!f.endsWith('.js')) continue;
    chunkSizes.push({ name: f, size: fileSize(path.join(staticDir, f)) });
  }
}
chunkSizes.sort((a, b) => b.size - a.size);
console.log('Top 20 static/chunks by size:');
console.log(`${w('Chunk', 32)}${wr('Bytes', 12)}`);
console.log('-'.repeat(44));
for (const c of chunkSizes.slice(0, 20)) {
  console.log(`${w(c.name, 32)}${wr(c.size.toLocaleString(), 12)}`);
}

const totalStatic = chunkSizes.reduce((s, c) => s + c.size, 0);
console.log('');
console.log(`Total .next/static/chunks/*.js: ${totalStatic.toLocaleString()} B`);
