#!/bin/bash
# =============================================================================
# VM Optimization Script — Production Web Server (Oracle Cloud / Ubuntu 24.04)
# =============================================================================
# Target: Oracle Cloud x86 VMs (2 vCPU, 1 GB RAM) running Ubuntu 24.04 LTS
#         Also works on Ubuntu 24.04 LTS Minimal images.
#
# Purpose: Full system preparation for hosting Next.js websites.
#          Run ONCE on a fresh VM before deploying any sites.
#
# What this script does:
#   1. Full system update & upgrade (apt update + dist-upgrade)
#   2. Remove Oracle Cloud bloatware & Ubuntu desktop cruft
#   3. Install essential tools (git, curl, htop, jq, etc.)
#   4. Configure ZRAM + disk swap for memory expansion
#   5. Tune kernel parameters (TCP BBR, memory, security)
#   6. Enable zswap compressed swap cache
#   7. Configure systemd limits & earlyoom
#   8. Install Node.js 22 LTS + nginx
#   9. Harden SSH + install fail2ban
#   10. Write global nginx.conf (multi-site ready via sites-enabled)
#   11. Configure firewall (UFW: SSH + HTTP + HTTPS)
#   12. Set up logrotate
#   13. Create /etc/deploy/ config directory
#   14. Final cleanup & disk reclamation
#
# What this script does NOT do:
#   - Create site-specific systemd services (deploy.sh handles that)
#   - Create site-specific nginx configs  (deploy.sh handles that)
#   - Install application dependencies    (deploy.sh handles that)
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
echo " Target: 2 vCPU / 1 GB RAM"
echo "========================================="
echo ""

# ---------------------------------------------------------------------------
# 1. FULL SYSTEM UPDATE & ESSENTIAL TOOLS
# ---------------------------------------------------------------------------
echo "[1/14] Full system update & installing tools..."

sudo apt-get update -y
sudo apt-get dist-upgrade -y
echo "  ✓ System fully updated"

# Essential hosting & debugging tools
sudo apt-get install -y \
    git curl wget htop iotop-c jq lsof tree tmux \
    ca-certificates gnupg apt-transport-https \
    net-tools dnsutils mtr-tiny tcpdump \
    unzip zip tar gzip bzip2 \
    build-essential \
    software-properties-common \
    logrotate cron \
    bash-completion
echo "  ✓ Tools installed: git, curl, htop, jq, tmux, net-tools, build-essential, etc."

# ---------------------------------------------------------------------------
# 2. REMOVE ORACLE CLOUD BLOATWARE & DISABLE UNNECESSARY SERVICES
# ---------------------------------------------------------------------------
echo "[2/14] Removing Oracle bloatware & unnecessary services..."

# ── Oracle Cloud specific packages ──────────────────────────────────────
# These are pre-installed on Oracle Cloud Ubuntu images and waste RAM/CPU.
# They phone home, collect telemetry, or provide management features
# unnecessary for a self-managed web server.

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
sudo apt-get purge -y oci-utils oci-utils-outest 2>/dev/null || true
sudo apt-get purge -y python3-oci-cli 2>/dev/null || true
echo "  ✓ Oracle oci-utils removed"

# Oracle os-management agent
for svc in osms-agent.service; do
    sudo systemctl stop "$svc" 2>/dev/null || true
    sudo systemctl disable "$svc" 2>/dev/null || true
done
sudo apt-get purge -y osms-agent 2>/dev/null || true
echo "  ✓ Oracle OS Management Agent removed"

# Oracle crash / diagnostics / telemetry
sudo apt-get purge -y oci-utilities oci-compute-utils 2>/dev/null || true
# Remove remaining Oracle/OCI packages, but NEVER touch kernel, linux, grub, or iptables.
# Use dpkg-query to search package NAMES only (not descriptions, which could false-match).
for pkg in $(dpkg-query -W -f '${Package}\n' 2>/dev/null \
    | grep -iE '^oracle|^oci-' \
    | grep -vE 'linux|kernel|grub|iptables|netfilter|modules'); do
    sudo apt-get purge -y "$pkg" 2>/dev/null || true
done
echo "  ✓ Remaining Oracle packages cleaned (kernel preserved)"

