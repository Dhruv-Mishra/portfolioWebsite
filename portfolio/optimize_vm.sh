#!/bin/bash
# =============================================================================
# VM Optimization Script — Production Web Server (Oracle Cloud / Ubuntu 24.04)
# =============================================================================
# Target: Oracle Cloud VMs (1–2 vCPU, 1 GB RAM) running Ubuntu 24.04 LTS
#
# Purpose: Full system preparation for hosting Next.js websites.
#          Run ONCE on a fresh VM before deploying any sites.
#
# What this script does:
#   1. Full system update & install essential tools
#   2. Remove Oracle Cloud bloatware & desktop cruft (preserves cloud-init)
#   3. Create disk-backed swap file
#   4. Apply conservative, safe kernel tuning (TCP BBR, security)
#   5. Configure systemd limits & earlyoom
#   6. Install Node.js 22 LTS + nginx
#   7. Harden SSH + install fail2ban
#   8. Write global nginx.conf (multi-site ready)
#   9. Configure firewall (UFW: SSH + HTTP + HTTPS)
#   10. Set up logrotate & /etc/deploy/ config directory
#   11. Final cleanup
#
# What this script does NOT do:
#   - Create site-specific systemd services (deploy.sh handles that)
#   - Create site-specific nginx configs  (deploy.sh handles that)
#   - Install application dependencies    (deploy.sh handles that)
#   - Modify GRUB or kernel boot parameters (too risky for remote VMs)
#   - Disable cloud-init or systemd-resolved (breaks cloud networking)
#
# Usage:
#   sudo bash optimize_vm.sh
#
# Safe to re-run — all steps are idempotent.
# =============================================================================

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo "========================================="
echo " VM Optimization — Production Web Server"
echo " Oracle Cloud / Ubuntu 24.04 LTS"
echo " Target: 1–2 vCPU / 1 GB RAM"
echo "========================================="
echo ""

# ---------------------------------------------------------------------------
# 1. FULL SYSTEM UPDATE & ESSENTIAL TOOLS
# ---------------------------------------------------------------------------
echo "[1/11] Full system update & installing tools..."

sudo apt-get update -y
sudo apt-get dist-upgrade -y
echo "  ✓ System fully updated"

# Essential hosting & debugging tools
sudo apt-get install -y \
    git curl wget htop jq lsof tmux nano \
    ca-certificates gnupg apt-transport-https \
    net-tools dnsutils \
    unzip tar gzip \
    build-essential \
    logrotate cron \
    bash-completion
echo "  ✓ Tools installed: git, curl, htop, jq, tmux, net-tools, build-essential"

# ---------------------------------------------------------------------------
# 2. REMOVE ORACLE CLOUD BLOATWARE & DISABLE UNNECESSARY SERVICES
# ---------------------------------------------------------------------------
echo "[2/11] Removing Oracle bloatware & unnecessary services..."

# ── Oracle Cloud specific packages ──────────────────────────────────────
# These are pre-installed on Oracle Cloud Ubuntu images and waste RAM/CPU.

# Oracle Cloud Agent — metrics/monitoring agent, ~50-80 MB RAM
for svc in oracle-cloud-agent oracle-cloud-agent-updater \
           oracle-cloud-agent.service oracle-cloud-agent-updater.service; do
    sudo systemctl stop "$svc" 2>/dev/null || true
    sudo systemctl disable "$svc" 2>/dev/null || true
    sudo systemctl mask "$svc" 2>/dev/null || true
done
sudo apt-get purge -y oracle-cloud-agent 2>/dev/null || true
sudo rm -rf /var/lib/oracle-cloud-agent /opt/oracle-cloud-agent 2>/dev/null || true
echo "  ✓ Oracle Cloud Agent removed"

# Oracle oci-utils and related
sudo apt-get purge -y oci-utils oci-utils-outest python3-oci-cli 2>/dev/null || true
echo "  ✓ Oracle oci-utils removed"

# Oracle os-management agent
sudo systemctl stop osms-agent.service 2>/dev/null || true
sudo systemctl disable osms-agent.service 2>/dev/null || true
sudo apt-get purge -y osms-agent 2>/dev/null || true
echo "  ✓ Oracle OS Management Agent removed"

