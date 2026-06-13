# Dhruv's Sketchbook Astro App

This is the Astro migration target for Dhruv's Sketchbook. The app keeps the existing React UI as route-level islands while moving routing, metadata, prerendered pages, markdown mirrors, and API endpoints into Astro.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Astro dev server |
| `npm run check` | Type-check Astro, React, and endpoint code |
| `npm run build` | Build Astro Node output into `dist/` |
| `npm run preview` | Preview the built Node app locally |
| `npm run start` | Run the built server with `node dist/entry.mjs` |

From the workspace root, `npm run dev`, `npm run build`, `npm run start`, and `npm run lint` now proxy here. The previous Next app is still available through root `next:*` scripts for comparison.

## Runtime Shape

- Public pages and SEO files are prerendered into `dist/client`.
- Dynamic API routes and protected pages run through Astro's Node adapter.
- The server entrypoint is `dist/entry.mjs`.
- Static hashed assets live under `dist/client/_astro`.
- Public resources and sounds live under `dist/client/resources` and `dist/client/sounds`.

## TTS Boundary

Local TTS remains VM/Node-based for this phase. Docker installs `requirements-tts.txt`, runs the app with `LOCAL_TTS_PYTHON=/opt/tts-venv/bin/python`, and includes `scripts/kitten-tts-worker.py` in the image. Moving TTS off the VM is intentionally deferred until the Cloudflare Workers phase.

## Audit Note

Current Astro/Vite releases still pull an upstream `esbuild` advisory. `npm audit fix --force` proposes a breaking downgrade to an old Astro release, so do not run it blindly. Track upstream Astro/Vite/esbuild releases and rerun `npm audit --omit=dev` after updates.
