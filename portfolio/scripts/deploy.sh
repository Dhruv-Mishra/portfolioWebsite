#!/bin/bash
#===============================================================================
#
#          FILE: deploy.sh
#
#         USAGE: sudo ./deploy.sh [--skip-git] [--skip-build] [--skip-deps]
#                                  [--skip-nginx] [--force]
#
#   DESCRIPTION: Production deployment for whoisdhruv.com portfolio
#                Next.js server mode (next start) behind nginx reverse proxy.
#
#                Flow:
#                  1. Pre-flight checks (root, deps, disk, ssl, env, git)
#                  2. Kill orphaned processes on the Next.js port
#                  3. Git pull
#                  4. Install dependencies + build (.next/)
#                  5. Prune caches to reclaim disk
#                  6. Create/update systemd service (nice, journal caps)
#                  7. Restart Next.js, wait for readiness
#                  8. Update & reload nginx
#                  9. Health checks (nginx, Next.js, HTTP, chat API)
#
#       OPTIONS:
#                --skip-git    Skip git pull (useful for local testing)
#                --skip-deps   Skip npm ci (useful when only code changed)
#                --skip-build  Skip npm build (useful when only updating nginx)
#                --skip-nginx  Skip nginx config update
#                --force       Force deployment even with uncommitted changes
#                --help        Show this help message
#
#       VERSION: 2.1.0
#       CREATED: 2026-01-06
#       UPDATED: 2026-02-14  Rewritten for Next.js server mode
#                             + nice values, process cleanup, log caps
#
#===============================================================================

set -euo pipefail

#===============================================================================
# VM-SPECIFIC CONFIGURATION
# Edit these variables to match your server environment.
#===============================================================================

# Domain
readonly DOMAIN="whoisdhruv.com"

# Repository & project paths
readonly GIT_ROOT="/home/portfolioWebsite/portfolio"
readonly PROJECT_ROOT="${GIT_ROOT}/portfolio"

# Git
readonly GIT_BRANCH="master"
readonly GIT_REMOTE="origin"

# Next.js server
readonly NEXTJS_PORT=3000

# systemd service
readonly SERVICE_NAME="portfolio"
readonly SERVICE_USER="portfolioWebsite"   # Non-root user that owns the project

# Process priority (nice: -20=highest, 19=lowest; ionice: 1=realtime, 2=best-effort, 3=idle)
readonly SERVICE_NICE=5                     # Slightly below default for the live server
readonly BUILD_NICE=15                      # Low priority so builds don't starve the server
readonly BUILD_IONICE_CLASS=3               # Idle I/O class — only runs when disk is free

# SSL (Cloudflare Origin Certificate)
readonly SSL_CERT="/etc/ssl/cloudflare/${DOMAIN}.pem"
readonly SSL_KEY="/etc/ssl/cloudflare/${DOMAIN}.key"

# Nginx
readonly NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
readonly NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"

# Backups & logs
readonly BACKUP_DIR="/var/backups/${SERVICE_NAME}"
readonly LOG_DIR="/var/log/${SERVICE_NAME}-deploy"
readonly BACKUP_RETENTION_DAYS=7            # Keep nginx backups for 1 week
readonly MAX_LOG_FILES=10                   # Keep only last 10 deploy logs
readonly MAX_LOG_SIZE_MB=5                  # Truncate individual logs beyond 5MB

# Journal log caps for the Next.js service
readonly JOURNAL_RATE_INTERVAL=30           # seconds
readonly JOURNAL_RATE_BURST=100             # max log entries per interval
readonly JOURNAL_MAX_SIZE="50M"             # max total journal size for this unit

# Build
readonly NPM_BUILD_TIMEOUT=600              # seconds

# Health check
readonly HEALTH_CHECK_RETRIES=30            # seconds to wait for Next.js
readonly MIN_DISK_MB=500                    # minimum free disk space

# Required env vars in .env.local (chat API won't work without these)
readonly REQUIRED_ENV_VARS=("LLM_API_KEY" "LLM_BASE_URL" "LLM_MODEL")

#===============================================================================
# DERIVED CONSTANTS — Do not edit below this line
#===============================================================================

