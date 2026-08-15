# Deployment

Production delivery is branch-promoted and container-based. The workflow files and `portfolio/scripts/deploy.sh` are the executable source of truth; this page is the operator reference.

## Promotion Flow

```text
dev/lkg -> deployed/staging -> deployed/production
```

- Staging uses two manual dispatches. First run `promote-staging.yml` with `prepare-release`: it accepts only `dev/lkg`, verifies `deployed/staging` is an ancestor, creates or reuses `release/staging-v<version>` with the minor package bump, and reports an **Open release PR** compare link.
- Open that link manually in GitHub (or with an authorized client), create the release PR into `dev/lkg`, and merge it after the required review. Then run `promote-staging.yml` with `promote-release` and the exact merged `dev/lkg` release SHA. It verifies the release commit, fast-forwards only `deployed/staging`, then dispatches staging deployment.
- The production promotion workflow fast-forwards `deployed/production` from `deployed/staging` after a GitHub production-environment approval, then dispatches production deployment.
- Production deployment has a separate production-environment approval before it mutates hosts.

## Build and Delivery

The staging and production workflows:

1. Require the expected branch and validate required runtime signing configuration plus the local-agent credential.
2. Run `npm ci`, lint, TypeScript checks, and Vitest from `portfolio/`.
3. Build and push one GHCR Docker image for `linux/amd64` and `linux/arm64`.
4. Deploy the immutable image digest to Linux VMs behind Cloudflare and Nginx.

The image contains Node 22 standalone output, static assets, Python, and the CPU Pocket TTS runtime. The production container serves port 3000; staging is configured as the separate `portfolio-staging` service on port 3010.

## Advisory Model Health

Model-health publishing is operational telemetry, not a release gate. `.github/workflows/publish-model-health.yml` runs every 10 minutes for staging and production, reads each deployed model-status route, probes only the returned deployment canaries, and writes sanitized snapshots to the private `Dhruv-Mishra/portfolio-model-health` repository. Missing workflow credentials, runtime status failures, malformed responses, GitHub API failures, and write conflicts warn and exit successfully.

Configure `MODEL_HEALTH_TOKEN` as a GitHub Actions secret with contents access to that private repository. Configure each runtime environment with `GITHUB_MODEL_HEALTH_REPO=Dhruv-Mishra/portfolio-model-health`, a server-only `GITHUB_MODEL_HEALTH_TOKEN`, and the matching `MODEL_HEALTH_ENVIRONMENT` value. The runtime token is read-only in normal operation; do not put either token in image build arguments or tracked environment files.

## Host Contract

Each site has a protected `/etc/deploy/sites/<site>.conf` configuration. It provides the domain, service name, port, branch identity, container policy, TTS role, and paths. Runtime environment files hold secrets and per-environment values; do not add them to the repository. Staging and production deploys both write `LOCAL_AGENT_BASE_URL=https://llm.whoisdhruv.com/v1` and `LOCAL_AGENT_API_KEY` from `STAGING_LOCAL_AGENT_API_KEY` / `PRODUCTION_LOCAL_AGENT_API_KEY`. They also inject `VOICE_AGENT_API_KEY` from `STAGING_VOICE_AGENT_API_KEY` / `PRODUCTION_VOICE_AGENT_API_KEY`.

Before deployment, workflows validate the host identity, Nginx, Docker, architecture, runtime environment, and TTS role. The local TTS role is the canary; remote roles follow. The deploy script keeps retained releases, activates a new release atomically, checks health, and rolls back on failure. The production rollback workflow is serial and can use a retained SHA or each host's newest previous release.

### Cloudflare Origin Policy

Each image deploy ships `update-cloudflare-origin-policy.sh`, installs it as `/usr/local/sbin/update-cloudflare-origin-policy`, and refreshes the Cloudflare CIDR policy before `deploy.sh` runs. The updater writes the Nginx trusted-proxy and peer-map files, preserves the loopback exception for local health probes, validates and reloads Nginx, and replaces policy-managed UFW rules with only the current Cloudflare CIDRs.

For existing VMs, the first hardened image deployment performs that installation and refresh automatically; it then requires active Nginx and UFW. Schedule the root-run updater for at least daily refreshes between deployments. Do not use the production or staging workflow to skip Nginx hardening.

## Operator Commands

From the repository root:

| Command | Use |
|---|---|
| `npm run lint` | Run ESLint for the app |
| `npm run typecheck` | Run strict TypeScript checking |
| `npm run build` | Run the package build through the root wrapper |
| `cd portfolio; npm test` | Run the canonical Vitest suite |
| `cd portfolio; npm run tts:smoke` | Exercise local Pocket TTS |

For a local deploy-image check, use the documented `docker build` and `docker run` commands in [the package README](../portfolio/README.md). Do not place credentials in shell history, docs, or image build arguments.

## Supply-Chain Note

Third-party GitHub Actions are pinned to approved full commit SHAs. Updating an action pin is a deployment-security change and must be reviewed with the workflow change.

## Documentation Map

| Guide | Use it for |
|---|---|
| [Architecture](architecture.md) | Runtime boundaries and request flow |
| [API](api.md) | Browser-facing endpoint contracts and controls |
| [AI and RAG](ai-and-rag.md) | Model selection, retrieval, and server configuration |
| [TTS](tts.md) | Pocket TTS behavior and gateway operations |
| [Deployment](deployment.md) | Promotion, container delivery, rollback, and operator checks |