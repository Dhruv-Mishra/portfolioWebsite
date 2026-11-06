# Deployment

Production delivery is branch-promoted and container-based. The workflow files and `portfolio/scripts/deploy.sh` are the executable source of truth; this page is the operator reference.

## Promotion Flow

```text
dev/lkg -> deployed/staging -> deployed/production
```

- Staging uses two manual dispatches. First run `promote-staging.yml` with `prepare-release`: it accepts only `dev/lkg`, verifies `deployed/staging` is an ancestor, creates or reuses `release/staging-v<version>` with the minor package bump, and reports an **Open release PR** compare link.
- Open that link manually in GitHub (or with an authorized client), create the release PR into `dev/lkg`, and merge it after the required review. Then run `promote-staging.yml` with `promote-release` and the exact merged `dev/lkg` release SHA. It verifies the reviewed release commit and merge lineage, fast-forwards only `deployed/staging`, then dispatches staging deployment.
- The production promotion workflow fast-forwards `deployed/production` from `deployed/staging` after a GitHub production-environment approval, then dispatches production deployment.
- Production deployment has a separate production-environment approval before it mutates hosts.

## Build and Delivery

The staging and production workflows:

1. Require the expected branch and validate required runtime signing configuration, the local-agent credential, and the environment-specific voice-agent credential.
2. Run `npm ci`, lint, TypeScript checks (including `next typegen` route types), and Vitest from `portfolio/`. Deploy jobs need this job, so image builds skip Next's duplicate in-build type check (`NEXT_EXTERNAL_TYPECHECK=1`).
3. Staging builds and pushes one GHCR Docker image for `linux/amd64` and `linux/arm64`. The Next.js build (Turbopack, as in CI) runs once on the build platform, so both architectures share one app layer and `/_next/static` graph; Next builds are not reproducible, so never build per architecture. After its rollout and smoke checks pass, staging tags that digest `verified-<sha>`. Production reuses the `verified-<sha>` digest for the same commit after checking its revision label, and builds only when no verified image exists.
4. Deploy the immutable image digest to Linux VMs behind Cloudflare and Nginx.

The image contains Node 22 standalone output, static assets, Python, and the CPU Pocket TTS runtime. It is environment-neutral: server code reads the site origin from runtime `SITE_URL`, which staging must set to its own origin. The production container serves port 3000; staging is configured as the separate `portfolio-staging` service on port 3010.

The Node base image is pinned by digest so the slow apt and PyTorch layers stay cached between builds. Dependabot (`.github/dependabot.yml`) proposes weekly digest refreshes; merge them promptly for Node security releases.

## Advisory Model Health

Model-health publishing is operational telemetry, not a release gate. `.github/workflows/publish-model-health.yml` runs every 10 minutes for staging and production, reads each deployed model-status route, probes only the returned deployment canaries, and writes sanitized snapshots to the private `Dhruv-Mishra/portfolio-model-health` repository. Missing workflow credentials, runtime status failures, malformed responses, GitHub API failures, and write conflicts warn and exit successfully.

Configure `MODEL_HEALTH_TOKEN` as a GitHub Actions secret with contents access to that private repository. Configure each runtime environment with `GITHUB_MODEL_HEALTH_REPO=Dhruv-Mishra/portfolio-model-health`, a server-only `GITHUB_MODEL_HEALTH_TOKEN`, and the matching `MODEL_HEALTH_ENVIRONMENT` value. The runtime token is read-only in normal operation; do not put either token in image build arguments or tracked environment files.

## Host Contract

Each site has a protected `/etc/deploy/sites/<site>.conf` configuration. It provides the domain, service name, port, branch identity, container policy, TTS role, and paths. Runtime environment files hold secrets and per-environment values; do not add them to the repository. Staging and production deploys both write `LOCAL_AGENT_BASE_URL=https://llm.whoisdhruv.com/v1` and `LOCAL_AGENT_API_KEY` from `STAGING_LOCAL_AGENT_API_KEY` / `PRODUCTION_LOCAL_AGENT_API_KEY`. They also inject `VOICE_AGENT_API_KEY` from `STAGING_VOICE_AGENT_API_KEY` / `PRODUCTION_VOICE_AGENT_API_KEY`.

