#!/bin/bash
set -euo pipefail

# =============================================================================
# Oracle E2 Micro (1 vCPU / 1 GB RAM / 50 GB Disk) — Ubuntu 24.04 Minimal
# Full server optimization + Next.js deployment setup
# =============================================================================
# Safe to re-run — all steps are idempotent
# =============================================================================

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo "========================================="
echo " VM Optimization & Next.js Server Setup"
echo "========================================="

# ---------------------------------------------------------------------------
# 0. SYSTEM UPDATE & ESSENTIAL PACKAGES
# ---------------------------------------------------------------------------
echo "[0/14] Updating package lists & installing essentials..."

sudo apt update -y
sudo apt install -y git curl wget htop iotop-c jq lsof \
    ca-certificates gnupg apt-transport-https
echo "  ✓ System updated, git and essentials installed"

# ---------------------------------------------------------------------------
# 1. DISABLE UNNECESSARY SERVICES
# ---------------------------------------------------------------------------
echo "[1/14] Disabling unnecessary services..."

# Snap is a massive memory/CPU hog — remove entirely
if command -v snap &>/dev/null; then
    sudo systemctl stop snapd.service snapd.socket snapd.seeded.service 2>/dev/null || true
    sudo systemctl disable snapd.service snapd.socket snapd.seeded.service 2>/dev/null || true
    sudo apt purge -y snapd 2>/dev/null || true
    sudo rm -rf /snap /var/snap /var/lib/snapd /var/cache/snapd
    echo "  ✓ snapd removed"
fi

# Disable unattended-upgrades (runs randomly, eats RAM/CPU)
sudo systemctl stop unattended-upgrades 2>/dev/null || true
sudo systemctl disable unattended-upgrades 2>/dev/null || true
sudo apt purge -y unattended-upgrades 2>/dev/null || true
echo "  ✓ unattended-upgrades disabled"

# Disable cloud-init (only needed on first boot)
sudo touch /etc/cloud/cloud-init.disabled
sudo systemctl stop cloud-init.service cloud-init-local.service cloud-config.service cloud-final.service 2>/dev/null || true
sudo systemctl disable cloud-init.service cloud-init-local.service cloud-config.service cloud-final.service 2>/dev/null || true
echo "  ✓ cloud-init disabled"

# Disable multipathd (not needed on a simple VM)
sudo systemctl stop multipathd.service multipathd.socket 2>/dev/null || true
sudo systemctl disable multipathd.service multipathd.socket 2>/dev/null || true
sudo systemctl mask multipathd.service 2>/dev/null || true
echo "  ✓ multipathd disabled"

# Disable services not required on a headless web server
for svc in ModemManager bluetooth avahi-daemon cups cups-browsed \
           accounts-daemon packagekit packagekit-offline-update \
           power-profiles-daemon switcheroo-control thermald udisks2 \
           apport.service whoopsie.service kerneloops.service; do
    sudo systemctl stop "$svc" 2>/dev/null || true
    sudo systemctl disable "$svc" 2>/dev/null || true
done
echo "  ✓ Unnecessary desktop/hardware services disabled"

# Disable apt daily timers (prevents random CPU spikes)
sudo systemctl stop apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true
sudo systemctl disable apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true
echo "  ✓ apt daily timers disabled"

# Disable man-db auto-update & motd-news
sudo systemctl stop man-db.timer 2>/dev/null || true
sudo systemctl disable man-db.timer 2>/dev/null || true
for timer in motd-news.timer e2scrub_all.timer; do
    sudo systemctl stop "$timer" 2>/dev/null || true
    sudo systemctl disable "$timer" 2>/dev/null || true
done
echo "  ✓ man-db/motd-news timers disabled"

# Disable fwupd (firmware updater — useless on a VM)
sudo systemctl stop fwupd.service 2>/dev/null || true
sudo systemctl disable fwupd.service 2>/dev/null || true
sudo systemctl mask fwupd.service 2>/dev/null || true
echo "  ✓ fwupd disabled"

# Disable ubuntu-advantage / ubuntu-pro
sudo systemctl stop ua-timer.timer ubuntu-advantage.service 2>/dev/null || true
sudo systemctl disable ua-timer.timer ubuntu-advantage.service 2>/dev/null || true
for svc in ua-messaging.timer ua-license-check.timer ubuntu-pro-esm-cache.timer; do
    sudo systemctl stop "$svc" 2>/dev/null || true
    sudo systemctl disable "$svc" 2>/dev/null || true
done
echo "  ✓ ubuntu-advantage / ubuntu-pro disabled"

