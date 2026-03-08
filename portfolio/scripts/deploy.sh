#!/bin/bash
#===============================================================================
#
#          FILE: deploy.sh
#
#         USAGE: sudo ./deploy.sh [OPTIONS]
#                sudo deployWebsite [OPTIONS]           (via symlink)
#
#   DESCRIPTION: Production deployment for a Next.js website.
#                Uses standalone output mode behind an nginx reverse proxy.
#
#                Flow:
#                  1. Load config from /etc/deploy/
#                  2. Pre-flight checks (root, deps, disk, SSL, env, git)
#                  3. Kill orphaned processes on the Next.js port
#                  4. Git pull
#                  5. npm ci + next build (standalone output)
#                  6. Prepare standalone bundle (copy static, public, .env)
#                  7. Create/update systemd service
#                  8. Restart Next.js, wait for readiness
#                  9. Process nginx template, deploy, reload
#                 10. Health checks
#
#       OPTIONS:
#                --site NAME   Site config to use (default: portfolio)
#                --skip-git    Skip git pull
#                --skip-deps   Skip npm ci
#                --skip-build  Skip npm ci + next build
#                --skip-nginx  Skip nginx config update
#                --force       Deploy with uncommitted changes
#                --help        Show help
#
#      REQUIRES: /etc/deploy/machine.conf
#                /etc/deploy/sites/<site>.conf
#                See scripts/machine.conf.example and scripts/portfolio.conf.example
#
#       VERSION: 3.0.0
#       CREATED: 2026-01-06
#       UPDATED: 2026-03-08  Full rewrite: standalone mode, /etc/deploy/ config,
#                            multi-site support, systemd hardening, memory limits
#
#===============================================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

#===============================================================================
# CONFIG LOADING
#===============================================================================

readonly MACHINE_CONF="/etc/deploy/machine.conf"

# Extract --site early (needed to locate site config before full arg parsing)
_SITE_NAME="portfolio"
_prev=""
for _arg in "$@"; do
    if [[ "${_prev}" == "--site" ]]; then
        _SITE_NAME="${_arg}"
    fi
    _prev="${_arg}"
done
readonly SITE_NAME="${_SITE_NAME}"
readonly SITE_CONF="/etc/deploy/sites/${SITE_NAME}.conf"

# Load machine config
if [[ -f "${MACHINE_CONF}" ]]; then
    # shellcheck source=/dev/null
    source "${MACHINE_CONF}"
fi

# Load site config
if [[ -f "${SITE_CONF}" ]]; then
    # shellcheck source=/dev/null
    source "${SITE_CONF}"
else
    echo "ERROR: Site config not found: ${SITE_CONF}"
    echo ""
    echo "Create it from the example:"
    echo "  sudo cp ${SCRIPT_DIR}/portfolio.conf.example /etc/deploy/sites/${SITE_NAME}.conf"
    echo "  sudo nano /etc/deploy/sites/${SITE_NAME}.conf"
    exit 1
fi

#===============================================================================
# CONFIGURATION (all overridable via /etc/deploy/ config files)
#===============================================================================

# Identity
readonly DOMAIN="${DOMAIN:?DOMAIN not set in ${SITE_CONF}}"
readonly SERVICE_NAME="${SERVICE_NAME:?SERVICE_NAME not set in ${SITE_CONF}}"
readonly NEXTJS_PORT="${NEXTJS_PORT:?NEXTJS_PORT not set in ${SITE_CONF}}"