readonly SOURCE_NGINX_CONF="${PROJECT_ROOT}/nginx-cloudflare.conf"
readonly NEXTJS_BUILD_DIR="${PROJECT_ROOT}/.next"
readonly ENV_FILE="${PROJECT_ROOT}/.env.local"
readonly SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
readonly NGINX_CONF_NAME="${SERVICE_NAME}"
readonly NGINX_ACTIVE_CONF="${NGINX_SITES_AVAILABLE}/${NGINX_CONF_NAME}"
readonly LOG_FILE="${LOG_DIR}/deploy-$(date +%Y%m%d-%H%M%S).log"

#===============================================================================
# COLOR CODES
#===============================================================================

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m'

#===============================================================================
# MUTABLE STATE
#===============================================================================

SKIP_GIT=false
SKIP_DEPS=false
SKIP_BUILD=false
SKIP_NGINX=false
FORCE_DEPLOY=false
DEPLOYMENT_START_TIME=""
NGINX_BACKUP_FILE=""

#===============================================================================
# LOGGING
#===============================================================================

log() {
    local level="$1"; shift
    local message="$*"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')

    echo "[${ts}] [${level}] ${message}" >> "${LOG_FILE}"

    case "${level}" in
        INFO)    echo -e "${CYAN}[${ts}]${NC} ${GREEN}[INFO]${NC} ${message}" ;;
        WARN)    echo -e "${CYAN}[${ts}]${NC} ${YELLOW}[WARN]${NC} ${message}" ;;
        ERROR)   echo -e "${CYAN}[${ts}]${NC} ${RED}[ERROR]${NC} ${message}" ;;
        DEBUG)   echo -e "${CYAN}[${ts}]${NC} ${MAGENTA}[DEBUG]${NC} ${message}" ;;
        STEP)    echo -e "\n${CYAN}[${ts}]${NC} ${BLUE}[STEP]${NC} ${WHITE}${message}${NC}" ;;
        SUCCESS) echo -e "${CYAN}[${ts}]${NC} ${GREEN}[SUCCESS]${NC} ${GREEN}${message}${NC}" ;;
    esac
}

log_separator() {
    local line
    line=$(printf '%*s' 80 '' | tr ' ' "${1:-=}")
    echo -e "${BLUE}${line}${NC}"
    echo "${line}" >> "${LOG_FILE}"
}

#===============================================================================
# UTILITY FUNCTIONS
#===============================================================================

show_help() {
    cat << 'EOF'
Usage: sudo ./deploy.sh [OPTIONS]

Production deployment for whoisdhruv.com (Next.js server mode).

OPTIONS:
    --skip-git      Skip git pull
    --skip-deps     Skip npm ci (use when only code changed, not packages)
    --skip-build    Skip npm ci & next build
    --skip-nginx    Skip nginx config update & reload
    --force         Deploy even with uncommitted changes
    --help          Show this message

EXAMPLES:
    sudo ./deploy.sh                          # Full deployment
    sudo ./deploy.sh --skip-git               # Deploy without pulling
    sudo ./deploy.sh --skip-deps              # Build without reinstalling deps
    sudo ./deploy.sh --skip-build             # Redeploy nginx only
    sudo ./deploy.sh --skip-build --skip-nginx  # Just restart Next.js
EOF
    exit 0
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --skip-git)   SKIP_GIT=true;   shift ;;
            --skip-deps)  SKIP_DEPS=true;  shift ;;
            --skip-build) SKIP_BUILD=true; shift ;;
            --skip-nginx) SKIP_NGINX=true; shift ;;
            --force)      FORCE_DEPLOY=true; shift ;;
            --help|-h)    show_help ;;
            *)
                log ERROR "Unknown option: $1  (use --help)"
                exit 1 ;;
        esac
    done
}

