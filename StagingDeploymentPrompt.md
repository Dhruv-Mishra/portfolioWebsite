# Staging Deployment Prompt For VM Agents

Use this prompt for each agent working on one existing production VM.

## Objective

Prepare this VM to run the containerized staging site without disturbing any existing production app or any other website on the machine.

The staging site must be isolated:

```text
production website: existing service, existing port, do not touch
other website: existing service, port 3001 on at least one VM, do not touch
staging website: new service portfolio-staging, port 3010, containerized
```

## Non-Negotiable Safety Rules

1. Do not stop, restart, disable, rename, or edit the existing production service.
2. Do not edit `/etc/deploy/sites/portfolio.conf`.
3. Do not use port `3000` or `3001` for staging.
4. Do not run `deployWebsite`.
5. Do not deploy `site=portfolio`.
6. Do not switch the existing production repo checkout away from its current branch.
7. Do not reload nginx unless `nginx -t` passes.
8. Do not change Cloudflare DNS from the VM.
9. Do not copy a production `.env.local` into staging wholesale.
10. If any safety check fails, stop and report. Do not improvise.

## Branch Rules

The VM may currently have an older non-containerized `master` checkout. That is expected.

`master` currently has only workflow registration changes. The containerization scripts and Docker deploy path live on:

```text
deployed/staging
```

Fetch or clone `deployed/staging` into a separate staging source directory. Do not alter the existing production checkout.

## Required Standard Values

Use exactly these values on every VM:

```bash
STAGING_BRANCH="deployed/staging"
STAGING_SITE="portfolio-staging"
STAGING_DOMAIN="staging.whoisdhruv.com"
STAGING_PORT="3010"
STAGING_SOURCE_DIR="/opt/portfolio-staging/source"
STAGING_ENV_FILE="/opt/portfolio-staging/config/.env.local"
STAGING_SITE_CONF="/etc/deploy/sites/portfolio-staging.conf"
```

## Script To Run On Each VM

Create `/tmp/prepare-portfolio-staging.sh` with exactly this content, then run it as root.

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/Dhruv-Mishra/portfolioWebsite.git}"
STAGING_BRANCH="${STAGING_BRANCH:-deployed/staging}"
STAGING_SITE="${STAGING_SITE:-portfolio-staging}"
STAGING_DOMAIN="${STAGING_DOMAIN:-staging.whoisdhruv.com}"
STAGING_PORT="${STAGING_PORT:-3010}"
STAGING_SOURCE_DIR="${STAGING_SOURCE_DIR:-/opt/portfolio-staging/source}"
SERVICE_USER="${SERVICE_USER:-ubuntu}"

PROD_SITE_CONF="${PROD_SITE_CONF:-/etc/deploy/sites/portfolio.conf}"
STAGING_SITE_CONF="/etc/deploy/sites/${STAGING_SITE}.conf"
MACHINE_CONF="/etc/deploy/machine.conf"
STAGING_ROOT="/opt/${STAGING_SITE}"
STAGING_ENV_FILE="${STAGING_ROOT}/config/.env.local"
STAGING_CACHE_DIR="/var/cache/${STAGING_SITE}/pocket-tts"