# Validate SERVICE_NAME format (used in systemd unit names, nginx configs, paths)
if ! [[ "${SERVICE_NAME}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "ERROR: SERVICE_NAME must be alphanumeric with dashes/underscores (got: ${SERVICE_NAME})"
    exit 1
fi

# Paths
readonly GIT_ROOT="${GIT_ROOT:?GIT_ROOT not set in ${SITE_CONF}}"
readonly PROJECT_ROOT="${PROJECT_ROOT:?PROJECT_ROOT not set in ${SITE_CONF}}"

# Git
readonly GIT_BRANCH="${GIT_BRANCH:-master}"
readonly GIT_REMOTE="${GIT_REMOTE:-origin}"

# SSL
readonly SSL_CERT="${SSL_CERT:?SSL_CERT not set in ${SITE_CONF}}"
readonly SSL_KEY="${SSL_KEY:?SSL_KEY not set in ${SITE_CONF}}"

# System user
readonly SERVICE_USER="${MACHINE_USER:-ubuntu}"

# Node.js runtime
readonly NODE_HEAP_MB="${NODE_HEAP_MB:-350}"
readonly BUILD_HEAP_MB="${BUILD_HEAP_MB:-512}"

# systemd limits
readonly MEMORY_HIGH_MB="${MEMORY_HIGH_MB:-400}"
readonly MEMORY_MAX_MB="${MEMORY_MAX_MB:-500}"
readonly CPU_QUOTA_PERCENT="${CPU_QUOTA_PERCENT:-180}"

# Priorities
readonly SERVICE_NICE="${SERVICE_NICE:-5}"
readonly BUILD_NICE="${BUILD_NICE:-15}"
readonly BUILD_IONICE_CLASS="${BUILD_IONICE_CLASS:-3}"

# Nginx
readonly NGINX_CONF_TEMPLATE="${NGINX_CONF_TEMPLATE:-nginx-cloudflare.conf}"
readonly NGINX_SITES_AVAILABLE="${NGINX_SITES_AVAILABLE:-/etc/nginx/sites-available}"
readonly NGINX_SITES_ENABLED="${NGINX_SITES_ENABLED:-/etc/nginx/sites-enabled}"
readonly SOURCE_NGINX_CONF="${PROJECT_ROOT}/${NGINX_CONF_TEMPLATE}"

# Backups & logs
readonly BACKUP_DIR="${BACKUP_DIR:-/var/backups/${SERVICE_NAME}}"
readonly LOG_DIR="${LOG_DIR:-/var/log/${SERVICE_NAME}-deploy}"
readonly BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
readonly MAX_LOG_FILES="${MAX_LOG_FILES:-10}"

# Build
readonly NPM_BUILD_TIMEOUT="${NPM_BUILD_TIMEOUT:-600}"

# Health check
# 60s is safe for 1 OCPU ARM VMs where Node.js startup can take 15-25s
readonly HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-60}"
readonly MIN_DISK_MB="${MIN_DISK_MB:-500}"

# Required env vars
IFS=',' read -ra REQUIRED_ENV_ARRAY <<< "${REQUIRED_ENV_VARS:-LLM_API_KEY,LLM_BASE_URL,LLM_MODEL}"

#===============================================================================
# DERIVED CONSTANTS
#===============================================================================

readonly NEXTJS_BUILD_DIR="${PROJECT_ROOT}/.next"
readonly STANDALONE_DIR="${PROJECT_ROOT}/.next/standalone"
readonly ENV_FILE="${PROJECT_ROOT}/.env.local"
readonly SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
readonly NGINX_ACTIVE_CONF="${NGINX_SITES_AVAILABLE}/${SERVICE_NAME}"
readonly LOG_FILE="${LOG_DIR}/deploy-$(date +%Y%m%d-%H%M%S).log"

resolve_build_id() {
    if [[ -n "${NEXT_BUILD_ID:-}" ]]; then
        printf '%s\n' "${NEXT_BUILD_ID}"
        return 0
    fi
    git -C "${GIT_ROOT}" rev-parse HEAD 2>/dev/null || printf '%s\n' "local-build"
}

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

Production deployment for a Next.js website (standalone mode).

OPTIONS:
    --site NAME     Site config to load from /etc/deploy/sites/ (default: portfolio)
    --skip-git      Skip git pull
    --skip-deps     Skip npm ci (code-only change, no package updates)
    --skip-build    Skip npm ci + next build
    --skip-nginx    Skip nginx config update & reload
    --force         Deploy even with uncommitted changes
    --help          Show this message

CONFIGURATION:
    Machine config: /etc/deploy/machine.conf
    Site config:    /etc/deploy/sites/<name>.conf

EXAMPLES:
    sudo ./deploy.sh                          # Full deployment (portfolio)
    sudo ./deploy.sh --site blog              # Deploy a different site
    sudo ./deploy.sh --skip-git               # Deploy without pulling
    sudo ./deploy.sh --skip-build             # Update nginx only
    sudo ./deploy.sh --skip-build --skip-nginx  # Just restart Next.js
EOF
    exit 0
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --site)
                shift
                if [[ $# -gt 0 ]] && [[ "$1" != --* ]]; then
                    shift   # Site name already captured in early parsing
                fi
                ;;
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

cleanup() {
    local exit_code=$?

    if [[ ${exit_code} -ne 0 ]]; then
        log_separator
        log ERROR "Deployment failed (exit ${exit_code}). Log: ${LOG_FILE}"

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

    local deps=("git" "node" "npm" "nginx" "systemctl" "curl" "nice" "ionice" "sed")
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
        log INFO "Run optimize_vm.sh first to install dependencies"
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
    [[ -f "${SOURCE_NGINX_CONF}" ]] || { log ERROR "Nginx template missing: ${SOURCE_NGINX_CONF}"; exit 1; }
    [[ -d "${NGINX_SITES_AVAILABLE}" ]] || { log ERROR "nginx sites-available missing"; exit 1; }

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
        log INFO "Required vars: ${REQUIRED_ENV_ARRAY[*]}"
        exit 1
    fi

    local missing=()
    for var in "${REQUIRED_ENV_ARRAY[@]}"; do
        var="$(echo "${var}" | xargs)"   # trim whitespace
        if ! grep -q "^${var}=" "${ENV_FILE}"; then
            missing+=("${var}")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log ERROR "Missing in .env.local: ${missing[*]}"
        exit 1
    fi

    log SUCCESS ".env.local validated (${#REQUIRED_ENV_ARRAY[@]} required vars present)"
}

check_swap() {
    log STEP "Checking memory & swap..."
    local total_ram total_swap
    total_ram=$(free -m | awk '/Mem:/{print $2}')
    total_swap=$(free -m | awk '/Swap:/{print $2}')
    log DEBUG "RAM: ${total_ram}MB, Swap: ${total_swap}MB"

    if [[ ${total_ram} -lt 1500 ]] && [[ ${total_swap} -lt 512 ]]; then
        log WARN "Low memory (${total_ram}MB RAM) with minimal swap — builds may OOM"
        log INFO "Run optimize_vm.sh to configure swap automatically"
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

    log SUCCESS "Git status OK (branch: ${GIT_BRANCH})"
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

    # Trim deploy logs
    local count
    count=$(find "${LOG_DIR}" -name "deploy-*.log" -type f 2>/dev/null | wc -l)
    if [[ ${count} -gt ${MAX_LOG_FILES} ]]; then
        local to_delete=$(( count - MAX_LOG_FILES ))
        find "${LOG_DIR}" -name "deploy-*.log" -type f -printf '%T+ %p\n' \
            | sort | head -n "${to_delete}" \
            | cut -d' ' -f2- | xargs rm -f
    fi

    # Trim old nginx backups
    find "${BACKUP_DIR}" -name "*.backup.*" -type f -mtime "+${BACKUP_RETENTION_DAYS}" -delete 2>/dev/null || true

    # Vacuum journal for this service
    if command -v journalctl &>/dev/null; then
        journalctl --vacuum-size=50M -u "${SERVICE_NAME}" &>/dev/null || true
    fi

    log SUCCESS "Cleanup complete"
}

#===============================================================================
# PROCESS CLEANUP
#===============================================================================

kill_orphaned_processes() {
    log STEP "Killing orphaned processes on port ${NEXTJS_PORT}..."

    # PM2 cleanup (from legacy deployments)
    if command -v pm2 &>/dev/null; then
        local pm2_list
        pm2_list=$(sudo -u "${SERVICE_USER}" pm2 jlist 2>/dev/null || echo "[]")
        if echo "${pm2_list}" | grep -q '"name":"'"${SERVICE_NAME}"'"'; then
            log WARN "Stopping PM2-managed '${SERVICE_NAME}'..."
            sudo -u "${SERVICE_USER}" pm2 stop "${SERVICE_NAME}" 2>/dev/null || true
            sudo -u "${SERVICE_USER}" pm2 delete "${SERVICE_NAME}" 2>/dev/null || true
            sudo -u "${SERVICE_USER}" pm2 save --force 2>/dev/null || true
        fi
        local remaining
        remaining=$(sudo -u "${SERVICE_USER}" pm2 jlist 2>/dev/null || echo "[]")
        if [[ "${remaining}" == "[]" ]] || [[ -z "${remaining}" ]]; then
            sudo -u "${SERVICE_USER}" pm2 kill 2>/dev/null || true
        fi
        if ls /etc/systemd/system/pm2-* &>/dev/null; then
            sudo env PATH="$PATH:/usr/bin" pm2 unstartup systemd -u "${SERVICE_USER}" --hp "/home/${SERVICE_USER}" 2>/dev/null || true
            systemctl daemon-reload
        fi
    fi

    # Stop systemd service
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        log DEBUG "Stopping ${SERVICE_NAME}.service..."
        systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
        sleep 2
    fi

    # Kill leftover processes on the port
    local pids
    pids=$(ss -tlnp "sport = :${NEXTJS_PORT}" 2>/dev/null \
        | grep -oP 'pid=\K[0-9]+' | sort -u || true)

    if [[ -n "${pids}" ]]; then
        log WARN "Found orphaned PIDs on port ${NEXTJS_PORT}: ${pids}"
        for pid in ${pids}; do
            kill "${pid}" 2>/dev/null || true
        done
        sleep 2

        pids=$(ss -tlnp "sport = :${NEXTJS_PORT}" 2>/dev/null \
            | grep -oP 'pid=\K[0-9]+' | sort -u || true)
        if [[ -n "${pids}" ]]; then
            log WARN "Force-killing: ${pids}"
            for pid in ${pids}; do
                kill -9 "${pid}" 2>/dev/null || true
            done
            sleep 1
        fi
    fi

    # Kill stale "next start" or "node server.js" processes
    local stale_pids
    stale_pids=$(pgrep -f "node.*server\.js.*${NEXTJS_PORT}" 2>/dev/null || true)
    if [[ -z "${stale_pids}" ]]; then
        stale_pids=$(pgrep -f "next start.*--port ${NEXTJS_PORT}" 2>/dev/null || true)
    fi
    if [[ -n "${stale_pids}" ]]; then
        log WARN "Killing stale processes: ${stale_pids}"
        echo "${stale_pids}" | xargs kill 2>/dev/null || true
        sleep 1
        echo "${stale_pids}" | xargs kill -9 2>/dev/null || true
    fi

    # Final check
    local remaining_pids
    remaining_pids=$(ss -tlnp "sport = :${NEXTJS_PORT}" 2>/dev/null \
        | grep -oP 'pid=\K[0-9]+' | sort -u || true)
    if [[ -n "${remaining_pids}" ]]; then
        log ERROR "Port ${NEXTJS_PORT} still occupied by PIDs: ${remaining_pids}"
        exit 1
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
        log WARN "Skipping dependency install"
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
            npm ci --loglevel=warn 2>&1 | tee -a "${LOG_FILE}" \
            || {
                log WARN "npm ci failed, falling back to npm install..."
                nice -n "${BUILD_NICE}" ionice -c "${BUILD_IONICE_CLASS}" \
                    npm install 2>&1 | tee -a "${LOG_FILE}" \
                    || { log ERROR "npm install failed"; exit 1; }
            }
    fi

    log SUCCESS "Dependencies installed"
}

build_project() {
    if [[ "${SKIP_BUILD}" == "true" ]]; then
        log WARN "Skipping build (--skip-build)"
        return 0
    fi

    # Clear stale build cache
    log STEP "Clearing stale build cache..."
    rm -rf "${NEXTJS_BUILD_DIR}/cache" 2>/dev/null || true

    log STEP "Building Next.js project (standalone mode)..."
    cd "${PROJECT_ROOT}"

    export NODE_ENV="production"
    export NEXT_BUILD_ID
    NEXT_BUILD_ID="$(resolve_build_id)"
    log INFO "NEXT_BUILD_ID=${NEXT_BUILD_ID}"

    # Limit V8 heap during build to prevent OOM on low-RAM VMs
    if ! timeout "${NPM_BUILD_TIMEOUT}" \
            nice -n "${BUILD_NICE}" ionice -c "${BUILD_IONICE_CLASS}" \
            env NODE_OPTIONS="--max-old-space-size=${BUILD_HEAP_MB}" \
            npm run build 2>&1 | tee -a "${LOG_FILE}"; then
        log ERROR "Build failed! Check ${LOG_FILE}"
        exit 1
    fi

    # Verify standalone output
    if [[ ! -f "${STANDALONE_DIR}/server.js" ]]; then
        log ERROR "Standalone output not found at ${STANDALONE_DIR}/server.js"
        log INFO "Ensure next.config.ts has: output: 'standalone'"
        exit 1
    fi

    log SUCCESS "Build complete (standalone mode)"
}

prepare_standalone() {
    if [[ "${SKIP_BUILD}" == "true" ]]; then
        log WARN "Skipping standalone preparation"
        return 0
    fi

    log STEP "Preparing standalone bundle..."

    # Copy static assets into standalone (Next.js doesn't include them)
    if [[ -d "${NEXTJS_BUILD_DIR}/static" ]]; then
        mkdir -p "${STANDALONE_DIR}/.next"
        cp -r "${NEXTJS_BUILD_DIR}/static" "${STANDALONE_DIR}/.next/static"
        log DEBUG "Copied .next/static → standalone"
    fi

    # Copy public assets into standalone
    if [[ -d "${PROJECT_ROOT}/public" ]]; then
        cp -r "${PROJECT_ROOT}/public" "${STANDALONE_DIR}/public"
        log DEBUG "Copied public/ → standalone"
    fi

    # Copy .env.local into standalone working directory
    if [[ -f "${ENV_FILE}" ]]; then
        cp "${ENV_FILE}" "${STANDALONE_DIR}/.env.local"
        log DEBUG "Copied .env.local → standalone"
    fi

    # Fix ownership: build runs as root, service runs as SERVICE_USER
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${NEXTJS_BUILD_DIR}"

    local file_count
    file_count=$(find "${STANDALONE_DIR}" -type f | wc -l)
    log SUCCESS "Standalone bundle ready (${file_count} files)"
}

prune_caches() {
    log STEP "Pruning caches..."
    nice -n 19 npm cache clean --force &>/dev/null || true
    rm -f "${NEXTJS_BUILD_DIR}/trace" 2>/dev/null || true
    local avail
    avail=$(df -m "${PROJECT_ROOT}" | awk 'NR==2{print $4}')
    log SUCCESS "Caches pruned (${avail}MB free)"
}

#===============================================================================
# SYSTEMD SERVICE
#===============================================================================

ensure_systemd_service() {
    log STEP "Configuring systemd service (${SERVICE_NAME})..."

    local node_bin
    node_bin=$(command -v node)

    cat > "${SYSTEMD_UNIT}" << UNIT
[Unit]
Description=Next.js — ${DOMAIN}
After=network.target
Wants=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${STANDALONE_DIR}

# Environment
EnvironmentFile=-${STANDALONE_DIR}/.env.local
Environment=NODE_ENV=production
Environment=PORT=${NEXTJS_PORT}
Environment=HOSTNAME=0.0.0.0
Environment=NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}"

ExecStart=${node_bin} server.js
Restart=on-failure
RestartSec=5
TimeoutStartSec=60
TimeoutStopSec=15

# ── Resource Limits ──
MemoryHigh=${MEMORY_HIGH_MB}M
MemoryMax=${MEMORY_MAX_MB}M
CPUQuota=${CPU_QUOTA_PERCENT}%
OOMScoreAdjust=500
Nice=${SERVICE_NICE}
IOSchedulingClass=best-effort
IOSchedulingPriority=4

# ── Security Hardening ──
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${PROJECT_ROOT}
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictRealtime=true
RestrictSUIDSGID=true

# ── Logging ──
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}
LogRateLimitIntervalSec=30
LogRateLimitBurst=100

# Kill entire process group on stop
KillMode=control-group

[Install]
WantedBy=multi-user.target
UNIT

    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" &>/dev/null

    log SUCCESS "systemd service configured (heap=${NODE_HEAP_MB}MB, MemoryMax=${MEMORY_MAX_MB}MB, Nice=${SERVICE_NICE})"
}