# ── Snap — massive memory/CPU hog on low-RAM VMs ────────────────────────
if command -v snap &>/dev/null; then
    # List and remove all snap packages first
    snap list 2>/dev/null | awk 'NR>1{print $1}' | while read -r s; do
        sudo snap remove --purge "$s" 2>/dev/null || true
    done
    sudo systemctl stop snapd.service snapd.socket snapd.seeded.service 2>/dev/null || true
    sudo systemctl disable snapd.service snapd.socket snapd.seeded.service 2>/dev/null || true
    sudo apt-get purge -y snapd 2>/dev/null || true
    sudo rm -rf /snap /var/snap /var/lib/snapd /var/cache/snapd /root/snap
    # Prevent snap from being reinstalled
    cat << 'NOSNAP' | sudo tee /etc/apt/preferences.d/no-snap.pref > /dev/null
Package: snapd
Pin: release a=*
Pin-Priority: -10
NOSNAP
    echo "  ✓ snapd purged & pinned to prevent reinstall"
fi

# ── Unattended upgrades — consumes RAM/CPU unpredictably ────────────────
sudo systemctl stop unattended-upgrades 2>/dev/null || true
sudo systemctl disable unattended-upgrades 2>/dev/null || true
sudo apt-get purge -y unattended-upgrades 2>/dev/null || true
echo "  ✓ unattended-upgrades disabled"

# ── Cloud-init — only needed on first boot ──────────────────────────────
sudo touch /etc/cloud/cloud-init.disabled 2>/dev/null || true
for svc in cloud-init.service cloud-init-local.service cloud-config.service cloud-final.service; do
    sudo systemctl stop "$svc" 2>/dev/null || true
    sudo systemctl disable "$svc" 2>/dev/null || true
done
echo "  ✓ cloud-init disabled"

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

# ── Purge packages only useful on desktop or in Oracle GUI ──────────────
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

# ── APT daily timers — prevent random CPU spikes ───────────────────────
sudo systemctl stop apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true
sudo systemctl disable apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true
echo "  ✓ apt daily timers disabled"

# ── Misc timers ────────────────────────────────────────────────────────
for timer in man-db.timer motd-news.timer e2scrub_all.timer; do
    sudo systemctl stop "$timer" 2>/dev/null || true
    sudo systemctl disable "$timer" 2>/dev/null || true
done
echo "  ✓ Misc timers disabled"

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

# ── systemd-resolved → static DNS (saves ~30 MB RSS) ──────────────────
if systemctl is-active systemd-resolved &>/dev/null; then
    sudo systemctl stop systemd-resolved 2>/dev/null || true
    sudo systemctl disable systemd-resolved 2>/dev/null || true
    # Remove immutable flag if previously set (idempotent re-run)
    sudo chattr -i /etc/resolv.conf 2>/dev/null || true
    sudo rm -f /etc/resolv.conf
    cat << 'RESOLV' | sudo tee /etc/resolv.conf > /dev/null
nameserver 1.1.1.1
nameserver 8.8.8.8
nameserver 1.0.0.1
options edns0 trust-ad timeout:2 attempts:2
RESOLV
    sudo chattr +i /etc/resolv.conf
    echo "  ✓ systemd-resolved → static DNS (~30 MB saved)"
fi

# ── systemd-timesyncd — keep running for accurate TLS/log timestamps ───
# Time drift on a VM breaks Cloudflare TLS, LLM API calls, and fail2ban.
# Do NOT disable.