abort() {
  echo "ERROR: $*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

read_conf_value() {
  local file="$1"
  local key="$2"
  [ -f "$file" ] || return 1
  awk -F= -v k="$key" '$1 == k { gsub(/^[ \t\"]+|[ \t\"]+$/, "", $2); print $2; exit }' "$file"
}

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

ensure_secret() {
  local key="$1"
  local file="$2"
  if ! grep -qE "^${key}=.{24,}" "$file" 2>/dev/null; then
    upsert_env "$key" "$(openssl rand -hex 32)" "$file"
  fi
}

require_root() {
  [ "${EUID}" -eq 0 ] || abort "Run as root: sudo bash /tmp/prepare-portfolio-staging.sh"
}

check_safety() {
  [ "$STAGING_BRANCH" = "deployed/staging" ] || abort "STAGING_BRANCH must be deployed/staging"
  [ "$STAGING_SITE" = "portfolio-staging" ] || abort "STAGING_SITE must be portfolio-staging"
  [ "$STAGING_PORT" = "3010" ] || abort "STAGING_PORT must be 3010"
  [ "$STAGING_SITE_CONF" != "$PROD_SITE_CONF" ] || abort "staging config path matches production config path"

  if command_exists ss && ss -tln "sport = :${STAGING_PORT}" 2>/dev/null | grep -q LISTEN; then
    if ! systemctl is-active --quiet "$STAGING_SITE" 2>/dev/null; then
      abort "port ${STAGING_PORT} is already in use by something other than ${STAGING_SITE}"
    fi
  fi

  if command_exists ss && ss -tln "sport = :3000" 2>/dev/null | grep -q LISTEN; then
    echo "INFO: port 3000 is in use. It will not be touched."
  fi

  if command_exists ss && ss -tln "sport = :3001" 2>/dev/null | grep -q LISTEN; then
    echo "INFO: port 3001 is in use. It will not be touched."
  fi
}

install_host_prereqs() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl git gnupg iproute2 lsb-release nginx openssl ufw

  if ! command_exists docker; then
    install -m 0755 -d /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
    fi

    . /etc/os-release
    cat > /etc/apt/sources.list.d/docker.list <<DOCKER_APT
    deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable
DOCKER_APT

    apt-get update
    apt-get install -y --no-install-recommends containerd.io docker-buildx-plugin docker-ce docker-ce-cli docker-compose-plugin
  fi

  systemctl enable --now docker
  systemctl enable --now nginx

  if id "$SERVICE_USER" >/dev/null 2>&1; then
    usermod -aG docker "$SERVICE_USER" || true
  fi
}

ensure_machine_conf() {
  install -m 0750 -d /etc/deploy

  if [ -f "$MACHINE_CONF" ]; then
    echo "INFO: found ${MACHINE_CONF}"
    return 0
  fi

  cat > "$MACHINE_CONF" <<MACHINE
MACHINE_USER="${SERVICE_USER}"
NODE_HEAP_MB=350
MEMORY_HIGH_MB=1200
MEMORY_MAX_MB=1536
CPU_QUOTA_PERCENT=90
BUILD_NICE=15
BUILD_IONICE_CLASS=3
BUILD_HEAP_MB=512
SERVICE_NICE=5
MACHINE
  chmod 600 "$MACHINE_CONF"
}

fetch_staging_branch() {
  mkdir -p "$(dirname "$STAGING_SOURCE_DIR")"

  if [ -d "${STAGING_SOURCE_DIR}/.git" ]; then
    git -C "$STAGING_SOURCE_DIR" fetch origin "$STAGING_BRANCH"
    git -C "$STAGING_SOURCE_DIR" checkout -B "$STAGING_BRANCH" "origin/${STAGING_BRANCH}"
  else
    git clone --branch "$STAGING_BRANCH" --single-branch "$REPO_URL" "$STAGING_SOURCE_DIR"
  fi

  [ -f "${STAGING_SOURCE_DIR}/portfolio/scripts/deploy.sh" ] || abort "deploy.sh missing from ${STAGING_SOURCE_DIR}; wrong branch or repo"
  [ -f "${STAGING_SOURCE_DIR}/portfolio/nginx-cloudflare.conf" ] || abort "nginx template missing from ${STAGING_SOURCE_DIR}; wrong branch or repo"
  [ -f "${STAGING_SOURCE_DIR}/portfolio/Dockerfile" ] || abort "Dockerfile missing from ${STAGING_SOURCE_DIR}; wrong branch or repo"
}

create_dirs() {
  install -m 0750 -d /etc/deploy/sites
  install -m 0750 -d /etc/ssl/cloudflare
  install -m 0755 -d "${STAGING_ROOT}/config" "${STAGING_ROOT}/releases"
  install -m 0755 -d "$STAGING_CACHE_DIR"
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$STAGING_ROOT" 2>/dev/null || true
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$STAGING_CACHE_DIR" 2>/dev/null || true
}

