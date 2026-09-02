# Bun migration: gains and losses

## Decision summary

The repository now uses Bun 1.4.0 as its only project package manager and package-script launcher. `bun.lock` is the sole dependency lockfile, and active local, CI, release, Docker build, and legacy VM build commands no longer invoke `npm` or `npx`.

Node.js 22 remains the Next.js build and production runtime. This boundary removes npm from project operations without taking on a Bun-runtime compatibility migration.

This is not a claim that every literal npm reference has disappeared:

- Bun downloads npm-compatible packages from npm registry URLs recorded in `bun.lock`. Those URLs do not invoke the npm client.
- The official `node:22-bookworm-slim` production base image includes npm even though the application never uses it.
- Next.js dependencies, generated messages, debug-log ignore rules, and portfolio prose may contain the word npm.

Deleting npm from a later Docker layer would hide its commands but would not remove its bytes from the underlying Node image layer. Building a custom npm-free Node image would add security-update and multi-architecture maintenance for no application-level benefit, so the official Node image is retained.

## Measured results

These timings are local Windows measurements for this repository, not general Bun benchmarks:

| Scenario | Result | Interpretation |
|---|---:|---|
| Previous npm 10.9.8 clean install | 34-43 seconds | Baseline range from repeated isolated runs |
| Bun 1.4.0, hoisted linker, clean frozen install | 52.53 seconds | 22-55% slower than the measured npm baseline |
| Bun 1.4.0, isolated linker, clean frozen install | 9.3 seconds | Fast, but rejected because the generated Next.js standalone server was incomplete |
| Final standalone startup | Successful | Node 22 started the corrected hoisted build |
| Final standalone HTTP smoke | HTTP 200 | The home route served successfully |

The isolated layout omitted an `@swc/helpers` ESM file from Next.js 16.3.1 standalone output tracing. The final configuration therefore pins Bun's hoisted linker for compatibility. The isolated timing is not a usable performance gain.

## Gains

### Simpler package-management contract

- One package manager version: Bun 1.4.0.
- One lockfile: `portfolio/bun.lock`.
- One frozen-install command: `bun ci`.
- The npm-specific lockfile repair hook and hook installer were removed.
- CI and deploy workflows no longer maintain npm cache configuration, an npm version variable, or a separate dry-run lockfile repair path.

### Consistent automation

- Root wrapper scripts, application scripts, CI, release preparation, Docker builds, and legacy VM deployment use Bun commands.
- Bun's release version command replaces the previous pinned `npx npm` invocation.
- Bun blocks untrusted dependency lifecycle scripts by default. The current build and test paths need no added trust exceptions.

### Cross-platform lockfile

- The lockfile records platform constraints and native variants for Windows, macOS, Linux x64, and Linux arm64.
- Frozen Linux x64 and arm64 dry runs passed from the Windows-generated lockfile.
- GitHub Actions uses the pinned `setup-bun` action on Ubuntu.
- Docker uses the official Bun 1.4.0 build image, which publishes amd64 and arm64 variants.
- The Ubuntu VM bootstrap installs Bun 1.4.0 system-wide before legacy source deployments.

## Losses and limitations

### No demonstrated install-speed gain

The compatible hoisted Bun install is slower than npm on the measured Windows filesystem. Linux and hosted CI may behave differently, so workflow timings should be compared after several real runs before making a Linux performance claim.

The CI workflow also runs four independent installs and no longer restores npm's dependency cache. Parallel jobs preserve elapsed-time isolation, but total runner work may increase unless Bun's cache is restored effectively.

### No bundle-size gain

Bun resolves the same dependency versions and Next.js still produces the client and server bundles. Package-manager replacement does not remove application code from those bundles.

Current corrected build payload:

| Output | Size |
|---|---:|
| Next.js standalone server | 45.21 MiB |
| `.next/static` | 25.03 MiB |
| Public assets | 4.56 MiB |
| Total copied application payload | 74.80 MiB |

The largest static item is the lazy-loaded Whisper ONNX WASM asset at approximately 22.48 MiB. Optimizing that asset would matter far more than changing package managers.

### No server-runtime gain

Production still runs `node server.js`, so the migration does not change request throughput, latency, memory use, garbage collection, or Node startup behavior. Bun launches build scripts but does not serve production traffic.

Running the standalone server with Bun would be a separate runtime migration. It should only be considered with Linux container tests covering all routes, streaming, graceful shutdown, memory, load, and Pocket TTS behavior.

### No meaningful production-image reduction

Bun is copied only into the Docker build stage and is absent from the final application payload. The final image still derives from the official Node image, which includes npm. Removing npm commands in a child layer would not reclaim the base-layer bytes.

The Python, Pocket TTS, and CPU Torch runtime is a substantially larger image-size target. Separate web-only and local-TTS image targets would offer a more meaningful optimization for hosts that use remote TTS.

### Added toolchain dependency

Developers, CI, and source-deploy VMs now require the pinned Bun release in addition to Node 22. Bun's package-manager and Next.js standalone compatibility must be revalidated when either tool changes its dependency layout or output tracing.

## Platform status

The source and configuration changes are not Windows-specific. They are designed for the Linux production path:

- CI and deploy jobs run on Ubuntu.
- Docker build and runtime stages use Debian Linux images.
- Production remains Node 22 standalone behind Nginx on Linux VMs.
- Bun installation in `optimize_vm.sh` targets Ubuntu and installs to `/usr/local`.
- The Docker build uses native build-platform Bun binaries and emits architecture-neutral standalone output before the final multi-platform image is assembled.

Local validation covered frozen installs, lint, type checking, 970 tests, the production build, standalone startup, and an HTTP 200 smoke response. Docker was unavailable on the Windows development machine, so a real Linux multi-platform image build and container health smoke remain CI acceptance gates.

## Recommendation

Keep the current Bun package-manager and Node-runtime boundary for its simpler operational contract, not for a proven performance improvement. Do not claim install, bundle, image, or server gains until Linux CI or production measurements demonstrate them. Keep the hoisted linker while Next.js standalone tracing fails with Bun's isolated layout.