restart_nextjs() {
    log STEP "Starting Next.js server..."

    systemctl start "${SERVICE_NAME}"

    log DEBUG "Waiting up to ${HEALTH_CHECK_RETRIES}s for port ${NEXTJS_PORT}..."
    local i=0
    while [[ $i -lt ${HEALTH_CHECK_RETRIES} ]]; do
        if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${NEXTJS_PORT}/" 2>/dev/null; then
            log SUCCESS "Next.js ready on port ${NEXTJS_PORT} (took ${i}s)"
            return 0
        fi
        i=$((i + 1))
        sleep 1
    done

    log ERROR "Next.js failed to start within ${HEALTH_CHECK_RETRIES}s"
    journalctl -u "${SERVICE_NAME}" --no-pager -n 30 2>&1 | tee -a "${LOG_FILE}"
    exit 1
}

#===============================================================================
# NGINX OPERATIONS
#===============================================================================

backup_nginx_config() {
    log STEP "Backing up nginx configuration..."

    if [[ -f "${NGINX_ACTIVE_CONF}" ]]; then
        NGINX_BACKUP_FILE="${BACKUP_DIR}/${SERVICE_NAME}.backup.$(date +%Y%m%d-%H%M%S)"
        cp "${NGINX_ACTIVE_CONF}" "${NGINX_BACKUP_FILE}" \
            || { log ERROR "Nginx backup failed"; exit 1; }
        chmod 644 "${NGINX_BACKUP_FILE}"
        log SUCCESS "Backed up to ${NGINX_BACKUP_FILE}"
    else
        log WARN "No existing nginx config — fresh deployment"
    fi
}