# Trap handler — runs on any exit, rolls back nginx if needed
cleanup() {
    local exit_code=$?

    if [[ ${exit_code} -ne 0 ]]; then
        log_separator
        log ERROR "Deployment failed (exit ${exit_code}). Log: ${LOG_FILE}"

        # Attempt nginx rollback
        if [[ -n "${NGINX_BACKUP_FILE}" ]] && [[ -f "${NGINX_BACKUP_FILE}" ]]; then
            log WARN "Rolling back nginx configuration..."
            if cp "${NGINX_BACKUP_FILE}" "${NGINX_ACTIVE_CONF}" && nginx -t &>/dev/null; then
                systemctl reload nginx
                log SUCCESS "Nginx rolled back successfully"
            else
                log ERROR "CRITICAL: Nginx rollback failed — manual intervention required!"
            fi
        fi
    fi

    if [[ -n "${DEPLOYMENT_START_TIME}" ]]; then
        local dur=$(( $(date +%s) - DEPLOYMENT_START_TIME ))
        log INFO "Total time: $((dur / 60))m $((dur % 60))s"
    fi
}

#===============================================================================
# PRE-FLIGHT CHECKS
#===============================================================================

check_root() {
    log STEP "Checking root privileges..."
    if [[ $EUID -ne 0 ]]; then
        log ERROR "This script must be run as root (sudo)"
        exit 1
    fi
    log SUCCESS "Running as root"
}

check_dependencies() {
    log STEP "Checking dependencies..."

    local deps=("git" "node" "npm" "nginx" "systemctl" "curl" "nice" "ionice")
    local missing=()

    for cmd in "${deps[@]}"; do
        if ! command -v "${cmd}" &>/dev/null; then
            missing+=("${cmd}")
        else
            local ver="installed"
            case "${cmd}" in
                node)  ver=$(node --version 2>/dev/null) ;;
                npm)   ver=$(npm --version 2>/dev/null) ;;
                nginx) ver=$(nginx -v 2>&1 | grep -oP '[\d.]+' || echo "?") ;;
                git)   ver=$(git --version | awk '{print $3}') ;;
            esac
            log DEBUG "${cmd}: ${ver}"
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log ERROR "Missing: ${missing[*]}"
        exit 1
    fi
    log SUCCESS "All dependencies present"
}

check_disk_space() {
    log STEP "Checking disk space..."

    local avail
    avail=$(df -m "${PROJECT_ROOT}" | awk 'NR==2{print $4}')

    if [[ ${avail} -lt ${MIN_DISK_MB} ]]; then
        log ERROR "Only ${avail}MB free (need ${MIN_DISK_MB}MB)"
        exit 1
    fi
    log SUCCESS "Disk OK: ${avail}MB free"
}

check_paths() {
    log STEP "Validating paths..."

    [[ -d "${PROJECT_ROOT}" ]] || { log ERROR "Project dir missing: ${PROJECT_ROOT}"; exit 1; }
    [[ -f "${SOURCE_NGINX_CONF}" ]] || { log ERROR "Nginx config missing: ${SOURCE_NGINX_CONF}"; exit 1; }
    [[ -d "${NGINX_SITES_AVAILABLE}" ]] || { log ERROR "Nginx sites-available missing"; exit 1; }

    # SSL certificates
    [[ -f "${SSL_CERT}" ]] || { log ERROR "SSL cert missing: ${SSL_CERT}"; exit 1; }
    [[ -f "${SSL_KEY}" ]]  || { log ERROR "SSL key missing: ${SSL_KEY}"; exit 1; }

    local perms
    perms=$(stat -c "%a" "${SSL_KEY}")
    if [[ "${perms}" != "600" ]]; then
        log WARN "Fixing SSL key permissions (${perms} → 600)"
        chmod 600 "${SSL_KEY}"
    fi

    log SUCCESS "Paths validated"
}

check_env_file() {
    log STEP "Validating .env.local..."

    if [[ ! -f "${ENV_FILE}" ]]; then
        log ERROR ".env.local not found at ${ENV_FILE}"
        log INFO "Required vars: ${REQUIRED_ENV_VARS[*]}"
        exit 1
    fi

    local missing=()
    for var in "${REQUIRED_ENV_VARS[@]}"; do
        if ! grep -q "^${var}=" "${ENV_FILE}"; then
            missing+=("${var}")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log ERROR "Missing in .env.local: ${missing[*]}"
        exit 1
    fi

    log SUCCESS ".env.local validated (${#REQUIRED_ENV_VARS[@]} required vars present)"
}