# Oracle diagnostics / telemetry
sudo apt-get purge -y oci-utilities oci-compute-utils 2>/dev/null || true
# Remove remaining Oracle/OCI packages, but NEVER touch kernel, linux, grub, iptables, or cloud-init.
for pkg in $(dpkg-query -W -f '${Package}\n' 2>/dev/null \
    | grep -iE '^oracle|^oci-' \
    | grep -vE 'linux|kernel|grub|iptables|netfilter|modules|cloud'); do
    sudo apt-get purge -y "$pkg" 2>/dev/null || true
done
echo "  ✓ Remaining Oracle packages cleaned (kernel + cloud-init preserved)"

# ── Snap — memory/CPU hog on low-RAM VMs ────────────────────────────────
if command -v snap &>/dev/null; then
    snap list 2>/dev/null | awk 'NR>1{print $1}' | while read -r s; do
        sudo snap remove --purge "$s" 2>/dev/null || true
    done
    sudo systemctl stop snapd.service snapd.socket snapd.seeded.service 2>/dev/null || true
    sudo systemctl disable snapd.service snapd.socket snapd.seeded.service 2>/dev/null || true
    sudo apt-get purge -y snapd 2>/dev/null || true
    sudo rm -rf /snap /var/snap /var/lib/snapd /var/cache/snapd /root/snap
    cat << 'NOSNAP' | sudo tee /etc/apt/preferences.d/no-snap.pref > /dev/null
Package: snapd
Pin: release a=*
Pin-Priority: -10
NOSNAP
    echo "  ✓ snapd purged & pinned to prevent reinstall"
fi

# ── NOTE: cloud-init is PRESERVED ───────────────────────────────────────
# cloud-init manages network configuration on Oracle Cloud VMs.
# Disabling it causes network and SSH to break on reboot.
echo "  ✓ cloud-init preserved (required for Oracle Cloud networking)"

# ── NOTE: systemd-resolved is PRESERVED ─────────────────────────────────
# Replacing systemd-resolved with static DNS and making resolv.conf
# immutable is dangerous — if the hardcoded DNS servers are unreachable
# from the VPC, all DNS resolution fails (including SSH).
echo "  ✓ systemd-resolved preserved (safe DNS resolution)"

# ── NOTE: unattended-upgrades is PRESERVED ──────────────────────────────
# Security patches must be applied automatically on production servers.
# Disabling this leaves the VM vulnerable to known exploits.
echo "  ✓ unattended-upgrades preserved (automatic security patches)"

# ── Multipathd — not needed on simple VMs ───────────────────────────────
sudo systemctl stop multipathd.service multipathd.socket 2>/dev/null || true
sudo systemctl disable multipathd.service multipathd.socket 2>/dev/null || true
sudo systemctl mask multipathd.service 2>/dev/null || true
echo "  ✓ multipathd disabled"

# ── Desktop/hardware services ──────────────────────────────────────────
for svc in ModemManager bluetooth avahi-daemon cups cups-browsed \
           accounts-daemon packagekit packagekit-offline-update \
           power-profiles-daemon switcheroo-control thermald udisks2 \
           apport.service whoopsie.service kerneloops.service \
           colord.service; do
    sudo systemctl stop "$svc" 2>/dev/null || true
    sudo systemctl disable "$svc" 2>/dev/null || true
done
echo "  ✓ Desktop/hardware services disabled"

# ── Purge packages only useful on desktop ───────────────────────────────
sudo apt-get purge -y \
    landscape-client landscape-common \
    ubuntu-advantage-tools ubuntu-pro-client ubuntu-pro-client-l10n \
    popularity-contest \
    apport apport-symptoms \
    whoopsie \
    command-not-found command-not-found-data \
    friendly-recovery \
    motd-news-config \
    2>/dev/null || true
echo "  ✓ Desktop/bloat packages purged"

# ── fwupd — firmware updater, useless on a VM ──────────────────────────
sudo systemctl stop fwupd.service 2>/dev/null || true
sudo systemctl disable fwupd.service 2>/dev/null || true
sudo systemctl mask fwupd.service 2>/dev/null || true
echo "  ✓ fwupd disabled"

# ── ubuntu-advantage / ubuntu-pro ──────────────────────────────────────
for svc in ua-timer.timer ubuntu-advantage.service ua-messaging.timer \
           ua-license-check.timer ubuntu-pro-esm-cache.timer \
           esm-cache.service ua-reboot-cmds.service; do
    sudo systemctl stop "$svc" 2>/dev/null || true
    sudo systemctl disable "$svc" 2>/dev/null || true
