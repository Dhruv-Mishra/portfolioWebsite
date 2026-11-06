// Usage: node oci-layers.mjs <oci-layout-dir>
// Fails unless both platform images carry the byte-identical `COPY /app/standalone` layer.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const blob = digest => JSON.parse(fs.readFileSync(path.join(dir, 'blobs', ...digest.split(':')), 'utf8'));
const platforms = [];

function walk(desc) {
  const m = blob(desc.digest);
  if (m.manifests) {
    for (const d of m.manifests) walk(d);
    return;
  }
  const plat = desc.platform ? `${desc.platform.os}/${desc.platform.architecture}` : 'unknown/unknown';
  if (!m.layers || plat === 'unknown/unknown') return;
  const steps = blob(m.config.digest).history.filter(h => !h.empty_layer).map(h => h.created_by ?? '');
  const layers = m.layers.map((l, i) => ({ digest: l.digest, size: l.size, step: steps[i] ?? '' }));
  platforms.push({ plat, total: layers.reduce((s, l) => s + l.size, 0), app: layers.find(l => l.step.includes('/app/standalone')) });
}

for (const d of JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).manifests) walk(d);
for (const p of platforms) {
  console.log(`${p.plat}: image ${(p.total / 1048576).toFixed(1)} MiB compressed; app layer ${p.app?.digest} ${((p.app?.size ?? 0) / 1048576).toFixed(2)} MiB`);
}
const ok = platforms.length === 2 && platforms.every(p => p.app) && new Set(platforms.map(p => p.app.digest)).size === 1;
console.log(ok ? 'PASS: app layer identical across platforms' : 'FAIL: app layer differs or is missing');
process.exit(ok ? 0 : 1);