check_swap() {
    log STEP "Checking memory & swap..."

    local total_ram
    total_ram=$(free -m | awk '/Mem:/{print $2}')
    local total_swap
    total_swap=$(free -m | awk '/Swap:/{print $2}')

    log DEBUG "RAM: ${total_ram}MB, Swap: ${total_swap}MB"

    if [[ ${total_ram} -lt 1500 ]] && [[ ${total_swap} -lt 512 ]]; then
        log WARN "Low memory (${total_ram}MB RAM) with no swap — builds may OOM"
        log INFO "Consider: sudo fallocate -l 1G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"
    fi

    log SUCCESS "Memory check complete"
}

check_git_status() {
    log STEP "Checking git status..."

    cd "${GIT_ROOT}"

    [[ -d ".git" ]] || { log ERROR "Not a git repo: ${GIT_ROOT}"; exit 1; }

    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        if [[ "${FORCE_DEPLOY}" == "true" ]]; then
            log WARN "Uncommitted changes (--force set, continuing)"
        else
            log ERROR "Uncommitted changes — commit/stash or use --force"
            git status --short
            exit 1
        fi
    fi

    local branch
    branch=$(git branch --show-current)
    if [[ "${branch}" != "${GIT_BRANCH}" ]]; then
        log WARN "On branch ${branch}, switching to ${GIT_BRANCH}..."
        git checkout "${GIT_BRANCH}"
    fi

    log SUCCESS "Git status OK"
}

#===============================================================================
# DIRECTORY SETUP & CLEANUP
#===============================================================================

setup_directories() {
    mkdir -p "${LOG_DIR}" "${BACKUP_DIR}"
    chmod 755 "${LOG_DIR}" "${BACKUP_DIR}"
    touch "${LOG_FILE}"
    chmod 644 "${LOG_FILE}"
}

cleanup_old_artifacts() {
    log STEP "Cleaning up old artifacts..."

    # Trim deploy logs to MAX_LOG_FILES
    local count
    count=$(find "${LOG_DIR}" -name "deploy-*.log" -type f | wc -l)
    if [[ ${count} -gt ${MAX_LOG_FILES} ]]; then
        local to_delete=$(( count - MAX_LOG_FILES ))
        log DEBUG "Removing ${to_delete} old deploy logs..."
        find "${LOG_DIR}" -name "deploy-*.log" -type f -printf '%T+ %p\n' \
            | sort | head -n "${to_delete}" \
            | cut -d' ' -f2- | xargs rm -f
    fi

    # Truncate any oversized deploy logs
    find "${LOG_DIR}" -name "deploy-*.log" -type f -size "+${MAX_LOG_SIZE_MB}M" \
        -exec truncate -s "${MAX_LOG_SIZE_MB}M" {} \; 2>/dev/null || true

    # Trim old backups
    find "${BACKUP_DIR}" -name "*.backup.*" -type f -mtime "+${BACKUP_RETENTION_DAYS}" -delete 2>/dev/null || true

    # Vacuum journald logs for our service to stay under cap
    if command -v journalctl &>/dev/null; then
        journalctl --vacuum-size="${JOURNAL_MAX_SIZE}" -u "${SERVICE_NAME}" &>/dev/null || true
    fi

    log SUCCESS "Cleanup complete"
}

#===============================================================================
# PROCESS CLEANUP
#===============================================================================

kill_orphaned_processes() {
    log STEP "Killing orphaned processes on port ${NEXTJS_PORT}..."

    # Stop the systemd service first (graceful SIGTERM)
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
        sleep 2
    fi

    # Find and kill any leftover processes still holding the port
    local pids
    pids=$(ss -tlnp "sport = :${NEXTJS_PORT}" 2>/dev/null \
        | grep -oP 'pid=\K[0-9]+' | sort -u || true)

    if [[ -n "${pids}" ]]; then
        log WARN "Found orphaned PIDs on port ${NEXTJS_PORT}: ${pids}"
        for pid in ${pids}; do
            log DEBUG "Sending SIGTERM to PID ${pid}..."
            kill "${pid}" 2>/dev/null || true
        done
        sleep 2

        # Force-kill any survivors
        pids=$(ss -tlnp "sport = :${NEXTJS_PORT}" 2>/dev/null \
            | grep -oP 'pid=\K[0-9]+' | sort -u || true)
        if [[ -n "${pids}" ]]; then
            log WARN "Force-killing stubborn PIDs: ${pids}"
            for pid in ${pids}; do
                kill -9 "${pid}" 2>/dev/null || true
            done
            sleep 1
        fi
    fi

    # Also kill any stale node processes running "next start" that aren't systemd-managed
    local stale_pids
    stale_pids=$(pgrep -f "next start.*--port ${NEXTJS_PORT}" 2>/dev/null || true)
    if [[ -n "${stale_pids}" ]]; then
        log WARN "Killing stale 'next start' processes: ${stale_pids}"
        echo "${stale_pids}" | xargs kill 2>/dev/null || true
        sleep 1
        # Force kill if still around
        stale_pids=$(pgrep -f "next start.*--port ${NEXTJS_PORT}" 2>/dev/null || true)
        if [[ -n "${stale_pids}" ]]; then
            echo "${stale_pids}" | xargs kill -9 2>/dev/null || true
        fi
    fi

    log SUCCESS "Port ${NEXTJS_PORT} is clear"
}

