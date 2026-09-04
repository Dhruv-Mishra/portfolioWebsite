import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const standaloneDir = path.resolve('.next', 'standalone');
const removablePaths = [
  path.join(standaloneDir, '.cache'),
];
const optionalNativePackageNames = new Set(['@img', 'onnxruntime-node', 'sharp']);
const nativeExtensions = new Set(['.dll', '.dylib', '.node', '.so']);

async function removeOptionalNativePackageTrees(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (path.basename(directory) === 'node_modules' && optionalNativePackageNames.has(entry.name)) {
      await rm(entryPath, { force: true, recursive: true });
      continue;
    }

    await removeOptionalNativePackageTrees(entryPath);
  }
}

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
await removeOptionalNativePackageTrees(standaloneDir);

const nativeFiles = await collectNativeFiles(standaloneDir);
if (nativeFiles.length > 0) {
  throw new Error(
    `[sanitize-standalone] Native binaries remain:\n${nativeFiles.join('\n')}`,
  );
}

const staticMediaDir = path.resolve('.next', 'static', 'media');
try {
  const mediaFiles = await readdir(staticMediaDir);
  for (const file of mediaFiles) {
    if (file.startsWith('ort-wasm') && file.endsWith('.wasm')) {
      await rm(path.join(staticMediaDir, file), { force: true });
      console.log(`[sanitize-standalone] Removed redundant WASM binary from static/media: ${file}`);
    }
  }
} catch {
  // static/media does not exist or has no files
}

console.log('[sanitize-standalone] Removed optional native package trees, local caches, and externalized WASM.');