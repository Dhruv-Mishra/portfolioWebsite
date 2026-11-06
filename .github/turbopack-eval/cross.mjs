// Usage: node cross.mjs <htmlBase> <assetBase>
// Loads HTML from one origin and fetches every referenced static asset (recursively through JS) from another.
const [htmlBase, assetBase] = process.argv.slice(2);
const routes = ['/', '/about', '/projects', '/chat', '/resume', '/stickers', '/settings', '/guestbook', '/about.md', '/llms.txt', '/sitemap.xml'];
let failures = 0;
const queue = [];

for (const route of routes) {
  const res = await fetch(htmlBase + route, { redirect: 'manual' });
  const body = await res.text();
  if (res.status !== 200) {
    console.log(`route ${route} -> ${res.status}`);
    failures++;
  }
  for (const m of body.matchAll(/\/_next\/static\/[^"' ?\\)]+/g)) queue.push(m[0]);
}

const seen = new Set();
let fetched = 0;
while (queue.length) {
  const asset = queue.shift();
  if (seen.has(asset)) continue;
  seen.add(asset);
  // sanitize-standalone deletes these on purpose; ONNX Runtime loads its WASM from wasmPaths instead.
  if (/\/media\/ort-wasm[^/]*\.wasm$/.test(asset)) continue;
  const res = await fetch(assetBase + asset);
  fetched++;
  if (res.status !== 200) {
    console.log(`asset ${asset} -> ${res.status}`);
    failures++;
    continue;
  }
  if (!asset.endsWith('.js')) {
    await res.arrayBuffer();
    continue;
  }
  const text = await res.text();
  for (const m of text.matchAll(/\/_next\/static\/[^"' ?\\)`]+\.(?:js|css|wasm|woff2)/g)) queue.push(m[0]);
  for (const m of text.matchAll(/"static\/(chunks|media)\/([^"]+\.(?:js|css|wasm|woff2))"/g)) queue.push(`/_next/static/${m[1]}/${m[2]}`);
}

console.log(`${failures ? 'FAIL' : 'PASS'}: HTML from ${htmlBase}, assets from ${assetBase}: ${routes.length} routes, ${fetched} assets, ${failures} failures`);
process.exit(failures ? 1 : 0);