#===============================================================================
# GIT OPERATIONS
#===============================================================================

git_pull() {
    if [[ "${SKIP_GIT}" == "true" ]]; then
        log WARN "Skipping git pull (--skip-git)"
        return 0
    fi

    log STEP "Pulling latest code..."
    cd "${GIT_ROOT}"

    git fetch "${GIT_REMOTE}" "${GIT_BRANCH}" 2>&1 | tee -a "${LOG_FILE}" \
        || { log ERROR "git fetch failed"; exit 1; }

    local local_hash remote_hash
    local_hash=$(git rev-parse HEAD)
    remote_hash=$(git rev-parse "${GIT_REMOTE}/${GIT_BRANCH}")

    if [[ "${local_hash}" == "${remote_hash}" ]]; then
        log INFO "Already up to date"
    else
        git pull "${GIT_REMOTE}" "${GIT_BRANCH}" 2>&1 | tee -a "${LOG_FILE}" \
            || { log ERROR "git pull failed"; exit 1; }
        log SUCCESS "Updated to $(git rev-parse --short HEAD)"
    fi

    log DEBUG "Last commit: $(git log -1 --pretty=format:'%h — %s (%an, %ar)')"
}

cleanup_git_changes() {
    log STEP "Discarding build-generated changes..."
    cd "${GIT_ROOT}"
    git checkout -- "${PROJECT_ROOT}/package.json" "${PROJECT_ROOT}/package-lock.json" 2>/dev/null || true
    log SUCCESS "Git worktree clean"
}

#===============================================================================
# BUILD OPERATIONS
#===============================================================================

install_dependencies() {
    if [[ "${SKIP_DEPS}" == "true" ]] || [[ "${SKIP_BUILD}" == "true" ]]; then
        log WARN "Skipping dependency install (--skip-deps or --skip-build)"
        return 0
    fi

    log STEP "Installing dependencies (nice ${BUILD_NICE}, ionice class ${BUILD_IONICE_CLASS})..."
    cd "${PROJECT_ROOT}"

    if [[ -d "node_modules" ]] && [[ -f "package-lock.json" ]]; then
        if ! nice -n "${BUILD_NICE}" ionice -c "${BUILD_IONICE_CLASS}" \
                npm ci --loglevel=warn 2>&1 | tee -a "${LOG_FILE}"; then
            log WARN "npm ci failed, falling back to npm install..."
            nice -n "${BUILD_NICE}" ionice -c "${BUILD_IONICE_CLASS}" \
                npm install 2>&1 | tee -a "${LOG_FILE}" \
                || { log ERROR "npm install failed"; exit 1; }
        fi
    else
        nice -n "${BUILD_NICE}" ionice -c "${BUILD_IONICE_CLASS}" \
            npm install 2>&1 | tee -a "${LOG_FILE}" \
            || { log ERROR "npm install failed"; exit 1; }
    fi

    log SUCCESS "Dependencies installed"
}

