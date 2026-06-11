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

Also verify at least one `/_next/static/...` asset from the local Nginx HTML returns `200`.

## No-Go Conditions

Stop if any of these are true:

- The deploy is not running from `refs/heads/deployed/production`.
- The first production Docker deploy is not using `deploy_mode=image`.
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