# networkd-wait-online causes 2+ min slow boot — mask it
sudo systemctl disable systemd-networkd-wait-online.service 2>/dev/null || true
sudo systemctl mask systemd-networkd-wait-online.service 2>/dev/null || true
echo "  ✓ systemd-networkd-wait-online masked (faster boot)"

# Replace systemd-resolved with static DNS (saves ~30 MB RSS)
if systemctl is-active systemd-resolved &>/dev/null; then
    sudo systemctl stop systemd-resolved 2>/dev/null || true
    sudo systemctl disable systemd-resolved 2>/dev/null || true
    sudo rm -f /etc/resolv.conf
    # Cloudflare DNS (fastest) + Google DNS fallback
    cat << 'RESOLV' | sudo tee /etc/resolv.conf > /dev/null
nameserver 1.1.1.1
nameserver 8.8.8.8
nameserver 1.0.0.1
options edns0 trust-ad timeout:2 attempts:2
RESOLV
    sudo chattr +i /etc/resolv.conf  # Prevent overwriting
    echo "  ✓ systemd-resolved replaced with static DNS (~30 MB RAM saved)"
fi

# Disable systemd-timesyncd (low value on a VM, saves a few MB)
sudo systemctl stop systemd-timesyncd 2>/dev/null || true

# ---------------------------------------------------------------------------
# 2. ZRAM — IN-MEMORY COMPRESSED SWAP (primary swap)
# ---------------------------------------------------------------------------
echo "[2/14] Configuring ZRAM (compressed in-memory swap)..."

HAS_ZRAM=false

# Oracle kernels often lack zram — try to load the module
if sudo modprobe zram 2>/dev/null; then
    HAS_ZRAM=true
else
    # Try installing extra kernel modules that may include zram
    KERN_VER=$(uname -r)
    echo "  zram module not found in kernel $KERN_VER — attempting to install extra modules..."
    sudo apt install -y "linux-modules-extra-${KERN_VER}" 2>/dev/null || true
    if sudo modprobe zram 2>/dev/null; then
        HAS_ZRAM=true
    fi
fi

if [ "$HAS_ZRAM" = true ]; then
    sudo apt install -y zram-tools 2>/dev/null || true

    # Remove existing zram devices
    sudo swapoff /dev/zram0 2>/dev/null || true
    sudo zramctl --reset /dev/zram0 2>/dev/null || true

    # Create zram device — 768 MB compressed (expands to ~1.5-2.5 GB effective)
    # On 1 GB RAM: large enough to hold swapped-out Node.js heap pages,
    # small enough not to starve the page cache. zstd gives ~3:1 ratio.
    ZRAM_DEV=$(sudo zramctl --find --size 768M --algorithm zstd 2>/dev/null || sudo zramctl --find --size 768M --algorithm lz4 2>/dev/null || echo "")

    if [ -n "$ZRAM_DEV" ]; then
        sudo mkswap "$ZRAM_DEV"
        sudo swapon -p 100 "$ZRAM_DEV"  # Priority 100 (higher = preferred)

        # Persist zram across reboots
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
        echo "  ✓ ZRAM configured (768 MB, zstd compression, priority 100)"
    else
        HAS_ZRAM=false
        echo "  ⚠ ZRAM device creation failed — falling back to disk swap only"
    fi
else
    echo "  ⚠ ZRAM not available on this kernel ($(uname -r)) — using disk swap only"
    echo "    (Oracle kernels often strip zram; this is normal)"
fi

# ---------------------------------------------------------------------------
# 3. DISK-BACKED SWAP (50 GB disk — be generous)
# ---------------------------------------------------------------------------
# With 50 GB disk, we can afford generous swap. Disk swap is slow but
# prevents OOM during npm ci / next build which can spike to 500 MB+
if [ "$HAS_ZRAM" = true ]; then
    SWAP_SIZE="2G"
    SWAP_PRI=10
    echo "[3/14] Creating disk-backed swap (2 GB fallback)..."
else
    SWAP_SIZE="4G"
    SWAP_PRI=100
    echo "[3/14] Creating disk-backed swap (4 GB, primary — no zram available)..."
fi

if [ -f /swapfile ]; then
    sudo swapoff /swapfile 2>/dev/null || true
    sudo rm -f /swapfile
fi

sudo fallocate -l "$SWAP_SIZE" /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=$((${SWAP_SIZE%G} * 1024)) status=progress
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon -p "$SWAP_PRI" /swapfile