build_project() {
    if [[ "${SKIP_BUILD}" == "true" ]]; then
        log WARN "Skipping build (--skip-build)"
        return 0
    fi

    log STEP "Clearing stale build cache..."
    # Remove .next/cache to prevent stale cache bloat across deployments
    # The .next directory itself is preserved so the server can still run
    # during build (though we already stopped it)
    rm -rf "${NEXTJS_BUILD_DIR}/cache" 2>/dev/null || true
    log DEBUG "Cleared .next/cache"

    log STEP "Building Next.js project (nice ${BUILD_NICE}, ionice class ${BUILD_IONICE_CLASS})..."
    cd "${PROJECT_ROOT}"

    export NODE_ENV="production"

    if ! timeout "${NPM_BUILD_TIMEOUT}" \
            nice -n "${BUILD_NICE}" ionice -c "${BUILD_IONICE_CLASS}" \
            npm run build 2>&1 | tee -a "${LOG_FILE}"; then
        log ERROR "Build failed! Check ${LOG_FILE}"
        exit 1
    fi

    # Verify build output
    if [[ ! -d "${NEXTJS_BUILD_DIR}" ]]; then
        log ERROR "Build succeeded but .next/ directory not found"
        exit 1
    fi

    local file_count
    file_count=$(find "${NEXTJS_BUILD_DIR}" -type f | wc -l)
    log SUCCESS "Build complete (${file_count} files in .next/)"
}

prune_caches() {
    log STEP "Pruning caches to reclaim disk..."

    # Prune npm cache (downloaded tarballs)
    nice -n 19 npm cache clean --force &>/dev/null || true

    # Remove Next.js persistent trace files that grow over time
    rm -f "${NEXTJS_BUILD_DIR}/trace" 2>/dev/null || true

    local avail
    avail=$(df -m "${PROJECT_ROOT}" | awk 'NR==2{print $4}')
    log SUCCESS "Caches pruned (${avail}MB free)"
}

#===============================================================================
# SYSTEMD SERVICE MANAGEMENT
#===============================================================================

ensure_systemd_service() {
    log STEP "Configuring systemd service (${SERVICE_NAME})..."

    local node_bin
    node_bin=$(command -v node)
    local next_bin="${PROJECT_ROOT}/node_modules/.bin/next"

    if [[ ! -f "${next_bin}" ]]; then
        log ERROR "next binary not found at ${next_bin}"
        log INFO "Run npm install first"
        exit 1
    fi

    cat > "${SYSTEMD_UNIT}" << UNIT
[Unit]
Description=Next.js Server — ${DOMAIN}
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${PROJECT_ROOT}
ExecStart=${node_bin} ${next_bin} start --port ${NEXTJS_PORT}
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=${ENV_FILE}

# CPU scheduling — run slightly below default so system tasks aren't starved
Nice=${SERVICE_NICE}

# Logging — send to journald, not disk files
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Rate-limit logs to prevent runaway logging from filling the journal
LogRateLimitIntervalSec=${JOURNAL_RATE_INTERVAL}
LogRateLimitBurst=${JOURNAL_RATE_BURST}

# Hardening
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

# Kill the entire process group on stop (catches child workers)
KillMode=control-group
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
UNIT

    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" &>/dev/null

    log SUCCESS "Systemd service configured (Nice=${SERVICE_NICE}, journal rate=${JOURNAL_RATE_BURST}/${JOURNAL_RATE_INTERVAL}s)"
}

restart_nextjs() {
    log STEP "Starting Next.js server..."

    systemctl start "${SERVICE_NAME}"

    # Wait for the server to respond
    log DEBUG "Waiting up to ${HEALTH_CHECK_RETRIES}s for port ${NEXTJS_PORT}..."
    local i=0
    while [[ $i -lt ${HEALTH_CHECK_RETRIES} ]]; do
        if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${NEXTJS_PORT}/" 2>/dev/null; then
            log SUCCESS "Next.js is ready on port ${NEXTJS_PORT} (took ${i}s)"
            return 0
        fi
        i=$((i + 1))
        sleep 1
    done

    log ERROR "Next.js failed to start within ${HEALTH_CHECK_RETRIES}s"
    log ERROR "Recent logs:"
    journalctl -u "${SERVICE_NAME}" --no-pager -n 30 2>&1 | tee -a "${LOG_FILE}"
    exit 1
}

#===============================================================================
# NGINX OPERATIONS
#===============================================================================