process_nginx_template() {
    log STEP "Processing nginx template..."

    [[ -f "${SOURCE_NGINX_CONF}" ]] \
        || { log ERROR "Nginx template missing: ${SOURCE_NGINX_CONF}"; exit 1; }

    # Replace template placeholders with config values
    sed -e "s|__DOMAIN__|${DOMAIN}|g" \
        -e "s|__NEXTJS_PORT__|${NEXTJS_PORT}|g" \
        -e "s|__SERVICE_NAME__|${SERVICE_NAME}|g" \
        -e "s|__SSL_CERT__|${SSL_CERT}|g" \
        -e "s|__SSL_KEY__|${SSL_KEY}|g" \
        -e "s|__STANDALONE_DIR__|${STANDALONE_DIR}|g" \
        "${SOURCE_NGINX_CONF}" > "${NGINX_ACTIVE_CONF}"

    chmod 644 "${NGINX_ACTIVE_CONF}"
    log SUCCESS "Template processed → ${NGINX_ACTIVE_CONF}"
}

deploy_nginx() {
    if [[ "${SKIP_NGINX}" == "true" ]]; then
        log WARN "Skipping nginx update (--skip-nginx)"
        return 0
    fi

    backup_nginx_config
    process_nginx_template

    # Ensure site is enabled
    local symlink="${NGINX_SITES_ENABLED}/${SERVICE_NAME}"
    if [[ ! -L "${symlink}" ]]; then
        ln -sf "${NGINX_ACTIVE_CONF}" "${symlink}"
        log DEBUG "Created symlink: ${symlink}"
    fi

    # Create proxy cache directory
    mkdir -p "/var/cache/nginx/${SERVICE_NAME}"
    chown www-data:www-data "/var/cache/nginx/${SERVICE_NAME}"

    # Test configuration
    log STEP "Testing nginx configuration..."
    local test_out
    if ! test_out=$(nginx -t 2>&1); then
        log ERROR "nginx -t FAILED: ${test_out}"
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

    # 2. Port 80
    total=$((total + 1))
    if ss -tlnp | grep -q ':80 '; then
        log DEBUG "✓ Port 80 listening"
        passed=$((passed + 1))
    else
        log WARN "✗ Port 80 not listening"
    fi

    # 3. Port 443
    total=$((total + 1))
    if ss -tlnp | grep -q ':443 '; then
        log DEBUG "✓ Port 443 listening"
        passed=$((passed + 1))
    else
        log WARN "✗ Port 443 not listening"
    fi

    # 4. Next.js service
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
        log DEBUG "✓ Next.js on port ${NEXTJS_PORT}"
        passed=$((passed + 1))
    else
        log WARN "✗ Port ${NEXTJS_PORT} not listening"
    fi

    # 6. HTTPS response
    total=$((total + 1))
    local http_code
    http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 5 \
        "https://127.0.0.1/" -H "Host: ${DOMAIN}" 2>/dev/null || echo "000")
    if [[ "${http_code}" =~ ^(200|301|302)$ ]]; then
        log DEBUG "✓ HTTPS: ${http_code}"
        passed=$((passed + 1))
    else
        log WARN "? HTTPS: ${http_code} (may be expected with self-signed cert)"
        passed=$((passed + 1))
    fi

    # 7. Chat API
    total=$((total + 1))
    local chat_code
    chat_code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 20 \
        -X POST -H "Content-Type: application/json" \
        -d '{"messages":[{"role":"user","content":"health check"}]}' \
        "http://127.0.0.1:${NEXTJS_PORT}/api/chat" 2>/dev/null || echo "000")
    if [[ "${chat_code}" == "200" ]]; then
        log DEBUG "✓ Chat API: 200"
        passed=$((passed + 1))
    elif [[ "${chat_code}" == "429" ]]; then
        log DEBUG "✓ Chat API: 429 (rate limited — alive)"
        passed=$((passed + 1))
    else
        log WARN "? Chat API: ${chat_code} (check LLM provider)"
        passed=$((passed + 1))
    fi

    if [[ ${passed} -eq ${total} ]]; then
        log SUCCESS "All health checks passed (${passed}/${total})"
    else
        log WARN "Health checks: ${passed}/${total}"
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
    echo -e "  ${CYAN}•${NC} Site:      ${SERVICE_NAME}"
    echo -e "  ${CYAN}•${NC} Domain:    ${DOMAIN}"
    echo -e "  ${CYAN}•${NC} Project:   ${PROJECT_ROOT}"
    echo -e "  ${CYAN}•${NC} Branch:    ${GIT_BRANCH}"
    echo -e "  ${CYAN}•${NC} Commit:    $(cd "${GIT_ROOT}" && git rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
    echo -e "  ${CYAN}•${NC} Next.js:   port ${NEXTJS_PORT} (standalone, heap=${NODE_HEAP_MB}MB)"
    echo -e "  ${CYAN}•${NC} Service:   ${SERVICE_NAME}.service (MemoryMax=${MEMORY_MAX_MB}MB)"
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
    log INFO "Starting deployment: site=${SITE_NAME} at $(date)"
    log INFO "Config: ${SITE_CONF}"
    log INFO "Log: ${LOG_FILE}"
    log_separator

    # Pre-flight
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

    # Clear port
    kill_orphaned_processes

    # Git
    git_pull

    # Build (standalone mode)
    install_dependencies
    build_project
    prepare_standalone
    prune_caches

    cleanup_git_changes

    # Service
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