# Persist in fstab
sudo sed -i '/\/swapfile/d' /etc/fstab
echo "/swapfile none swap sw,pri=${SWAP_PRI} 0 0" | sudo tee -a /etc/fstab > /dev/null
echo "  ✓ ${SWAP_SIZE} disk swap created (priority ${SWAP_PRI})"

# ---------------------------------------------------------------------------
# 4. KERNEL MEMORY & PERFORMANCE TUNING
# ---------------------------------------------------------------------------
echo "[4/14] Applying kernel optimizations..."

cat << 'SYSCTL' | sudo tee /etc/sysctl.d/99-oracle-micro-optimized.conf > /dev/null
# ── Memory Management ──────────────────────────────────────────────────────
# Swappiness: 150 with zram (compressed RAM swap is fast), 60 with disk-only swap
vm.swappiness = SWAPPINESS_PLACEHOLDER
# Aggressively reclaim dentries/inodes (saves RAM)
vm.vfs_cache_pressure = 200
# Lower dirty ratio — flush writes sooner (less RAM used for buffers)
vm.dirty_ratio = 10
vm.dirty_background_ratio = 5
# Minimum free memory (kB) — prevent OOM situations
vm.min_free_kbytes = 32768
# Compact memory proactively
vm.compaction_proactiveness = 20
# Enable memory overcommit (safe with swap)
vm.overcommit_memory = 1
# Watermark scale factor — wake kswapd earlier
vm.watermark_scale_factor = 200
# Page-cluster: read fewer swap pages at once (saves RAM)
vm.page-cluster = 0
# Reduce zone reclaim to avoid latency spikes
vm.zone_reclaim_mode = 0
# Limit POSIX message queues (saves kernel memory)
kernel.msgmax = 8192
kernel.msgmnb = 16384

# ── Network Performance (for web server) ──────────────────────────────────
# Enable TCP BBR congestion control (better throughput)
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
# TCP Fast Open (reduces latency for repeat visitors)
net.ipv4.tcp_fastopen = 3
# Reuse TIME_WAIT sockets
net.ipv4.tcp_tw_reuse = 1
# Reduce keepalive time
net.ipv4.tcp_keepalive_time = 120
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
# Increase connection backlog
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 4096
net.ipv4.tcp_max_syn_backlog = 4096
# Reduce FIN timeout
net.ipv4.tcp_fin_timeout = 15
# Enable SYN cookies (DDoS protection)
net.ipv4.tcp_syncookies = 1
# Increase local port range
net.ipv4.ip_local_port_range = 1024 65535
# Larger socket buffers
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
# Enable TCP window scaling (explicit for cloud networks)
net.ipv4.tcp_window_scaling = 1
# Reduce orphan retries
net.ipv4.tcp_orphan_retries = 2
# Enable MTU probing (helps with Oracle Cloud network)
net.ipv4.tcp_mtu_probing = 1

# ── File System ────────────────────────────────────────────────────────────
fs.file-max = 65535
fs.inotify.max_user_watches = 65536

# ── Kernel Security Hardening ─────────────────────────────────────────────
# Restrict dmesg to root
kernel.dmesg_restrict = 1
# Restrict kernel pointer exposure
kernel.kptr_restrict = 2
# Disable magic SysRq (not needed on a web server)
kernel.sysrq = 0
# Harden BPF
kernel.unprivileged_bpf_disabled = 1
# Prevent ICMP redirects (security)
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
# Ignore ICMP broadcasts
net.ipv4.icmp_echo_ignore_broadcasts = 1
# Log martian packets
net.ipv4.conf.all.log_martians = 1
SYSCTL

# Adjust swappiness based on zram availability
if [ "$HAS_ZRAM" = true ]; then
    sudo sed -i 's/SWAPPINESS_PLACEHOLDER/150/' /etc/sysctl.d/99-oracle-micro-optimized.conf
else
    sudo sed -i 's/SWAPPINESS_PLACEHOLDER/60/' /etc/sysctl.d/99-oracle-micro-optimized.conf
fi

sudo sysctl --system > /dev/null 2>&1
echo "  ✓ Kernel parameters optimized (memory, network, security)"

# ---------------------------------------------------------------------------
# 5. ENABLE ZSWAP (kernel-level compressed swap cache)
# ---------------------------------------------------------------------------
echo "[5/14] Enabling zswap (compressed swap cache)..."