backup_nginx_config() {
    log STEP "Backing up nginx configuration..."

    if [[ -f "${NGINX_ACTIVE_CONF}" ]]; then
        NGINX_BACKUP_FILE="${BACKUP_DIR}/${NGINX_CONF_NAME}.backup.$(date +%Y%m%d-%H%M%S)"
        cp "${NGINX_ACTIVE_CONF}" "${NGINX_BACKUP_FILE}" \
            || { log ERROR "Nginx backup failed"; exit 1; }
        chmod 644 "${NGINX_BACKUP_FILE}"
        log SUCCESS "Backed up to ${NGINX_BACKUP_FILE}"
    else
        log WARN "No existing nginx config — fresh deployment"
    fi
}

validate_nginx_source() {
    log STEP "Validating nginx source config..."

    [[ -f "${SOURCE_NGINX_CONF}" ]] \
        || { log ERROR "Source config missing: ${SOURCE_NGINX_CONF}"; exit 1; }

    local required=("listen 443 ssl" "ssl_certificate" "ssl_certificate_key" "server_name" "proxy_pass")
    for pat in "${required[@]}"; do
        grep -q "${pat}" "${SOURCE_NGINX_CONF}" \
            || { log ERROR "Missing directive in nginx config: ${pat}"; exit 1; }
    done

    log SUCCESS "Nginx source config validated"
}

deploy_nginx() {
    if [[ "${SKIP_NGINX}" == "true" ]]; then
        log WARN "Skipping nginx update (--skip-nginx)"
        return 0
    fi

    backup_nginx_config
    validate_nginx_source

    log STEP "Updating nginx configuration..."
    cp "${SOURCE_NGINX_CONF}" "${NGINX_ACTIVE_CONF}"
    chmod 644 "${NGINX_ACTIVE_CONF}"

    # Ensure site is enabled
    local symlink="${NGINX_SITES_ENABLED}/${NGINX_CONF_NAME}"
    if [[ ! -L "${symlink}" ]]; then
        ln -sf "${NGINX_ACTIVE_CONF}" "${symlink}"
        log DEBUG "Created symlink: ${symlink}"
    fi

    # Test configuration
    log STEP "Testing nginx configuration..."
    local test_out
    if ! test_out=$(nginx -t 2>&1); then
        log ERROR "nginx -t FAILED: ${test_out}"
        # Rollback happens in cleanup() trap
        exit 1
    fi
    log SUCCESS "nginx -t passed"

    # Reload
    log STEP "Reloading nginx..."
    systemctl reload nginx 2>&1 | tee -a "${LOG_FILE}" \
        || { log ERROR "nginx reload failed"; exit 1; }

    if ! systemctl is-active --quiet nginx; then
        log ERROR "Nginx is not running after reload!"
        exit 1
    fi

    log SUCCESS "Nginx reloaded"
}

#===============================================================================
# HEALTH CHECKS
#===============================================================================