write_staging_site_conf() {
  local prod_ssl_cert prod_ssl_key staging_ssl_cert staging_ssl_key
  prod_ssl_cert="$(read_conf_value "$PROD_SITE_CONF" SSL_CERT || true)"
  prod_ssl_key="$(read_conf_value "$PROD_SITE_CONF" SSL_KEY || true)"
  staging_ssl_cert="${STAGING_SSL_CERT:-${prod_ssl_cert:-/etc/ssl/cloudflare/whoisdhruv.com.pem}}"
  staging_ssl_key="${STAGING_SSL_KEY:-${prod_ssl_key:-/etc/ssl/cloudflare/whoisdhruv.com.key}}"

  [ -f "$staging_ssl_cert" ] || abort "SSL cert not found: ${staging_ssl_cert}. Provide wildcard/staging Cloudflare Origin cert first."
  [ -f "$staging_ssl_key" ] || abort "SSL key not found: ${staging_ssl_key}. Provide wildcard/staging Cloudflare Origin key first."
  chmod 600 "$staging_ssl_key" || true

  if [ -f "$STAGING_SITE_CONF" ]; then
    cp "$STAGING_SITE_CONF" "${STAGING_SITE_CONF}.backup.$(date +%Y%m%d-%H%M%S)"
  fi

  cat > "$STAGING_SITE_CONF" <<CONF
DOMAIN="${STAGING_DOMAIN}"
SERVICE_NAME="${STAGING_SITE}"
NEXTJS_PORT=${STAGING_PORT}

DOCKER_CONTAINER_NAME="${STAGING_SITE}"
DOCKER_CACHE_UID=1000
DOCKER_CACHE_GID=1000

GIT_ROOT="${STAGING_SOURCE_DIR}"
PROJECT_ROOT="${STAGING_SOURCE_DIR}/portfolio"
GIT_BRANCH="${STAGING_BRANCH}"
GIT_REMOTE="origin"

SSL_CERT="${staging_ssl_cert}"
SSL_KEY="${staging_ssl_key}"

NGINX_CONF_TEMPLATE="nginx-cloudflare.conf"
REQUIRED_ENV_VARS=""

BACKUP_RETENTION_DAYS=7
MAX_LOG_FILES=10
CONF
  chmod 600 "$STAGING_SITE_CONF"
}

create_staging_env() {
  if [ ! -f "$STAGING_ENV_FILE" ]; then
    touch "$STAGING_ENV_FILE"
  else
    cp "$STAGING_ENV_FILE" "${STAGING_ENV_FILE}.backup.$(date +%Y%m%d-%H%M%S)"
  fi

  upsert_env NEXT_PUBLIC_SITE_URL "https://${STAGING_DOMAIN}" "$STAGING_ENV_FILE"
  upsert_env SITE_URL "https://${STAGING_DOMAIN}" "$STAGING_ENV_FILE"
  upsert_env LOCAL_TTS_CACHE_DIR "/var/cache/${STAGING_SITE}/pocket-tts" "$STAGING_ENV_FILE"
  ensure_secret ADMIN_UNLOCK_SECRET "$STAGING_ENV_FILE"
  ensure_secret CHAT_HISTORY_SIGNING_SECRET "$STAGING_ENV_FILE"
  ensure_secret IP_HASH_SALT "$STAGING_ENV_FILE"

  if ! grep -qE '^(GROQ_API_KEY|LLM_API_KEY)=' "$STAGING_ENV_FILE" 2>/dev/null; then
    cat >> "$STAGING_ENV_FILE" <<'ENV_NOTES'
# Add staging-only provider keys here if chat/embeddings are required.
# Do not paste or copy production .env.local wholesale into staging.
ENV_NOTES
  fi

  chown "${SERVICE_USER}:${SERVICE_USER}" "$STAGING_ENV_FILE" 2>/dev/null || true
  chmod 600 "$STAGING_ENV_FILE"
}

validate_result() {
  [ -f "$STAGING_SITE_CONF" ] || abort "missing ${STAGING_SITE_CONF}"
  [ -f "$STAGING_ENV_FILE" ] || abort "missing ${STAGING_ENV_FILE}"
  [ -d "$STAGING_SOURCE_DIR" ] || abort "missing ${STAGING_SOURCE_DIR}"
  docker info >/dev/null || abort "Docker daemon is not reachable"
  nginx -t

  echo "READY: ${STAGING_SITE} prepared on ${STAGING_DOMAIN}:${STAGING_PORT}"
  echo "Do not run production deploys. Next step is GitHub Actions deploy from refs/heads/deployed/staging."
}

main() {
  require_root
  check_safety
  install_host_prereqs
  ensure_machine_conf
  fetch_staging_branch
  create_dirs
  write_staging_site_conf
  create_staging_env
  validate_result
}

