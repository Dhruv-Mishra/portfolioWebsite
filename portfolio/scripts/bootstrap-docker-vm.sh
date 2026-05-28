#!/bin/bash
# Bootstrap a fresh Ubuntu VM for image-based portfolio deploys.
# This installs host prerequisites only; secrets, site config, and Cloudflare
# origin certs still belong in /etc/deploy and /etc/ssl/cloudflare.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: run as root: sudo bash scripts/bootstrap-docker-vm.sh"
    exit 1
fi

SITE_NAME="${SITE_NAME:-portfolio}"
SERVICE_NAME="${SERVICE_NAME:-${SITE_NAME}}"
SERVICE_USER="${SERVICE_USER:-ubuntu}"

apt-get update
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    nginx \
    openssl \
    ufw

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
fi

source /etc/os-release
cat > /etc/apt/sources.list.d/docker.list << DOCKER_APT
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable
DOCKER_APT

apt-get update
apt-get install -y --no-install-recommends \
    containerd.io \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin

systemctl enable --now docker
systemctl enable --now nginx

if id "${SERVICE_USER}" >/dev/null 2>&1; then
    usermod -aG docker "${SERVICE_USER}" || true
fi

install -m 0750 -d /etc/deploy/sites
install -m 0750 -d /etc/ssl/cloudflare
install -m 0755 -d "/opt/${SERVICE_NAME}/config" "/opt/${SERVICE_NAME}/releases"
install -m 0755 -d "/var/cache/${SERVICE_NAME}/kitten-tts"

if [[ -f "${SCRIPT_DIR}/machine.conf.example" && ! -f /etc/deploy/machine.conf ]]; then
    install -m 0600 "${SCRIPT_DIR}/machine.conf.example" /etc/deploy/machine.conf
fi

if [[ -f "${SCRIPT_DIR}/portfolio.conf.example" && ! -f "/etc/deploy/sites/${SITE_NAME}.conf" ]]; then
    install -m 0600 "${SCRIPT_DIR}/portfolio.conf.example" "/etc/deploy/sites/${SITE_NAME}.conf"
fi

cat << EOF

Docker VM bootstrap complete.

Next required machine-specific files:
  /etc/deploy/machine.conf
  /etc/deploy/sites/${SITE_NAME}.conf
    /opt/${SERVICE_NAME}/config/.env.local
  /etc/ssl/cloudflare/whoisdhruv.com.pem
  /etc/ssl/cloudflare/whoisdhruv.com.key

For private GHCR packages, log the VM into ghcr.io or configure the
GHCR_READ_TOKEN GitHub Actions secret so deploy.yml can do it during deploy.
EOF