# zswap compresses swap pages in RAM before writing to disk — very valuable
# when zram is unavailable because it makes disk swap much faster
HAS_ZSWAP=false
if [ -d /sys/module/zswap/parameters ]; then
    HAS_ZSWAP=true

    # Set pool higher when zram is absent (more aggressive compression)
    if [ "$HAS_ZRAM" = true ]; then
        ZSWAP_POOL=25
    else
        ZSWAP_POOL=35
    fi

    echo 1 | sudo tee /sys/module/zswap/parameters/enabled > /dev/null 2>&1 || true
    # Try zstd first, fall back to lz4, then lzo
    echo zstd | sudo tee /sys/module/zswap/parameters/compressor > /dev/null 2>&1 || \
    echo lz4  | sudo tee /sys/module/zswap/parameters/compressor > /dev/null 2>&1 || \
    echo lzo  | sudo tee /sys/module/zswap/parameters/compressor > /dev/null 2>&1 || true
    echo $ZSWAP_POOL | sudo tee /sys/module/zswap/parameters/max_pool_percent > /dev/null 2>&1 || true
    # Try z3fold, fall back to zbud
    echo z3fold | sudo tee /sys/module/zswap/parameters/zpool > /dev/null 2>&1 || \
    echo zbud   | sudo tee /sys/module/zswap/parameters/zpool > /dev/null 2>&1 || true

    ZSWAP_COMP=$(cat /sys/module/zswap/parameters/compressor 2>/dev/null | tr -d '[]' || echo "unknown")
    ZSWAP_POOL_ACTUAL=$(cat /sys/module/zswap/parameters/max_pool_percent 2>/dev/null || echo "$ZSWAP_POOL")
    ZSWAP_ZPOOL=$(cat /sys/module/zswap/parameters/zpool 2>/dev/null | tr -d '[]' || echo "unknown")

    # Persist via grub (use directory approach if grub.d exists)
    if [ -d /etc/default/grub.d ]; then
        cat << GRUB_ZSWAP | sudo tee /etc/default/grub.d/99-zswap.cfg > /dev/null
GRUB_CMDLINE_LINUX_DEFAULT="\$GRUB_CMDLINE_LINUX_DEFAULT zswap.enabled=1 zswap.compressor=${ZSWAP_COMP} zswap.max_pool_percent=${ZSWAP_POOL_ACTUAL} zswap.zpool=${ZSWAP_ZPOOL}"
GRUB_ZSWAP
        sudo update-grub 2>/dev/null || true
    fi

    echo "  ✓ zswap enabled (compressor=${ZSWAP_COMP}, pool=${ZSWAP_POOL_ACTUAL}%, zpool=${ZSWAP_ZPOOL})"
else
    echo "  ⚠ zswap not available on this kernel — skipped"
fi

# ---------------------------------------------------------------------------
# 6. SYSTEMD & OOM TUNING
# ---------------------------------------------------------------------------
echo "[6/14] Configuring systemd and OOM settings..."

# Reduce systemd journal size (saves disk + RAM)
sudo mkdir -p /etc/systemd/journald.conf.d
cat << 'JOURNAL' | sudo tee /etc/systemd/journald.conf.d/size.conf > /dev/null
[Journal]
SystemMaxUse=50M
RuntimeMaxUse=20M
MaxFileSec=7day
Compress=yes
JOURNAL
sudo systemctl restart systemd-journald

# Reduce systemd default timeouts (faster restarts)
sudo mkdir -p /etc/systemd/system.conf.d
cat << 'SYSTEMD_CONF' | sudo tee /etc/systemd/system.conf.d/timeouts.conf > /dev/null
[Manager]
DefaultTimeoutStartSec=30s
DefaultTimeoutStopSec=15s
SYSTEMD_CONF

# Enable earlyoom — userspace OOM killer (smarter than kernel OOM)
sudo apt install -y earlyoom 2>/dev/null || true
if command -v earlyoom &>/dev/null; then
    cat << 'EARLYOOM' | sudo tee /etc/default/earlyoom > /dev/null
EARLYOOM_ARGS="-r 3600 -m 5 -s 5 --prefer '(^|/)(node|next-server)$' --avoid '(^|/)(sshd|nginx)$'"
EARLYOOM
    sudo systemctl enable earlyoom
    sudo systemctl restart earlyoom
    echo "  ✓ earlyoom configured"
fi

echo "  ✓ systemd journal limited to 50 MB, timeouts tightened"

# ---------------------------------------------------------------------------
# 7. INSTALL NODE.JS (LTS) + NGINX
# ---------------------------------------------------------------------------
echo "[7/14] Installing Node.js LTS and Nginx..."