Before deployment, workflows validate the host identity, Nginx, Docker, architecture, runtime environment, and TTS role. The local TTS role is the canary; remote roles follow. The deploy script keeps retained releases, activates a new release atomically, checks health, and rolls back on failure. The production rollback workflow is serial and can use a retained SHA or each host's newest previous release.

### Cloudflare Origin Policy

Each image deploy ships `update-cloudflare-origin-policy.sh`, installs it as `/usr/local/sbin/update-cloudflare-origin-policy`, and refreshes the Cloudflare CIDR policy before `deploy.sh` runs. The updater writes the Nginx trusted-proxy and peer-map files, preserves the loopback exception for local health probes, validates and reloads Nginx, and replaces policy-managed UFW rules with only the current Cloudflare CIDRs.

For existing VMs, the first hardened image deployment performs that installation and refresh automatically; it then requires active Nginx and UFW. Schedule the root-run updater for at least daily refreshes between deployments. Do not use the production or staging workflow to skip Nginx hardening.

### Edge HTML Caching

Static pages send `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400, no-transform`. Cloudflare only caches HTML when a Cache Rule makes it eligible; without one every page view goes to an origin VM (about 0.5 s TTFB from Europe in the Lighthouse run). To serve pages from the edge, add a zone Cache Rule:

- **Match:** hostname is `whoisdhruv.com` or `staging.whoisdhruv.com`, method is `GET`, the path does not start with `/api`, `/admin`, `/matrix-notes`, `/guestbook`, or `/chat/`, and no `rsc` request header is present (`not any(http.request.headers.names[*] == "rsc")`). RSC payloads stay uncached because their cache key does not include the build.
- **Action:** Eligible for cache; Edge TTL "Use cache-control header if present"; Browser TTL "Respect origin".

Deploys and rollbacks copy the active release's `/_next/static` files into the release being activated and keep each build's files for three days after it stops serving, so edge-cached HTML from the previous build keeps working. The staging and production smoke jobs also purge their hostname when the `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_CACHE_PURGE_TOKEN` (Zone → Cache Purge) secrets exist; add both before enabling the rule. Rollbacks do not purge, so purge the hostname manually after one.

`no-transform` intentionally stops Cloudflare JavaScript Detections and Email Address Obfuscation from rewriting static pages. Cloudflare does not auto-inject the Web Analytics beacon on any route, so `components/Analytics.tsx` loads it on every page and reports to the zone's same-origin `/cdn-cgi/rum`; the zone-scoped token is rejected by `cloudflareinsights.com`.

## Operator Commands

From the repository root:

| Command | Use |
|---|---|
| `npm run lint` | Run ESLint for the app |
| `npm run typecheck` | Run strict TypeScript checking (after `next typegen`) |
| `npm run typecheck:native` | Run the pinned native `tsrs` checker (sub-second; parity trial, not yet authoritative) |
| `npm run build` | Run the package build through the root wrapper |
| `cd portfolio; npm test` | Run the canonical Vitest suite |
| `cd portfolio; npm run tts:smoke` | Exercise local Pocket TTS |

For a local deploy-image check, use the documented `docker build` and `docker run` commands in [the package README](../portfolio/README.md). Do not place credentials in shell history, docs, or image build arguments.

## Supply-Chain Note

Third-party GitHub Actions are pinned to approved full commit SHAs. Updating an action pin is a deployment-security change and must be reviewed with the workflow change.

Every SSH/SCP step passes `SERVER_SSH_FINGERPRINT_<n>` (environment secret per host, shared by staging and production) as the host-key fingerprint. Read it on the VM console, not over the network: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | cut -d' ' -f2` (`SHA256:...`). A mismatch fails before any remote command runs; until the secret exists, preflight warns and host keys are not verified. Use a staging deploy to confirm the negotiated key type before relying on it in production. The SSH/SCP actions still download their client binaries without checksum verification; replacing them with the runner's OpenSSH client is the remaining fix.

## Documentation Map

| Guide | Use it for |
|---|---|
| [Architecture](architecture.md) | Runtime boundaries and request flow |
| [API](api.md) | Browser-facing endpoint contracts and controls |
| [AI and RAG](ai-and-rag.md) | Model selection, retrieval, and server configuration |
| [TTS](tts.md) | Pocket TTS behavior and gateway operations |
| [Deployment](deployment.md) | Promotion, container delivery, rollback, and operator checks |