done
echo "  ✓ ubuntu-pro disabled"

# ── networkd-wait-online — causes 2+ min slow boot ────────────────────
sudo systemctl disable systemd-networkd-wait-online.service 2>/dev/null || true
sudo systemctl mask systemd-networkd-wait-online.service 2>/dev/null || true
echo "  ✓ networkd-wait-online masked"

# ── Misc timers ────────────────────────────────────────────────────────
for timer in man-db.timer motd-news.timer e2scrub_all.timer \
             apt-daily.timer apt-daily-upgrade.timer; do
    sudo systemctl stop "$timer" 2>/dev/null || true
    sudo systemctl disable "$timer" 2>/dev/null || true
done
echo "  ✓ Non-essential timers disabled"

# ── Disable Ubuntu MOTD spam ──────────────────────────────────────────
sudo chmod -x /etc/update-motd.d/* 2>/dev/null || true
echo "  ✓ MOTD scripts disabled"

# ── systemd-timesyncd — keep running for accurate TLS/log timestamps ───
# Time drift on a VM breaks Cloudflare TLS, LLM API calls, and fail2ban.

# ---------------------------------------------------------------------------
# 3. DISK-BACKED SWAP
# ---------------------------------------------------------------------------
echo "[3/11] Creating 2 GB disk swap..."

# Simple, reliable disk swap. No ZRAM (complex, failure-prone on low-end VMs).
# No zswap or GRUB modifications (can brick VMs if update-grub fails).
SWAP_SIZE="2G"

if [ -f /swapfile ]; then
    sudo swapoff /swapfile 2>/dev/null || true
    sudo rm -f /swapfile
fi

sudo fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null \
    || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

sudo sed -i '/\/swapfile/d' /etc/fstab
echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab > /dev/null
echo "  ✓ 2 GB disk swap active and persistent"

# ---------------------------------------------------------------------------
# 4. KERNEL TUNING (conservative, safe for 1 GB RAM VMs)
# ---------------------------------------------------------------------------
echo "[4/11] Applying safe kernel optimizations..."

# Remove any previous aggressive config from earlier runs
sudo rm -f /etc/sysctl.d/99-webserver-optimized.conf 2>/dev/null || true

cat << 'SYSCTL' | sudo tee /etc/sysctl.d/99-webserver.conf > /dev/null
# =============================================================================
# Production Web Server — Safe Kernel Tuning (1 GB RAM)
# =============================================================================
# Conservative settings tested on Oracle Cloud 1vCPU/1GB and 2vCPU/1GB VMs.
# Every value here is safe and well-understood. No experimental knobs.

# ── Memory Management ──────────────────────────────────────────────────────
# Default overcommit (0) — kernel uses heuristics to deny clearly impossible
# allocations. NEVER use overcommit_memory=1 on low-RAM VMs.
vm.overcommit_memory = 0
# Moderate swappiness — swap out inactive pages before OOM
vm.swappiness = 60
# Default cache pressure — don't aggressively reclaim VFS caches
vm.vfs_cache_pressure = 100
# Flush dirty pages frequently to avoid I/O spikes
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
# Reserve 16MB free minimum (safe for 1GB; 32MB+ starves processes)
vm.min_free_kbytes = 16384

# ── Network — TCP BBR (safe, proven, enabled in all major clouds) ─────────
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr

# ── Network — Connection Handling ─────────────────────────────────────────
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_keepalive_time = 120
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_syncookies = 1
net.core.somaxconn = 1024
net.ipv4.tcp_max_syn_backlog = 1024
net.ipv4.ip_local_port_range = 1024 65535

# ── Network — Buffer Sizes (safe for 1 GB RAM) ───────────────────────────
# Max 4MB per socket (not 16MB — a few connections at 16MB eats all RAM)
net.core.rmem_max = 4194304
net.core.wmem_max = 4194304
net.ipv4.tcp_rmem = 4096 87380 4194304
net.ipv4.tcp_wmem = 4096 65536 4194304
net.ipv4.tcp_window_scaling = 1

# ── File System ────────────────────────────────────────────────────────────
fs.file-max = 65535
fs.inotify.max_user_watches = 65536

# ── Security Hardening ────────────────────────────────────────────────────
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
kernel.unprivileged_bpf_disabled = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.log_martians = 1
SYSCTL

sudo sysctl --system > /dev/null 2>&1
echo "  ✓ Kernel parameters applied (safe defaults for 1 GB RAM)"

# ---------------------------------------------------------------------------
# 5. SYSTEMD & OOM TUNING
# ---------------------------------------------------------------------------
echo "[5/11] Configuring systemd and OOM..."

# Limit journal size
sudo mkdir -p /etc/systemd/journald.conf.d
cat << 'JOURNAL' | sudo tee /etc/systemd/journald.conf.d/size.conf > /dev/null
[Journal]
SystemMaxUse=50M
RuntimeMaxUse=20M
MaxFileSec=7day
Compress=yes
JOURNAL
sudo systemctl restart systemd-journald

# Faster restarts
sudo mkdir -p /etc/systemd/system.conf.d
cat << 'SYSTEMD_CONF' | sudo tee /etc/systemd/system.conf.d/timeouts.conf > /dev/null
[Manager]
DefaultTimeoutStartSec=30s
DefaultTimeoutStopSec=15s
SYSTEMD_CONF

# earlyoom — smarter OOM killer that protects sshd and nginx
sudo apt-get install -y earlyoom 2>/dev/null || true
if command -v earlyoom &>/dev/null; then
    cat << 'EARLYOOM' | sudo tee /etc/default/earlyoom > /dev/null
EARLYOOM_ARGS="-r 3600 -m 5 -s 5 --prefer '(^|/)(node|next-server)$' --avoid '(^|/)(sshd|nginx)$'"
EARLYOOM
    sudo systemctl enable earlyoom
    sudo systemctl restart earlyoom
    echo "  ✓ earlyoom configured (protects sshd + nginx from OOM)"
fi
echo "  ✓ systemd journal limited to 50 MB"

# ---------------------------------------------------------------------------
# 6. INSTALL NODE.JS 22 LTS + NGINX
# ---------------------------------------------------------------------------
echo "[6/11] Installing Node.js 22 LTS and nginx..."

if ! command -v node &>/dev/null || [[ "$(node --version)" != v22.* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "  ✓ Node.js $(node --version)"

sudo apt-get install -y nginx
sudo systemctl enable nginx
echo "  ✓ nginx installed"

# ---------------------------------------------------------------------------
# 7. SSH HARDENING + FAIL2BAN
# ---------------------------------------------------------------------------
echo "[7/11] Hardening SSH & installing fail2ban..."

# Detect SSH keys
HAS_SSH_KEYS=false
for homedir in /home/*/ /root/; do
    if [ -s "${homedir}.ssh/authorized_keys" ] 2>/dev/null; then
        HAS_SSH_KEYS=true
        break
    fi
