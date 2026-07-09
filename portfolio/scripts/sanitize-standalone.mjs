import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const standaloneDir = path.resolve('.next', 'standalone');
const removablePaths = [
  path.join(standaloneDir, '.cache'),
  path.join(standaloneDir, 'node_modules', '@img'),
  path.join(standaloneDir, 'node_modules', 'onnxruntime-node'),
  path.join(standaloneDir, 'node_modules', 'sharp'),
];
const nativeExtensions = new Set(['.dll', '.dylib', '.node', '.so']);

async function collectNativeFiles(directory) {
  const nativeFiles = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      nativeFiles.push(...await collectNativeFiles(entryPath));
    } else if (entry.isFile() && nativeExtensions.has(path.extname(entry.name))) {
      nativeFiles.push(entryPath);
    }
  }

  return nativeFiles;
}

try {
  await stat(standaloneDir);
} catch {
  console.log('[sanitize-standalone] No standalone output found; skipping.');
  process.exit(0);
}

for (const removablePath of removablePaths) {
  await rm(removablePath, { force: true, recursive: true });
}

const nativeFiles = await collectNativeFiles(standaloneDir);
if (nativeFiles.length > 0) {
  throw new Error(
    `[sanitize-standalone] Native binaries remain:\n${nativeFiles.join('\n')}`,
  );
}

console.log('[sanitize-standalone] Removed optional native packages and local caches.');