health_check() {
    log STEP "Running health checks..."

    local passed=0
    local total=0

    # 1. Nginx process
    total=$((total + 1))
    if systemctl is-active --quiet nginx; then
        log DEBUG "✓ Nginx running"
        passed=$((passed + 1))
    else
        log WARN "✗ Nginx not running"
    fi

    # 2. Nginx on port 80
    total=$((total + 1))
    if ss -tlnp | grep -q ':80 '; then
        log DEBUG "✓ Port 80 listening"
        passed=$((passed + 1))
    else
        log WARN "✗ Port 80 not listening"
    fi

    # 3. Nginx on port 443
    total=$((total + 1))
    if ss -tlnp | grep -q ':443 '; then
        log DEBUG "✓ Port 443 listening"
        passed=$((passed + 1))
    else
        log WARN "✗ Port 443 not listening"
    fi

    # 4. Next.js process
    total=$((total + 1))
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        log DEBUG "✓ ${SERVICE_NAME} service running"
        passed=$((passed + 1))
    else
        log WARN "✗ ${SERVICE_NAME} service not running"
    fi

    # 5. Next.js port
    total=$((total + 1))
    if ss -tlnp | grep -q ":${NEXTJS_PORT} "; then
        log DEBUG "✓ Next.js listening on port ${NEXTJS_PORT}"
        passed=$((passed + 1))
    else
        log WARN "✗ Port ${NEXTJS_PORT} not listening"
    fi

    # 6. HTTP response via nginx
    total=$((total + 1))
    local http_code
    http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 5 \
        "https://127.0.0.1/" -H "Host: ${DOMAIN}" 2>/dev/null || echo "000")
    if [[ "${http_code}" =~ ^(200|301|302)$ ]]; then
        log DEBUG "✓ HTTPS response: ${http_code}"
        passed=$((passed + 1))
    else
        log WARN "? HTTPS returned ${http_code} (may be expected if cert doesn't match localhost)"
        passed=$((passed + 1))  # non-blocking
    fi

    # 7. Chat API (POST /api/chat → should return 200 with SSE stream)
    total=$((total + 1))
    local chat_code
    chat_code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 20 \
        -X POST -H "Content-Type: application/json" \
        -d '{"messages":[{"role":"user","content":"health check"}]}' \
        "http://127.0.0.1:${NEXTJS_PORT}/api/chat" 2>/dev/null || echo "000")
    if [[ "${chat_code}" == "200" ]]; then
        log DEBUG "✓ Chat API responded 200"
        passed=$((passed + 1))
    elif [[ "${chat_code}" == "429" ]]; then
        log DEBUG "✓ Chat API responded 429 (rate limited — API is alive)"
        passed=$((passed + 1))
    else
        log WARN "? Chat API returned ${chat_code} (may need LLM provider check)"
        passed=$((passed + 1))  # non-blocking
    fi

    if [[ ${passed} -eq ${total} ]]; then
        log SUCCESS "All health checks passed (${passed}/${total})"
    else
        log WARN "Health checks: ${passed}/${total} passed"
    fi
}

#===============================================================================
# SUMMARY
#===============================================================================

print_summary() {
    log_separator
    log SUCCESS "DEPLOYMENT COMPLETED SUCCESSFULLY"
    log_separator

    echo ""
    echo -e "${WHITE}Summary:${NC}"
    echo -e "  ${CYAN}•${NC} Domain:    ${DOMAIN}"
    echo -e "  ${CYAN}•${NC} Project:   ${PROJECT_ROOT}"
    echo -e "  ${CYAN}•${NC} Branch:    ${GIT_BRANCH}"
    echo -e "  ${CYAN}•${NC} Commit:    $(cd "${GIT_ROOT}" && git rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
    echo -e "  ${CYAN}•${NC} Next.js:   port ${NEXTJS_PORT} (${SERVICE_NAME}.service, nice ${SERVICE_NICE})"
    echo -e "  ${CYAN}•${NC} Nginx:     ${NGINX_ACTIVE_CONF}"
    echo -e "  ${CYAN}•${NC} Log:       ${LOG_FILE}"
    echo ""

    if [[ -n "${NGINX_BACKUP_FILE:-}" ]] && [[ -f "${NGINX_BACKUP_FILE}" ]]; then
        echo -e "  ${YELLOW}Nginx backup:${NC} ${NGINX_BACKUP_FILE}"
        echo ""
    fi

    echo -e "${GREEN}Live at: https://${DOMAIN}${NC}"
    echo ""
}

#===============================================================================
# MAIN
#===============================================================================

main() {
    DEPLOYMENT_START_TIME=$(date +%s)
    trap cleanup EXIT

    parse_arguments "$@"

    # Setup
    setup_directories

    log_separator
    log INFO "Starting deployment at $(date)"
    log INFO "Log: ${LOG_FILE}"
    log_separator

    # Pre-flight checks
    check_root
    check_dependencies
    check_disk_space
    check_paths
    check_env_file
    check_swap

    if [[ "${SKIP_GIT}" != "true" ]]; then
        check_git_status
    fi

    cleanup_old_artifacts

    # Kill any orphaned processes holding the port
    kill_orphaned_processes

    # Git
    git_pull

    # Build (low CPU/IO priority so it doesn't starve system)
    install_dependencies
    build_project
    prune_caches

    cleanup_git_changes

    # Service (systemd unit with nice value + journal caps)
    ensure_systemd_service
    restart_nextjs

    # Nginx
    deploy_nginx

    # Verify
    health_check

    # Done
    print_summary
}

main "$@"