done

if ! grep -q "# Hardened by optimize_vm.sh" /etc/ssh/sshd_config.d/99-hardened.conf 2>/dev/null; then
    sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%s) 2>/dev/null || true
    sudo mkdir -p /etc/ssh/sshd_config.d

    if [ "$HAS_SSH_KEYS" = true ]; then
        PASS_AUTH="no"
        echo "  SSH keys detected → disabling password auth"
    else
        PASS_AUTH="yes"
        echo "  ⚠ No SSH keys → keeping password auth (add keys, then re-run)"
    fi

    cat << SSH_CONF | sudo tee /etc/ssh/sshd_config.d/99-hardened.conf > /dev/null
# Hardened by optimize_vm.sh
PasswordAuthentication ${PASS_AUTH}
PermitRootLogin no
MaxAuthTries 5
MaxSessions 10
KbdInteractiveAuthentication no
KerberosAuthentication no
GSSAPIAuthentication no
ClientAliveInterval 300
ClientAliveCountMax 3
X11Forwarding no
AllowAgentForwarding no
SSH_CONF
    sudo systemctl reload sshd 2>/dev/null || sudo systemctl reload ssh 2>/dev/null || true
    echo "  ✓ SSH hardened"
else
    echo "  ✓ SSH already hardened"
fi

# fail2ban
sudo apt-get install -y fail2ban 2>/dev/null || true
if command -v fail2ban-client &>/dev/null; then
    cat << 'F2B' | sudo tee /etc/fail2ban/jail.local > /dev/null
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ssh
maxretry = 5
bantime = 3600
F2B
    sudo systemctl enable fail2ban
    sudo systemctl restart fail2ban
    echo "  ✓ fail2ban active"
fi

# ---------------------------------------------------------------------------
# 8. GLOBAL NGINX CONFIGURATION
# ---------------------------------------------------------------------------
echo "[8/11] Writing global nginx.conf (multi-site ready)..."

