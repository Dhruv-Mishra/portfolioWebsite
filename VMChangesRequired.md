# VM Changes Required

Use this handoff for each production VM before the first Docker production deploy.

## Target State

- Branch: `deployed/production`
- Domain: `whoisdhruv.com`
- Service: `portfolio`
- Docker container: `portfolio`
- Internal app port: `3000`
- Public route: Cloudflare -> Nginx `443` -> `127.0.0.1:3000`

Staging must stay isolated as `portfolio-staging` on `staging.whoisdhruv.com` and port `3010`.

## Cloudflare

- Keep production DNS pointed at the current production VM origins or production origin pool.
- Do not point Cloudflare directly at port `3000`; Docker is private behind Nginx.
- Keep SSL/TLS mode as Full (strict).
- Ensure `/api/*` is not edge-cached.
- Ensure `/api/chat` and `/api/tts` are not challenged for normal browser traffic and remain stream-friendly.
- If using Cloudflare Load Balancer, drain and re-enable one production origin at a time during deploy.
- Purge the Cloudflare cache after all production origins are green if any HTML cache rule exists.

## Required VM State Before Deploy

On every production VM:

- Docker is installed and `sudo docker info` succeeds.
- Nginx is installed and `sudo nginx -t` passes.
- `/etc/deploy/machine.conf` exists.
- `/etc/deploy/sites/portfolio.conf` exists and contains:

```bash
DOMAIN="whoisdhruv.com"
SERVICE_NAME="portfolio"
NEXTJS_PORT=3000
DOCKER_CONTAINER_NAME="portfolio"
GIT_BRANCH="deployed/production"
SSL_CERT="/etc/ssl/cloudflare/whoisdhruv.com.pem"
SSL_KEY="/etc/ssl/cloudflare/whoisdhruv.com.key"
NGINX_CONF_TEMPLATE="nginx-cloudflare.conf"
RELEASE_RETENTION_COUNT=3
```

- `/opt/portfolio/config/.env.local` exists, or a known-good production `.env.local` exists in the legacy app path for first-run migration.
- Runtime env values do not point to staging. If present, `SITE_URL` and `NEXT_PUBLIC_SITE_URL` must be `https://whoisdhruv.com`.
- Cloudflare origin certificate and key exist on disk; the key is mode `600`.
- The VM can pull the GHCR image digest, either through the `GHCR_READ_TOKEN` GitHub Actions secret or existing VM Docker credentials.
- Repository-level Actions secrets `STAGING_HF_TOKEN` and `PRODUCTION_HF_TOKEN` exist. They may use the same least-privilege Hugging Face read token; the account owning that token must accept the gated terms at <https://huggingface.co/kyutai/pocket-tts>.
- The deploy owner has confirmed that `public/sounds/voice/TTSReference.mp3` is their voice or is used with explicit lawful consent. Do not use it to deceive or impersonate. Pocket TTS software is MIT; weights are CC BY 4.0 and subject to gated prohibited-use terms.
- `/etc/deploy/machine.conf` sets at least `MEMORY_HIGH_MB=1200` and `MEMORY_MAX_MB=1536`. This is a provisional minimum: prefer a host with at least 2 GB RAM and verify measured peak RSS and no swap pressure. A larger 24 GB fleet can retain `4096` and `6144`.
- `/var/cache/portfolio/pocket-tts` has suitable ownership and available disk space, and the VM has outbound access for the initial Hugging Face model download. After one successful warmup, offline operation may use `HF_HUB_OFFLINE=1` or `LOCAL_TTS_OFFLINE=1`.
- For a private voice reference, store the file outside the release/image, restrict it appropriately, and set `LOCAL_TTS_REFERENCE_HOST_PATH=/absolute/path/to/reference.mp3` in `/opt/portfolio/config/.env.local`. The host path must be absolute and contain only letters, digits, `_`, `.`, `/`, and `-`, with no whitespace. Deploy validates it and mounts it read-only at `/run/secrets/tts-reference`; do not place a host path in `LOCAL_TTS_REFERENCE_PATH`.
- Port `3000` is free, owned by `portfolio.service`, or owned by the legacy portfolio app only.
- Ports `3001` and `3010` are not touched.

## Do Not Manually Stop Production First

Do not manually kill the legacy production process before running the first Docker deploy. The deploy script stops `portfolio.service`, removes any old `portfolio` container, and clears orphaned listeners on port `3000` during the health-gated deployment. Manual pre-stopping adds downtime and can hide the process that owned the port.

## Deploy Checklist

- Confirm the candidate commit is already deployed and tested on staging.
- Run the `Promote Staging to Production` workflow.
- Let it move `deployed/staging` to `deployed/production`.
- Let `Deploy Portfolio Production` run in `image` mode.
- Approve the production environment gate.
- Keep `skip_nginx=false` for the first Docker production migration.
- Do not select artifact mode: Pocket TTS needs the bundled Python runtime. The image build verifies Pocket TTS, Torch, TorchAO, and SoundFile imports; deployment synthesizes real audio and rolls back on failure before workflow metadata checks.

## Post-Deploy Verification

On each production VM:

```bash
sudo systemctl is-active portfolio
sudo docker ps --format '{{.Names}}' | grep -qx portfolio
curl -sf http://127.0.0.1:3000/
curl -sk -H 'Host: whoisdhruv.com' https://127.0.0.1/ -o /dev/null -w '%{http_code}\n'
sudo test -f /opt/portfolio/current/.deploy/meta.json
sudo nginx -t
```

Verify metadata without dumping audio payloads. These VM-local probes include the headers required by the same-origin API:

```bash
curl -fsS -H 'Origin: https://whoisdhruv.com' -H 'Sec-Fetch-Site: same-origin' \
	http://127.0.0.1:3000/api/tts

curl -fsS -o /tmp/portfolio-tts-probe.ndjson -w '%{http_code}\n' \
	-H 'Origin: https://whoisdhruv.com' \
	-H 'Sec-Fetch-Site: same-origin' \
	-H 'Accept: application/x-ndjson' \
	-H 'X-TTS-Accept-Compression: gzip' \
	-H 'Content-Type: application/json' \
	--data '{"text":"Production voice readiness check.","stream":true}' \
	http://127.0.0.1:3000/api/tts
grep -E '"type":"(ready|chunk|done)"' /tmp/portfolio-tts-probe.ndjson | cut -c1-160
rm -f /tmp/portfolio-tts-probe.ndjson
```

Also verify at least one `/_next/static/...` asset from the local Nginx HTML returns `200`.

## No-Go Conditions

Stop if any of these are true:

- The deploy is not running from `refs/heads/deployed/production`.
- The first production Docker deploy is not using `deploy_mode=image`.
- Required `PRODUCTION_HF_TOKEN` is missing, its account has not accepted Pocket TTS gated terms, the reference voice has not been consent-confirmed, or the Pocket cache cannot be created/warmed.
- The workflow input `site` is not `portfolio`.
- `skip_nginx=true` is requested for the first Docker migration.
- Any production env value points to `staging.whoisdhruv.com`.
- Docker is missing, unreachable, or cannot pull the GHCR image.
- `sudo nginx -t` fails before deploy.
- The Cloudflare origin cert/key is missing or does not cover `whoisdhruv.com` and `www.whoisdhruv.com`.
- Port `3000` is owned by an unknown non-portfolio service.
- Any command targets `portfolio-staging`, port `3010`, or `/etc/deploy/sites/portfolio-staging.conf`.
- Cloudflare routes production traffic to an origin not included in the production deploy matrix.
- Cloudflare caches `/api/*` or applies a challenge/rule that breaks chat or TTS.