main "$@"
```

## How To Run The Script

Run these commands on the VM:

```bash
sudo tee /tmp/prepare-portfolio-staging.sh >/dev/null <<'SCRIPT'
# paste the full script body from above here
SCRIPT
sudo chmod +x /tmp/prepare-portfolio-staging.sh
sudo bash /tmp/prepare-portfolio-staging.sh
```

## Pocket TTS Prerequisites

Before the first staging image deployment, create the repository-level `STAGING_HF_TOKEN` Actions secret. Use a least-privilege Hugging Face read token and ensure its account accepts the gated terms at <https://huggingface.co/kyutai/pocket-tts>. Do not put this token in this prompt, the setup script, or a VM env file: the deployment workflow synchronizes the repository secret.

The script creates `/var/cache/portfolio-staging/pocket-tts`; confirm it has service ownership, disk capacity, and outbound network access for the initial download. The `MEMORY_HIGH_MB=1200` and `MEMORY_MAX_MB=1536` values are provisional minima. Prefer at least 2 GB host RAM and validate peak RSS with no swap pressure; a 24 GB fleet may retain `4096` and `6144`. First deploy synthesis can take several minutes. Only after a successful warmup may offline cache use set `HF_HUB_OFFLINE=1` or `LOCAL_TTS_OFFLINE=1`.

The shipped reference at `public/sounds/voice/TTSReference.mp3` is public. The deploy owner must confirm it is their voice or is used with explicit lawful consent, and it must not be used to deceive or impersonate. Pocket TTS software is MIT; model weights are CC BY 4.0 and subject to gated prohibited-use terms. If redistribution is not intended, store the file privately on the VM and set `LOCAL_TTS_REFERENCE_HOST_PATH=/absolute/path/to/reference.mp3` in the persisted staging env before deploy. The host path must be absolute and contain only letters, digits, `_`, `.`, `/`, and `-`, with no whitespace. The deploy script validates the file and mounts it read-only into the container at `/run/secrets/tts-reference`; do not use a host path for `LOCAL_TTS_REFERENCE_PATH`.

If the repository is private or the VM cannot clone over HTTPS, run with an SSH URL that works from the VM:

```bash
sudo REPO_URL="git@github.com:Dhruv-Mishra/portfolioWebsite.git" bash /tmp/prepare-portfolio-staging.sh
```

If the existing Cloudflare origin certificate does not cover `staging.whoisdhruv.com`, place a staging or wildcard cert on the VM first and run:

```bash
sudo STAGING_SSL_CERT="/etc/ssl/cloudflare/staging.whoisdhruv.com.pem" \
     STAGING_SSL_KEY="/etc/ssl/cloudflare/staging.whoisdhruv.com.key" \
     bash /tmp/prepare-portfolio-staging.sh
```

## Required Final Checks

After the script finishes, run:

```bash
sudo systemctl status nginx --no-pager
sudo docker info >/dev/null && echo docker-ok
sudo test -f /etc/deploy/sites/portfolio-staging.conf && echo staging-conf-ok
sudo test -f /opt/portfolio-staging/config/.env.local && echo staging-env-ok
ss -tlnp | grep -E ':(3000|3001|3010)\b' || true
```

Expected:

- Existing production service remains running.
- Existing app on port `3001`, if any, remains untouched.
- Port `3010` may be unused until the GitHub Actions staging deploy runs.
- `/etc/deploy/sites/portfolio-staging.conf` exists.
- `/opt/portfolio-staging/config/.env.local` exists.
- Docker daemon is available.
- `nginx -t` passes.

## Required Agent Response

Return exactly this report format:

```text
VM: <hostname or IP>
STATUS: READY | BLOCKED
PRODUCTION_TOUCHED: no
PORT_3000_STATUS: <listening/not-listening/unknown>
PORT_3001_STATUS: <listening/not-listening/unknown>
PORT_3010_STATUS: <free/listening-by-portfolio-staging/blocked-by-other>
STAGING_CONF: /etc/deploy/sites/portfolio-staging.conf present | missing
STAGING_ENV: /opt/portfolio-staging/config/.env.local present | missing
DOCKER: ok | failed
NGINX_TEST: pass | fail
STAGING_BRANCH_FETCHED: deployed/staging yes | no
NOTES: <short notes only>
```

## What Not To Do

- Do not run the GitHub Actions deployment from the VM.
- Do not deploy `portfolio`.
- Do not stop production.
- Do not change Cloudflare DNS from the VM.
- Do not use port `3001` for staging.
- Do not modify `/etc/deploy/sites/portfolio.conf`.
- Do not copy production `.env.local` wholesale into staging.