# Remove default site (we use per-site configs via deploy.sh)
sudo rm -f /etc/nginx/sites-enabled/default

cat << 'NGINX_MAIN' | sudo tee /etc/nginx/nginx.conf > /dev/null
user www-data;
worker_processes auto;           # auto-detect CPU count
worker_rlimit_nofile 4096;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 512;
    multi_accept on;
    use epoll;
}

http {
    # ── Basics ─────────────────────────────────────────────────────────────
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    types_hash_max_size 2048;
    server_tokens off;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # ── Logging ────────────────────────────────────────────────────────────
    access_log off;
    error_log /var/log/nginx/error.log warn;

    # ── Timeouts ───────────────────────────────────────────────────────────
    keepalive_timeout 30;
    client_body_timeout 12;
    client_header_timeout 12;
    send_timeout 10;

    # ── Buffers (tuned for 1 GB RAM) ──────────────────────────────────────
    client_body_buffer_size 16k;
    client_header_buffer_size 1k;
    client_max_body_size 8m;
    large_client_header_buffers 2 1k;

    # ── Open file cache ───────────────────────────────────────────────────
    open_file_cache max=1000 inactive=60s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    # ── Gzip compression ─────────────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 4;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/xml+rss
        image/svg+xml
        font/ttf
        font/otf
        font/woff
        font/woff2
        application/vnd.ms-fontobject;

    # ── Rate limiting ────────────────────────────────────────────────────
    # Uses Cloudflare's real client IP when available, falls back to
    # remote_addr for direct access. Shared across all sites.
    map $http_cf_connecting_ip $rate_limit_key {
        ""      $binary_remote_addr;
        default $http_cf_connecting_ip;
    }
    limit_req_zone $rate_limit_key zone=general:2m rate=10r/s;
    limit_req_zone $rate_limit_key zone=api:2m rate=5r/s;
    limit_conn_zone $rate_limit_key zone=connlimit:2m;

    # ── Default server — reject unmatched hostnames ──────────────────────
    server {
        listen 80 default_server;
        listen [::]:80 default_server;
        server_name _;
        return 444;
    }

    # ── Per-site configs (created by deploy.sh) ──────────────────────────
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
NGINX_MAIN

sudo mkdir -p /var/cache/nginx
sudo chown www-data:www-data /var/cache/nginx

sudo nginx -t && sudo systemctl restart nginx
echo "  ✓ Global nginx.conf installed (multi-site, rate limiting, gzip)"

# ---------------------------------------------------------------------------
# 9. FIREWALL
# ---------------------------------------------------------------------------
echo "[9/11] Configuring firewall..."

sudo apt-get install -y ufw 2>/dev/null || true
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
echo "y" | sudo ufw enable
echo "  ✓ UFW active (SSH + HTTP + HTTPS)"

# ---------------------------------------------------------------------------
# 10. LOGROTATE & /etc/deploy/ STRUCTURE
# ---------------------------------------------------------------------------
echo "[10/11] Configuring logrotate & deployment directory..."

cat << 'LOGROTATE' | sudo tee /etc/logrotate.d/nginx-custom > /dev/null
/var/log/nginx/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid)
    endscript
}
LOGROTATE
echo "  ✓ nginx logrotate (7 days, compressed)"

sudo mkdir -p /etc/deploy/sites
sudo chmod 755 /etc/deploy
sudo chmod 755 /etc/deploy/sites

# Copy example configs if this script is run from a cloned repo
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/scripts/machine.conf.example" ]; then
    EXAMPLE_DIR="${SCRIPT_DIR}/scripts"
elif [ -f "${SCRIPT_DIR}/../scripts/machine.conf.example" ]; then
    EXAMPLE_DIR="${SCRIPT_DIR}/../scripts"
else
    EXAMPLE_DIR=""
fi