# Node.js 22 LTS via nodesource — always ensure v22 is installed
if ! command -v node &>/dev/null || [[ "$(node --version)" != v22.* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo "  ✓ Node.js $(node --version) installed"
echo "  ✓ git $(git --version | cut -d' ' -f3) installed"

# Install nginx (lightweight reverse proxy)
sudo apt install -y nginx
sudo systemctl enable nginx
echo "  ✓ Nginx installed"

# ---------------------------------------------------------------------------
# 8. SSH HARDENING
# ---------------------------------------------------------------------------
echo "[8/14] Hardening SSH..."

# Only disable password auth if SSH keys are already configured
# (prevents lockout on fresh VMs where you haven't added keys yet)
HAS_SSH_KEYS=false
for homedir in /home/*/ /root/; do
    if [ -s "${homedir}.ssh/authorized_keys" ] 2>/dev/null; then
        HAS_SSH_KEYS=true
        break
    fi
done

if ! grep -q "# Hardened by optimize_vm.sh" /etc/ssh/sshd_config.d/99-hardened.conf 2>/dev/null; then
    sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%s)
    sudo mkdir -p /etc/ssh/sshd_config.d

    if [ "$HAS_SSH_KEYS" = true ]; then
        PASS_AUTH="no"
        echo "  SSH keys detected — disabling password auth"
    else
        PASS_AUTH="yes"
        echo "  ⚠ No SSH keys found — keeping password auth enabled"
        echo "    Add keys to ~/.ssh/authorized_keys, then re-run to lock down"
    fi

    cat << SSH_HARDENING | sudo tee /etc/ssh/sshd_config.d/99-hardened.conf > /dev/null
# Hardened by optimize_vm.sh
PasswordAuthentication ${PASS_AUTH}
PermitRootLogin no
MaxAuthTries 3
MaxSessions 3
KbdInteractiveAuthentication no
KerberosAuthentication no
GSSAPIAuthentication no
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowAgentForwarding no
SSH_HARDENING

    sudo systemctl reload sshd 2>/dev/null || sudo systemctl reload ssh 2>/dev/null || true
    echo "  ✓ SSH hardened (no root, rate-limited, idle timeout)"
else
    echo "  ✓ SSH already hardened"
fi

# ---------------------------------------------------------------------------
# 9. FAIL2BAN (brute-force protection)
# ---------------------------------------------------------------------------
echo "[9/14] Installing fail2ban..."

sudo apt install -y fail2ban 2>/dev/null || true
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
    echo "  ✓ fail2ban configured (SSH brute-force protection)"
fi

# ---------------------------------------------------------------------------
# 10. NGINX CONFIGURATION (optimized reverse proxy)
# ---------------------------------------------------------------------------
echo "[10/14] Configuring Nginx as optimized reverse proxy..."

cat << 'NGINX_MAIN' | sudo tee /etc/nginx/nginx.conf > /dev/null
user www-data;
worker_processes 1;              # 1 vCPU = 1 worker
worker_rlimit_nofile 8192;
pid /run/nginx.pid;

events {
    worker_connections 1024;
    multi_accept on;
    use epoll;
}

http {
    # ── Basics ─────────────────────────────────────────────────────────
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    types_hash_max_size 2048;
    server_tokens off;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # ── Logging (minimal for performance) ──────────────────────────────
    access_log off;                # Disable access log (saves I/O + CPU)
    error_log /var/log/nginx/error.log warn;

    # ── Timeouts ───────────────────────────────────────────────────────
    keepalive_timeout 30;
    client_body_timeout 12;
    client_header_timeout 12;
    send_timeout 10;

    # ── Buffers (tuned for 1 GB RAM) ──────────────────────────────────
    client_body_buffer_size 16k;
    client_header_buffer_size 1k;
    client_max_body_size 8m;
    large_client_header_buffers 2 1k;

    # ── Open file cache (reduces syscalls for static assets) ──────────
    open_file_cache max=2000 inactive=60s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    # ── Gzip compression ──────────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 4;            # Good balance for 1 vCPU
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/rss+xml
        image/svg+xml
        font/ttf
        font/otf
        font/woff
        font/woff2
        application/vnd.ms-fontobject
        application/woff
        application/woff2;

    # ── Rate limiting ─────────────────────────────────────────────────
    limit_req_zone $binary_remote_addr zone=general:2m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=api:2m rate=5r/s;
    limit_conn_zone $binary_remote_addr zone=connlimit:2m;

    # ── Proxy cache (cache Next.js pages — massively reduces Node load)
    proxy_cache_path /var/cache/nginx/nextjs levels=1:2
                     keys_zone=NEXTJS_CACHE:10m
                     max_size=100m inactive=60m use_temp_path=off;

    # ── Upstream (Next.js) ────────────────────────────────────────────
    upstream nextjs {
        server 127.0.0.1:3000;
        keepalive 8;
    }

    # ── Server block ──────────────────────────────────────────────────
    server {
        listen 80 default_server;
        listen [::]:80 default_server;
        server_name _;

        # ── Security headers ──────────────────────────────────────────
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

        # ── Connection limits ─────────────────────────────────────────
        limit_conn connlimit 50;

        # ── Static assets — immutable hash-based filenames, 1 year ────
        location /_next/static/ {
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            expires 365d;
            add_header Cache-Control "public, max-age=31536000, immutable";
            add_header X-Content-Type-Options "nosniff" always;
            access_log off;
        }

        # ── Public resources (resume PDF, images, etc.) ──────────────
        location /resources/ {
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            expires 30d;
            add_header Cache-Control "public, max-age=2592000";
            add_header X-Content-Type-Options "nosniff" always;
            access_log off;
        }

        # ── Favicon, robots, manifest ─────────────────────────────────
        location ~* \.(ico|txt|webmanifest|xml)$ {
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            expires 7d;
            access_log off;
        }

        # ── SSE streaming for /api/chat — MUST disable buffering ──────
        # Without proxy_buffering off, nginx buffers the entire LLM
        # response before sending it, breaking the streaming chat UX.
        location /api/chat {
            limit_req zone=api burst=5 nodelay;
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";
            # Critical for SSE — do NOT buffer the stream
            proxy_buffering off;
            proxy_cache off;
            proxy_read_timeout 120s;
            chunked_transfer_encoding on;
        }

        # ── Other API routes — rate limited ───────────────────────────
        location /api/ {
            limit_req zone=api burst=10 nodelay;
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # ── Block hidden files (.git, .env, etc.) ─────────────────────
        location ~ /\. {
            deny all;
            log_not_found off;
        }

        # ── Block common attack paths ─────────────────────────────────
        location ~* (wp-admin|wp-login|wp-includes|xmlrpc\.php|\.php$) {
            deny all;
            log_not_found off;
        }

        # ── Everything else → Next.js (with proxy caching) ───────────
        location / {
            limit_req zone=general burst=20 nodelay;
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Proxy buffer tuning
            proxy_buffer_size 8k;
            proxy_buffers 4 8k;

            # Cache HTML responses (5 min) — massively reduces Node.js load
            # on a 1 vCPU machine. Stale cache served during errors/timeouts.
            proxy_cache NEXTJS_CACHE;
            proxy_cache_valid 200 5m;
            proxy_cache_valid 404 1m;
            proxy_cache_use_stale error timeout updating http_500 http_502 http_503;
            proxy_cache_lock on;
            proxy_cache_lock_timeout 5s;
            add_header X-Cache-Status $upstream_cache_status;
        }
    }
}
NGINX_MAIN

# Create nginx cache directory
sudo mkdir -p /var/cache/nginx/nextjs
sudo chown www-data:www-data /var/cache/nginx/nextjs

sudo nginx -t && sudo systemctl restart nginx
echo "  ✓ Nginx configured (reverse proxy + SSE + proxy cache + security headers)"

# ---------------------------------------------------------------------------
# 11. NEXT.JS SYSTEMD SERVICE (with memory limits)
# ---------------------------------------------------------------------------
echo "[11/14] Creating Next.js systemd service..."

# Create app user
sudo useradd -r -m -s /bin/bash nextapp 2>/dev/null || true

cat << 'NEXTJS_SERVICE' | sudo tee /etc/systemd/system/nextjs.service > /dev/null
[Unit]
Description=Next.js Portfolio
After=network.target
Wants=network.target

[Service]
Type=simple
User=nextapp
Group=nextapp
WorkingDirectory=/home/nextapp/portfolio
# ── Memory-optimized Node.js flags ──
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
# Limit V8 heap to ~300 MB — prevents runaway memory usage
# --gc-interval=100: run GC every 100 allocations (aggressive but safe for 1 GB)
# --max-semi-space-size=8: limit young generation to 8 MB (faster minor GC)
# --optimize-for-size: trade speed for lower memory footprint
Environment=NODE_OPTIONS="--max-old-space-size=300 --gc-interval=100 --max-semi-space-size=8 --optimize-for-size"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
TimeoutStartSec=30
TimeoutStopSec=15

# ── systemd resource limits ──
MemoryMax=450M
MemoryHigh=350M
CPUQuota=90%
# OOM score: if memory is critical, kill this before sshd/nginx
OOMScoreAdjust=500
# Run at slightly lower priority so sshd/nginx stay responsive
Nice=5
# IO scheduling: best-effort class 4 (slightly lower than default)
IOSchedulingClass=best-effort
IOSchedulingPriority=4

# ── Security hardening ──
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/nextapp/portfolio
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes

# ── Journal rate limiting (prevent runaway logging) ──
LogRateLimitIntervalSec=30
LogRateLimitBurst=100

[Install]
WantedBy=multi-user.target
NEXTJS_SERVICE

sudo systemctl daemon-reload
sudo systemctl enable nextjs.service
echo "  ✓ Next.js service created (300 MB heap, Nice=5, auto-restart, hardened)"

# ---------------------------------------------------------------------------
# 12. FIREWALL SETUP
# ---------------------------------------------------------------------------
echo "[12/14] Configuring firewall..."

sudo apt install -y ufw 2>/dev/null || true
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
echo "y" | sudo ufw enable
echo "  ✓ Firewall configured (SSH + HTTP + HTTPS only)"

# ---------------------------------------------------------------------------
# 13. LOGROTATE FOR NGINX
# ---------------------------------------------------------------------------
echo "[13/14] Configuring log rotation..."

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

echo "  ✓ Log rotation configured (7 days, compressed)"

# ---------------------------------------------------------------------------
# 14. CLEANUP: Free up disk and memory
# ---------------------------------------------------------------------------
echo "[14/14] Cleaning up..."

sudo apt autoremove -y --purge
sudo apt clean
sudo journalctl --vacuum-size=50M 2>/dev/null || true
# Clear package lists cache (~50 MB)
sudo rm -rf /var/lib/apt/lists/*
# Clear old compressed/rotated logs
sudo find /var/log -name "*.gz" -delete 2>/dev/null || true
sudo find /var/log -name "*.old" -delete 2>/dev/null || true
echo "  ✓ Caches and old logs purged"

# ---------------------------------------------------------------------------
# NEXT.JS BUILD & DEPLOY HELPER SCRIPT
# ---------------------------------------------------------------------------
cat << 'DEPLOY_SCRIPT' | sudo tee /home/nextapp/deploy.sh > /dev/null
#!/bin/bash
# Deploy/update Next.js portfolio (standalone mode)
# Usage: sudo -u nextapp bash /home/nextapp/deploy.sh
#
# Prerequisites:
#   - next.config.ts must have: output: 'standalone'
#   - .env.local must exist in the project root (for LLM API keys)

set -euo pipefail
cd /home/nextapp/portfolio

echo "━━━ Next.js Deploy (Standalone Mode) ━━━"

# Validate .env.local exists
if [ ! -f .env.local ]; then
    echo "⚠ WARNING: .env.local not found — /api/chat will not work without LLM keys"
fi

echo "[1/5] Installing dependencies (production only)..."
# Lower priority during build to keep the live server responsive
nice -n 15 ionice -c 3 npm ci --omit=dev --ignore-scripts=false 2>&1 | tail -5

echo "[2/5] Building Next.js (standalone output)..."
nice -n 15 ionice -c 3 npm run build 2>&1 | tail -10

echo "[3/5] Preparing standalone bundle..."
# Next.js standalone output: .next/standalone/server.js
# Must also copy static assets and public folder into the standalone dir
if [ -d .next/standalone ]; then
    cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
    cp -r public .next/standalone/public 2>/dev/null || true
    cp .env.local .next/standalone/.env.local 2>/dev/null || true
    echo "  ✓ Standalone bundle prepared"
else
    echo "  ⚠ No standalone output — ensure next.config.ts has output: 'standalone'"
    echo "    Falling back to standard server mode (next start)"
fi

echo "[4/5] Pruning caches..."
npm cache clean --force 2>/dev/null || true
rm -rf .next/cache/webpack 2>/dev/null || true
echo "  ✓ Caches pruned"

echo "[5/5] Restarting service..."
sudo systemctl restart nextjs.service

# Wait for startup
sleep 3
if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    echo ""
    echo "✓ Deployment complete — site is live!"
else
    echo ""
    echo "⚠ Service started but health check failed"
    echo "  Check logs: sudo journalctl -u nextjs -f --no-pager -n 50"
fi

echo ""
echo "Useful commands:"
echo "  sudo systemctl status nextjs        # Service status"
echo "  sudo journalctl -u nextjs -f        # Live logs"
echo "  sudo systemctl restart nextjs       # Restart"
echo "  curl -I http://localhost:3000       # Health check"
DEPLOY_SCRIPT

sudo chown nextapp:nextapp /home/nextapp/deploy.sh
sudo chmod +x /home/nextapp/deploy.sh

# Allow nextapp to restart the service without full sudo password
echo "nextapp ALL=(root) NOPASSWD: /usr/bin/systemctl restart nextjs.service, /usr/bin/systemctl stop nextjs.service, /usr/bin/systemctl start nextjs.service, /usr/bin/systemctl status nextjs.service" | sudo tee /etc/sudoers.d/nextapp > /dev/null
sudo chmod 440 /etc/sudoers.d/nextapp

# Set timezone to UTC for consistent logs
sudo timedatectl set-timezone UTC 2>/dev/null || true

# ---------------------------------------------------------------------------
# SUMMARY
# ---------------------------------------------------------------------------
echo ""
echo "========================================="
echo " Setup Complete!"
echo "========================================="
echo ""
echo " Memory layout:"
echo "   Physical RAM:  1024 MB"
if [ "$HAS_ZRAM" = true ]; then
    echo "   ZRAM swap:      768 MB (compressed → ~1.5-2.5 GB effective)"
    echo "   Disk swap:     2048 MB (fallback, priority 10)"
else
    echo "   ZRAM swap:      N/A (kernel module unavailable)"
    echo "   Disk swap:     4096 MB (primary, priority 100)"
fi
if [ "$HAS_ZSWAP" = true ]; then
    echo "   zswap cache:    compresses pages before disk swap"
else
    echo "   zswap:          N/A (not available on this kernel)"
fi
echo ""
echo " Effective memory (with compression + swap):"
if [ "$HAS_ZRAM" = true ]; then
    echo "   ~4-5 GB total usable (RAM + ZRAM + disk swap)"
else
    echo "   ~5 GB total usable (RAM + disk swap)"
fi
echo ""
echo " Services running:"
echo "   • Nginx       → port 80 (reverse proxy + cache + SSE)"
echo "   • Next.js     → port 3000 (systemd, 300 MB heap, Nice=5)"
echo "   • earlyoom    → kills runaway processes before kernel OOM"
echo "   • fail2ban    → SSH brute-force protection"
echo "   • SSH         → port 22 (hardened, no root login)"
echo ""
echo " Installed tools:"
echo "   • git $(git --version 2>/dev/null | cut -d' ' -f3 || echo 'N/A')"
echo "   • Node.js $(node --version 2>/dev/null || echo 'N/A')"
echo "   • htop, iotop, jq, curl, wget"
echo ""
echo " Security:"
echo "   • SSH: no root login, fail2ban, idle timeout"
echo "   • Firewall: only 22, 80, 443 open"
echo "   • Nginx: rate limiting, connection limits, attack path blocking"
echo "   • Kernel: dmesg restricted, BPF restricted, ICMP hardened"
echo "   • systemd: service sandboxed (NoNewPrivileges, ProtectSystem)"
echo ""
echo " Next steps:"
echo "   1. Upload project to /home/nextapp/portfolio/"
echo "      git clone <your-repo> /home/nextapp/portfolio"
echo "      sudo chown -R nextapp:nextapp /home/nextapp/portfolio"
echo "   2. Ensure next.config.ts has: output: 'standalone'"
echo "   3. Place .env.local with LLM_API_KEY, LLM_BASE_URL, LLM_MODEL"
echo "   4. Run: sudo -u nextapp bash /home/nextapp/deploy.sh"
echo "   5. (Optional) Add SSL with Cloudflare Origin Certificate:"
echo "      sudo mkdir -p /etc/ssl/cloudflare"
echo "      # Copy cert/key, then update nginx config for HTTPS"
echo "   6. (Optional) Add SSL with certbot:"
echo "      sudo apt install certbot python3-certbot-nginx"
echo "      sudo certbot --nginx -d yourdomain.com"
echo ""
echo " Useful commands:"
echo "   sudo systemctl status nextjs     # Check app status"
echo "   sudo journalctl -u nextjs -f     # Live logs"
echo "   sudo systemctl restart nextjs    # Restart app"
echo "   free -h                          # Check memory"
echo "   zramctl                          # Check zram status"
echo "   htop                             # Process monitor"
echo "   sudo fail2ban-client status sshd # Banned IPs"
echo "   cat /sys/module/zswap/parameters/enabled  # Check zswap"
echo ""
echo " ⚠ REBOOT recommended to apply all kernel/grub changes:"
echo "   sudo reboot"