# ── Disable Ubuntu MOTD spam ──────────────────────────────────────────
sudo chmod -x /etc/update-motd.d/* 2>/dev/null || true
echo "  ✓ MOTD scripts disabled"

# ---------------------------------------------------------------------------
# 3. ZRAM — IN-MEMORY COMPRESSED SWAP
# ---------------------------------------------------------------------------
echo "[3/14] Configuring ZRAM (compressed in-memory swap)..."

HAS_ZRAM=false

if sudo modprobe zram 2>/dev/null; then
    HAS_ZRAM=true
else
    KERN_VER=$(uname -r)
    echo "  zram module not found — installing extra modules for $KERN_VER..."
    sudo apt-get install -y "linux-modules-extra-${KERN_VER}" 2>/dev/null || true
    if sudo modprobe zram 2>/dev/null; then
        HAS_ZRAM=true
    fi
fi

if [ "$HAS_ZRAM" = true ]; then
    sudo apt-get install -y zram-tools 2>/dev/null || true
    sudo swapoff /dev/zram0 2>/dev/null || true
    sudo zramctl --reset /dev/zram0 2>/dev/null || true

    # 768 MB compressed → ~1.5–2.5 GB effective at ~3:1 ratio
    ZRAM_DEV=$(sudo zramctl --find --size 768M --algorithm zstd 2>/dev/null \
        || sudo zramctl --find --size 768M --algorithm lz4 2>/dev/null \
        || echo "")

    if [ -n "$ZRAM_DEV" ]; then
        sudo mkswap "$ZRAM_DEV"
        sudo swapon -p 100 "$ZRAM_DEV"

        cat << 'ZRAM_SERVICE' | sudo tee /etc/systemd/system/zram-swap.service > /dev/null
[Unit]
Description=ZRAM Compressed Swap
After=local-fs.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c 'modprobe zram && ZDEV=$(zramctl --find --size 768M --algorithm zstd 2>/dev/null || zramctl --find --size 768M --algorithm lz4) && mkswap $ZDEV && swapon -p 100 $ZDEV'
ExecStop=/bin/bash -c 'swapoff /dev/zram0 2>/dev/null; zramctl --reset /dev/zram0 2>/dev/null'

[Install]
WantedBy=multi-user.target
ZRAM_SERVICE
        sudo systemctl daemon-reload
        sudo systemctl enable zram-swap.service
        echo "  ✓ ZRAM configured (768 MB, priority 100)"
    else
        HAS_ZRAM=false
        echo "  ⚠ ZRAM device creation failed — disk swap only"
    fi
else
    echo "  ⚠ ZRAM unavailable on kernel $(uname -r) — disk swap only"
fi

# ---------------------------------------------------------------------------
# 4. DISK-BACKED SWAP
# ---------------------------------------------------------------------------
if [ "$HAS_ZRAM" = true ]; then
    SWAP_SIZE="2G"
    SWAP_PRI=10
    echo "[4/14] Creating 2 GB disk swap (fallback behind ZRAM)..."
else
    SWAP_SIZE="4G"
    SWAP_PRI=100
    echo "[4/14] Creating 4 GB disk swap (primary — no ZRAM)..."
fi

if [ -f /swapfile ]; then
    sudo swapoff /swapfile 2>/dev/null || true
    sudo rm -f /swapfile
fi

sudo fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null \
    || sudo dd if=/dev/zero of=/swapfile bs=1M count=$((${SWAP_SIZE%G} * 1024)) status=progress
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon -p "$SWAP_PRI" /swapfile

sudo sed -i '/\/swapfile/d' /etc/fstab
echo "/swapfile none swap sw,pri=${SWAP_PRI} 0 0" | sudo tee -a /etc/fstab > /dev/null
echo "  ✓ ${SWAP_SIZE} disk swap (priority ${SWAP_PRI})"

# ---------------------------------------------------------------------------
# 5. KERNEL TUNING
# ---------------------------------------------------------------------------
echo "[5/14] Applying kernel optimizations..."

cat << 'SYSCTL' | sudo tee /etc/sysctl.d/99-webserver-optimized.conf > /dev/null
# ── Memory Management ──────────────────────────────────────────────────────
vm.swappiness = SWAPPINESS_PLACEHOLDER
vm.vfs_cache_pressure = 200
vm.dirty_ratio = 10
vm.dirty_background_ratio = 5
vm.min_free_kbytes = 32768
vm.compaction_proactiveness = 20
vm.overcommit_memory = 1
vm.watermark_scale_factor = 200
vm.page-cluster = 0
vm.zone_reclaim_mode = 0
kernel.msgmax = 8192
kernel.msgmnb = 16384

# ── Network (TCP BBR, fast open, tuned buffers) ───────────────────────────
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_fastopen = 3
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_keepalive_time = 120
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_syncookies = 1
net.ipv4.ip_local_port_range = 1024 65535
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_orphan_retries = 2
net.ipv4.tcp_mtu_probing = 1

# ── File System ────────────────────────────────────────────────────────────
fs.file-max = 65535
fs.inotify.max_user_watches = 65536

# ── Security Hardening ────────────────────────────────────────────────────
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
kernel.sysrq = 0
kernel.unprivileged_bpf_disabled = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.log_martians = 1
SYSCTL

if [ "$HAS_ZRAM" = true ]; then
    sudo sed -i 's/SWAPPINESS_PLACEHOLDER/150/' /etc/sysctl.d/99-webserver-optimized.conf
else
    sudo sed -i 's/SWAPPINESS_PLACEHOLDER/60/' /etc/sysctl.d/99-webserver-optimized.conf
fi

sudo sysctl --system > /dev/null 2>&1
echo "  ✓ Kernel parameters optimized"

# ---------------------------------------------------------------------------
# 6. ZSWAP (compressed swap cache)
# ---------------------------------------------------------------------------
echo "[6/14] Enabling zswap..."

HAS_ZSWAP=false
if [ -d /sys/module/zswap/parameters ]; then
    HAS_ZSWAP=true
    if [ "$HAS_ZRAM" = true ]; then ZSWAP_POOL=25; else ZSWAP_POOL=35; fi

    echo 1 | sudo tee /sys/module/zswap/parameters/enabled > /dev/null 2>&1 || true
    echo zstd | sudo tee /sys/module/zswap/parameters/compressor > /dev/null 2>&1 || \
    echo lz4  | sudo tee /sys/module/zswap/parameters/compressor > /dev/null 2>&1 || \
    echo lzo  | sudo tee /sys/module/zswap/parameters/compressor > /dev/null 2>&1 || true
    echo "$ZSWAP_POOL" | sudo tee /sys/module/zswap/parameters/max_pool_percent > /dev/null 2>&1 || true
    echo z3fold | sudo tee /sys/module/zswap/parameters/zpool > /dev/null 2>&1 || \
    echo zbud   | sudo tee /sys/module/zswap/parameters/zpool > /dev/null 2>&1 || true

    ZSWAP_COMP=$(cat /sys/module/zswap/parameters/compressor 2>/dev/null | tr -d '[]' || echo "?")
    ZSWAP_POOL_ACTUAL=$(cat /sys/module/zswap/parameters/max_pool_percent 2>/dev/null || echo "$ZSWAP_POOL")
    ZSWAP_ZPOOL=$(cat /sys/module/zswap/parameters/zpool 2>/dev/null | tr -d '[]' || echo "?")

    # Persist via grub
    if [ -d /etc/default/grub.d ]; then
        cat << GRUB_ZSWAP | sudo tee /etc/default/grub.d/99-zswap.cfg > /dev/null
GRUB_CMDLINE_LINUX_DEFAULT="\$GRUB_CMDLINE_LINUX_DEFAULT zswap.enabled=1 zswap.compressor=${ZSWAP_COMP} zswap.max_pool_percent=${ZSWAP_POOL_ACTUAL} zswap.zpool=${ZSWAP_ZPOOL}"
GRUB_ZSWAP
        sudo update-grub 2>/dev/null || true
    fi
    echo "  ✓ zswap enabled (${ZSWAP_COMP}, pool=${ZSWAP_POOL_ACTUAL}%)"
else
    echo "  ⚠ zswap not available — skipped"
fi

# ---------------------------------------------------------------------------
# 7. SYSTEMD & OOM TUNING
# ---------------------------------------------------------------------------
echo "[7/14] Configuring systemd and OOM..."

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

# earlyoom — smarter OOM killer than kernel default
sudo apt-get install -y earlyoom 2>/dev/null || true
if command -v earlyoom &>/dev/null; then
    cat << 'EARLYOOM' | sudo tee /etc/default/earlyoom > /dev/null
EARLYOOM_ARGS="-r 3600 -m 5 -s 5 --prefer '(^|/)(node|next-server)$' --avoid '(^|/)(sshd|nginx)$'"
EARLYOOM
    sudo systemctl enable earlyoom
    sudo systemctl restart earlyoom
    echo "  ✓ earlyoom configured"
fi
echo "  ✓ systemd journal limited to 50 MB"

# ---------------------------------------------------------------------------
# 8. INSTALL NODE.JS 22 LTS + NGINX
# ---------------------------------------------------------------------------
echo "[8/14] Installing Node.js 22 LTS and nginx..."

if ! command -v node &>/dev/null || [[ "$(node --version)" != v22.* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "  ✓ Node.js $(node --version)"

sudo apt-get install -y nginx
sudo systemctl enable nginx
echo "  ✓ nginx installed"

# ---------------------------------------------------------------------------
# 9. SSH HARDENING + FAIL2BAN
# ---------------------------------------------------------------------------
echo "[9/14] Hardening SSH & installing fail2ban..."

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
MaxAuthTries 3
MaxSessions 10
KbdInteractiveAuthentication no
KerberosAuthentication no
GSSAPIAuthentication no
ClientAliveInterval 300
ClientAliveCountMax 2
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
maxretry = 3
backend = systemd

[sshd]
enabled = true
port = ssh
maxretry = 3
bantime = 3600
F2B
    sudo systemctl enable fail2ban
    sudo systemctl restart fail2ban
    echo "  ✓ fail2ban active"
fi

# ---------------------------------------------------------------------------
# 10. GLOBAL NGINX CONFIGURATION
# ---------------------------------------------------------------------------
echo "[10/14] Writing global nginx.conf (multi-site ready)..."

# Remove default site (we use per-site configs via deploy.sh)
sudo rm -f /etc/nginx/sites-enabled/default

cat << 'NGINX_MAIN' | sudo tee /etc/nginx/nginx.conf > /dev/null
user www-data;
worker_processes 2;              # 2 vCPU = 2 workers
worker_rlimit_nofile 8192;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 1024;
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
    open_file_cache max=2000 inactive=60s;
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
    limit_req_zone $rate_limit_key zone=general:4m rate=10r/s;
    limit_req_zone $rate_limit_key zone=api:4m rate=5r/s;
    limit_conn_zone $rate_limit_key zone=connlimit:4m;

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
# 11. FIREWALL
# ---------------------------------------------------------------------------
echo "[11/14] Configuring firewall..."

sudo apt-get install -y ufw 2>/dev/null || true
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
echo "y" | sudo ufw enable
echo "  ✓ UFW active (SSH + HTTP + HTTPS)"

# ---------------------------------------------------------------------------
# 12. LOGROTATE
# ---------------------------------------------------------------------------
echo "[12/14] Configuring log rotation..."

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

# ---------------------------------------------------------------------------
# 13. CREATE /etc/deploy/ STRUCTURE
# ---------------------------------------------------------------------------
echo "[13/14] Creating deployment config directory..."

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
# 14. CLEANUP
# ---------------------------------------------------------------------------
echo "[14/14] Cleaning up..."

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
echo " Platform:     Oracle Cloud x86 / Ubuntu 24.04 LTS"
echo " Hardware:     2 vCPU / 1 GB RAM"
echo ""
echo " Removed bloatware:"
echo "   • Oracle Cloud Agent, oci-utils, osms-agent"
echo "   • snapd (pinned to prevent reinstall)"
echo "   • landscape-client, ubuntu-pro-client, apport, whoopsie"
echo "   • unattended-upgrades, cloud-init, fwupd, multipathd"
echo ""
echo " Memory layout:"
echo "   Physical RAM:  1024 MB"
if [ "$HAS_ZRAM" = true ]; then
    echo "   ZRAM swap:      768 MB (compressed, priority 100)"
    echo "   Disk swap:     2048 MB (fallback, priority 10)"
else
    echo "   ZRAM swap:      N/A"
    echo "   Disk swap:     4096 MB (primary, priority 100)"
fi
if [ "$HAS_ZSWAP" = true ]; then
    echo "   zswap cache:    Compresses pages before disk swap"
fi
echo ""
echo " Services:"
echo "   • nginx    → listening (no sites configured yet)"
echo "   • earlyoom → protects against OOM"
echo "   • fail2ban → SSH brute-force protection"
echo "   • UFW      → ports 22, 80, 443 only"
echo ""
echo " Installed: Node.js $(node --version 2>/dev/null || echo 'N/A'), git, htop, jq, curl, tmux, net-tools"
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
echo "      nano /home/ubuntu/dhruvwebsite/portfolio/.env.local"
echo "    Required: LLM_API_KEY, LLM_BASE_URL, LLM_MODEL"
echo ""
echo " 4. Create the deploy command symlink:"
echo "      sudo ln -sf /path/to/portfolio/scripts/deploy.sh /usr/local/bin/deployWebsite"
echo ""
echo " 5. Run the deployment:"
echo "      sudo deployWebsite"
echo ""
echo " ⚠ REBOOT recommended to apply all kernel/grub changes:"
echo "      sudo reboot"