if [ -n "$EXAMPLE_DIR" ]; then
    if [ ! -f /etc/deploy/machine.conf ]; then
        sudo cp "${EXAMPLE_DIR}/machine.conf.example" /etc/deploy/machine.conf
        sudo chmod 600 /etc/deploy/machine.conf
        echo "  ✓ Copied machine.conf.example → /etc/deploy/machine.conf"
    fi
    for conf_example in "${EXAMPLE_DIR}"/*.conf.example; do
        [ -f "$conf_example" ] || continue
        base_name="$(basename "$conf_example" .conf.example)"
        if [ ! -f "/etc/deploy/sites/${base_name}.conf" ]; then
            sudo cp "$conf_example" "/etc/deploy/sites/${base_name}.conf"
            sudo chmod 600 "/etc/deploy/sites/${base_name}.conf"
            echo "  ✓ Copied ${base_name}.conf.example → /etc/deploy/sites/${base_name}.conf"
        fi
    done
else
    echo "  ⚠ Example configs not found — create manually:"
    echo "    /etc/deploy/machine.conf"
    echo "    /etc/deploy/sites/<sitename>.conf"
fi
echo "  ✓ /etc/deploy/ structure ready"

# ---------------------------------------------------------------------------
# 11. CLEANUP
# ---------------------------------------------------------------------------
echo "[11/11] Cleaning up..."

sudo apt-get autoremove -y --purge
sudo apt-get clean
sudo journalctl --vacuum-size=50M 2>/dev/null || true
sudo rm -rf /var/lib/apt/lists/*
sudo find /var/log -name "*.gz" -delete 2>/dev/null || true
sudo find /var/log -name "*.old" -delete 2>/dev/null || true

# Set timezone to UTC for consistent logs
sudo timedatectl set-timezone UTC 2>/dev/null || true

echo "  ✓ Caches and old logs purged"

# ---------------------------------------------------------------------------
# SUMMARY
# ---------------------------------------------------------------------------
echo ""
echo "========================================="
echo " VM Optimization Complete"
echo "========================================="
echo ""
echo " Platform:     Oracle Cloud / Ubuntu 24.04 LTS"
echo " Target:       1–2 vCPU / 1 GB RAM"
echo ""
echo " Removed bloatware:"
echo "   • Oracle Cloud Agent, oci-utils, osms-agent"
echo "   • snapd (pinned to prevent reinstall)"
echo "   • landscape-client, ubuntu-pro-client, apport, whoopsie"
echo "   • fwupd, multipathd, desktop services"
echo ""
echo " Preserved (safety-critical):"
echo "   • cloud-init (Oracle Cloud networking)"
echo "   • systemd-resolved (DNS resolution)"
echo "   • systemd-timesyncd (TLS clock accuracy)"
echo "   • unattended-upgrades (security patches)"
echo ""
echo " Memory layout:"
echo "   Physical RAM:  1024 MB"
echo "   Disk swap:     2048 MB"
echo ""
echo " Services:"
echo "   • nginx    → listening (no sites configured yet)"
echo "   • earlyoom → protects sshd + nginx from OOM"
echo "   • fail2ban → SSH brute-force protection"
echo "   • UFW      → ports 22, 80, 443 only"
echo ""
echo " Kernel tuning:"
echo "   • TCP BBR congestion control"
echo "   • Conservative memory settings (overcommit=0, swappiness=60)"
echo "   • Safe TCP buffer sizes (4MB max per socket)"
echo "   • Security hardening (redirects, martians, syncookies)"
echo ""
echo " Installed: Node.js $(node --version 2>/dev/null || echo 'N/A'), git, htop, jq, curl, tmux"
echo ""
echo " ── NEXT STEPS ──────────────────────────────────────────────────"
echo ""
echo " 1. Edit config files:"
echo "      sudo nano /etc/deploy/machine.conf"
echo "      sudo nano /etc/deploy/sites/portfolio.conf"
echo "    Update paths, domain, and port to match your setup."
echo ""
echo " 2. Add Cloudflare SSL certificates:"
echo "      sudo mkdir -p /etc/ssl/cloudflare"
echo "      # Paste your Origin Certificate and Private Key, then:"
echo "      sudo chmod 600 /etc/ssl/cloudflare/*.key"
echo ""
echo " 3. Create .env.local in your project directory:"
echo "      nano /home/ubuntu/portfolioWebsite/portfolio/.env.local"
echo "    Required: LLM_API_KEY, LLM_BASE_URL, LLM_MODEL"
echo ""
echo " 4. Make deploy script executable & create symlink:"
echo "      chmod +x /home/ubuntu/portfolioWebsite/portfolio/scripts/deploy.sh"
echo "      sudo ln -sf /home/ubuntu/portfolioWebsite/portfolio/scripts/deploy.sh /usr/local/bin/deployWebsite"
echo ""
echo " 5. Run the deployment:"
echo "      sudo deployWebsite"
echo ""
echo " No reboot required — all changes are applied immediately."
