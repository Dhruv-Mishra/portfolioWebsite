#!/bin/bash
#===============================================================================
#
#          FILE: deploy.sh
#
#         USAGE: sudo ./deploy.sh [OPTIONS]
#                sudo deployWebsite [OPTIONS]                    (via symlink, legacy)
#                sudo bash /path/to/release/.deploy/deploy.sh \
#                         --release-dir /path/to/release \
#                         --sha <git-sha> \
#                         --site portfolio                        (artifact mode)
#                sudo bash /tmp/deploy-kit/deploy.sh \
#                         --image ghcr.io/owner/repo@sha256:... \
#                         --sha <git-sha> \
#                         --site portfolio                        (image mode)
#
#   DESCRIPTION: Production deployment for a Next.js website.
#                Supports two modes:
#
#                1. IMAGE MODE (--image / --sha):
#                   Pulls an immutable Docker image, extracts nginx-visible
#                   static assets from that image into /opt/portfolio/current,
#                   and runs the app container under systemd. This is the
#                   containerized production path for new VMs.
#
#                2. ARTIFACT MODE (--release-dir / --sha):
#                   A pre-built standalone bundle is already on disk (shipped
#                   via GitHub Actions artifact + scp). Skips git / npm / build
#                   entirely. Uses /opt/portfolio/{config,releases,current}
#                   layout with atomic symlink swap and health-check-gated
#                   rollback. Kept as a non-Docker fallback.
#
#                3. LEGACY MODE (no --release-dir / --image):
#                   Full git pull + npm ci + next build on the VM. Kept as a
#                   safety net for emergency recovery; not the normal path.
#
#       OPTIONS:
#                --release-dir DIR   [artifact] Path to extracted bundle
#                --image IMAGE       [image]    Immutable Docker image ref
#                --sha SHA           [image/artifact] Git SHA identifying this build
#                --site NAME         Site config to use (default: portfolio)
#                --skip-git          [legacy]   Skip git pull
#                --skip-deps         [legacy]   Skip npm ci
#                --skip-build        [legacy]   Skip npm ci + next build
#                --skip-nginx        Skip nginx config update
#                --force             [legacy]   Deploy with uncommitted changes
#                --help              Show help
#
#      REQUIRES: /etc/deploy/machine.conf
#                /etc/deploy/sites/<site>.conf
#
#       VERSION: 4.0.0
#       UPDATED: 2026-04-18  v4: artifact-based deploys with /opt/portfolio
#                            layout, atomic swap, health-gated rollback.
#                            Legacy git-based mode retained as safety net.
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

# Legacy paths (still referenced for first-run migration + legacy mode)
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

# Docker image mode
readonly DOCKER_CONTAINER_NAME="${DOCKER_CONTAINER_NAME:-${SERVICE_NAME}}"
readonly DOCKER_CACHE_UID="${DOCKER_CACHE_UID:-1000}"
readonly DOCKER_CACHE_GID="${DOCKER_CACHE_GID:-1000}"

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
readonly NGINX_CONF_D="${NGINX_CONF_D:-/etc/nginx/conf.d}"

# Backups & logs
readonly BACKUP_DIR="${BACKUP_DIR:-/var/backups/${SERVICE_NAME}}"
readonly LOG_DIR="${LOG_DIR:-/var/log/${SERVICE_NAME}-deploy}"
readonly BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
readonly MAX_LOG_FILES="${MAX_LOG_FILES:-10}"

# Build
readonly NPM_BUILD_TIMEOUT="${NPM_BUILD_TIMEOUT:-600}"

# Health check — 60s is safe for 1 OCPU ARM VMs where Node.js startup can take 15-25s
readonly HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-60}"
readonly MIN_DISK_MB="${MIN_DISK_MB:-500}"

# Number of releases to retain (including the current one).
# 2 is the minimum that allows rollback. 3+ gives more rollback depth at disk cost.
# On 1-GB VMs with ~200MB per release, keep it tight.
readonly RELEASE_RETENTION_COUNT="${RELEASE_RETENTION_COUNT:-2}"

# Required env vars
IFS=',' read -ra REQUIRED_ENV_ARRAY <<< "${REQUIRED_ENV_VARS-}"

#===============================================================================
# DERIVED CONSTANTS — ARTIFACT LAYOUT
#===============================================================================

readonly DEPLOY_ROOT="/opt/${SERVICE_NAME}"
readonly DEPLOY_CONFIG_DIR="${DEPLOY_ROOT}/config"
readonly DEPLOY_RELEASES_DIR="${DEPLOY_ROOT}/releases"
readonly DEPLOY_CURRENT_LINK="${DEPLOY_ROOT}/current"
readonly DEPLOY_ENV_FILE="${DEPLOY_CONFIG_DIR}/.env.local"
readonly DEPLOY_LOCK_FILE="/var/lock/${SERVICE_NAME}-deploy.lock"

# Legacy paths (for first-run migration + backward compat)
readonly LEGACY_STANDALONE_DIR="${PROJECT_ROOT}/.next/standalone"
readonly LEGACY_ENV_FILE="${PROJECT_ROOT}/.env.local"
readonly LEGACY_STANDALONE_ENV_FILE="${LEGACY_STANDALONE_DIR}/.env.local"

# Configs
readonly SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
readonly NGINX_ACTIVE_CONF="${NGINX_SITES_AVAILABLE}/${SERVICE_NAME}"
readonly NGINX_ZONES_CONF="${NGINX_CONF_D}/${SERVICE_NAME}-zones.conf"
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

MODE="legacy"              # "artifact" | "image" | "legacy"
RELEASE_DIR=""             # set in image/artifact mode
RELEASE_SHA=""             # set in image/artifact mode
DOCKER_IMAGE=""             # set in image mode

SKIP_GIT=false
SKIP_DEPS=false
SKIP_BUILD=false
SKIP_NGINX=false
FORCE_DEPLOY=false
DEPLOYMENT_START_TIME=""

# Rollback state — captured BEFORE mutations so cleanup() can restore
ROLLBACK_SYSTEMD_BACKUP=""
ROLLBACK_NGINX_BACKUP=""
ROLLBACK_PREV_SHA=""
ROLLBACK_SYSTEMD_ACTIVATED=false
ROLLBACK_SYMLINK_FLIPPED=false
ROLLBACK_NGINX_ACTIVATED=false
ROLLBACK_PREV_DOCKER_IMAGE=""

# Staging files (written before atomic activation)
STAGED_SYSTEMD_UNIT=""
STAGED_NGINX_CONF=""

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
# ARG PARSING
#===============================================================================

show_help() {
    cat << 'EOF'
Usage:
    Image mode (containerized production path — invoked by deploy.yml):
        sudo bash <kit>/deploy.sh --image <image-ref> --sha <sha> --site <name>

  Artifact mode (production path — invoked by deploy.yml from within the tarball):
    sudo bash <release>/.deploy/deploy.sh --release-dir <release> --sha <sha> --site <name>

  Legacy mode (emergency recovery only — runs full build on VM):
    sudo deployWebsite [--site NAME] [--skip-git|--skip-deps|--skip-build|--skip-nginx|--force]

OPTIONS
  --release-dir DIR   Artifact mode: path to extracted standalone bundle
    --image IMAGE       Image mode: immutable Docker image ref or digest
    --sha SHA           Image/artifact mode: git SHA identifying this build
  --site NAME         Site config in /etc/deploy/sites/ (default: portfolio)
  --skip-git          (legacy) Skip git pull
  --skip-deps         (legacy) Skip npm ci
  --skip-build        (legacy) Skip npm ci + next build
  --skip-nginx        Skip nginx config update & reload
  --force             (legacy) Deploy even with uncommitted changes
  --help, -h          Show this help

CONFIGURATION
  Machine config: /etc/deploy/machine.conf
  Site config:    /etc/deploy/sites/<name>.conf

LAYOUT (image/artifact mode)
  /opt/<service>/config/.env.local       — secrets, survives deploys
  /opt/<service>/releases/<sha>/         — one dir per release, auto-trimmed
  /opt/<service>/current -> releases/X   — atomic symlink flipped at deploy time
EOF
    exit 0
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --site)
                # Already captured in early parsing; skip value
                shift
                if [[ $# -gt 0 ]] && [[ "$1" != --* ]]; then
                    shift
                fi
                ;;
            --release-dir)
                RELEASE_DIR="${2:-}"
                if [[ -z "${RELEASE_DIR}" ]] || [[ "${RELEASE_DIR}" == --* ]]; then
                    log ERROR "--release-dir requires a path"
                    exit 1
                fi
                shift 2
                ;;
            --sha)
                RELEASE_SHA="${2:-}"
                if [[ -z "${RELEASE_SHA}" ]] || [[ "${RELEASE_SHA}" == --* ]]; then
                    log ERROR "--sha requires a value"
                    exit 1
                fi
                shift 2
                ;;
            --image)
                DOCKER_IMAGE="${2:-}"
                if [[ -z "${DOCKER_IMAGE}" ]] || [[ "${DOCKER_IMAGE}" == --* ]]; then
                    log ERROR "--image requires an image reference"
                    exit 1
                fi
                if [[ "${DOCKER_IMAGE}" != *@sha256:* ]]; then
                    log ERROR "--image must be an immutable digest ref (expected repo@sha256:..., got: ${DOCKER_IMAGE})"
                    exit 1
                fi
                shift 2
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

    if [[ -n "${RELEASE_DIR}" ]] && [[ -n "${DOCKER_IMAGE}" ]]; then
        log ERROR "Use either --release-dir or --image, not both"
        exit 1
    fi

    # Dispatch: image mode iff --image given; artifact mode iff --release-dir given
    if [[ -n "${DOCKER_IMAGE}" ]]; then
        MODE="image"
        if [[ -z "${RELEASE_SHA}" ]]; then
            log ERROR "--image requires --sha"
            exit 1
        fi
    elif [[ -n "${RELEASE_DIR}" ]]; then
        MODE="artifact"
        if [[ -z "${RELEASE_SHA}" ]]; then
            log ERROR "--release-dir requires --sha"
            exit 1
        fi
        # Normalize & validate — use an explicit if to avoid pipeline precedence
        # traps under set -e.
        if [[ ! -d "${RELEASE_DIR}" ]]; then
            log ERROR "--release-dir not a valid directory: ${RELEASE_DIR}"
            exit 1
        fi
        local resolved
        if ! resolved=$(cd "${RELEASE_DIR}" && pwd); then
            log ERROR "Could not resolve --release-dir: ${RELEASE_DIR}"
            exit 1
        fi
        RELEASE_DIR="${resolved}"
    fi
}

#===============================================================================
# CLEANUP / ROLLBACK
#===============================================================================

cleanup() {
    local exit_code=$?

    if [[ ${exit_code} -ne 0 ]]; then
        log_separator
        log ERROR "Deployment failed (exit ${exit_code}). Log: ${LOG_FILE}"

        if [[ "${MODE}" == "artifact" ]] || [[ "${MODE}" == "image" ]]; then
            rollback_artifact
        else
            rollback_legacy_nginx
        fi
    fi

    if [[ -n "${DEPLOYMENT_START_TIME}" ]]; then
        local dur=$(( $(date +%s) - DEPLOYMENT_START_TIME ))
        log INFO "Total time: $((dur / 60))m $((dur % 60))s"
    fi
}

# Artifact-mode rollback: undo mutations in reverse order
rollback_artifact() {
    log WARN "Rolling back artifact deploy..."

    # 1. Flip symlink back to previous release (if we flipped it)
    if [[ "${ROLLBACK_SYMLINK_FLIPPED}" == "true" ]] && [[ -n "${ROLLBACK_PREV_SHA}" ]]; then
        local prev_target="${DEPLOY_RELEASES_DIR}/${ROLLBACK_PREV_SHA}"
        if [[ -d "${prev_target}" ]]; then
            log INFO "Restoring symlink: current -> ${ROLLBACK_PREV_SHA}"
            ln -sfn "${prev_target}" "${DEPLOY_CURRENT_LINK}.tmp" && \
                mv -Tf "${DEPLOY_CURRENT_LINK}.tmp" "${DEPLOY_CURRENT_LINK}" && \
                log SUCCESS "Symlink restored" || \
                log ERROR "CRITICAL: Failed to restore symlink — manual intervention required"
        else
            log ERROR "CRITICAL: Previous release ${ROLLBACK_PREV_SHA} not found for rollback"
        fi
    fi

    # 2. Restore systemd unit (if we activated a new one)
    if [[ "${ROLLBACK_SYSTEMD_ACTIVATED}" == "true" ]] && [[ -n "${ROLLBACK_SYSTEMD_BACKUP}" ]] && [[ -f "${ROLLBACK_SYSTEMD_BACKUP}" ]]; then
        log INFO "Restoring systemd unit from ${ROLLBACK_SYSTEMD_BACKUP}"
        if cp "${ROLLBACK_SYSTEMD_BACKUP}" "${SYSTEMD_UNIT}"; then
            systemctl daemon-reload
            systemctl restart "${SERVICE_NAME}" 2>/dev/null || \
                log ERROR "CRITICAL: Service restart after systemd rollback failed"
        else
            log ERROR "CRITICAL: Could not restore systemd unit"
        fi
    elif [[ "${ROLLBACK_SYSTEMD_ACTIVATED}" == "true" ]]; then
        # We activated a new unit but had no prior one to back up. Remove the
        # (probably broken) new unit so we don't leave systemd in a weird state.
        log WARN "No systemd backup to restore — removing newly-activated unit"
        systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
        systemctl disable "${SERVICE_NAME}" 2>/dev/null || true
        rm -f "${SYSTEMD_UNIT}"
        systemctl daemon-reload
    fi

    # 3. Restore nginx config (if we activated a new one) and reload
    if [[ "${ROLLBACK_NGINX_ACTIVATED}" == "true" ]] && [[ -n "${ROLLBACK_NGINX_BACKUP}" ]] && [[ -f "${ROLLBACK_NGINX_BACKUP}" ]]; then
        log INFO "Restoring nginx config from ${ROLLBACK_NGINX_BACKUP}"
        if cp "${ROLLBACK_NGINX_BACKUP}" "${NGINX_ACTIVE_CONF}" && nginx -t &>/dev/null; then
            systemctl reload nginx
            log SUCCESS "nginx rolled back"
        else
            log ERROR "CRITICAL: nginx rollback failed — manual intervention required"
        fi
    fi

    log WARN "Rollback complete. Previous release should be serving traffic."
}

rollback_legacy_nginx() {
    if [[ -n "${ROLLBACK_NGINX_BACKUP}" ]] && [[ -f "${ROLLBACK_NGINX_BACKUP}" ]]; then
        log WARN "Rolling back nginx configuration..."
        if cp "${ROLLBACK_NGINX_BACKUP}" "${NGINX_ACTIVE_CONF}" && nginx -t &>/dev/null; then
            systemctl reload nginx
            log SUCCESS "nginx rolled back"
        else
            log ERROR "CRITICAL: nginx rollback failed — manual intervention required"
        fi
    fi
}

#===============================================================================
# PRE-FLIGHT (shared between modes)
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
    local deps=("nginx" "systemctl" "curl" "sed" "flock")
    if [[ "${MODE}" == "legacy" ]]; then
        deps+=("git" "node" "npm" "nice" "ionice")
    elif [[ "${MODE}" == "image" ]]; then
        deps+=("docker" "awk")
    fi

    local missing=()
    for cmd in "${deps[@]}"; do
        if ! command -v "${cmd}" &>/dev/null; then
            missing+=("${cmd}")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log ERROR "Missing: ${missing[*]}"
        exit 1
    fi
    if [[ "${MODE}" == "image" ]] && ! docker info &>/dev/null; then
        log ERROR "Docker is installed but the daemon is not reachable"
        exit 1
    fi
    log SUCCESS "All dependencies present"
}

check_disk_space() {
    log STEP "Checking disk space..."
    local avail
    avail=$(df -m / | awk 'NR==2{print $4}')
    if [[ ${avail} -lt ${MIN_DISK_MB} ]]; then
        log ERROR "Only ${avail}MB free (need ${MIN_DISK_MB}MB)"
        exit 1
    fi

    # Artifact-mode extra check: release is ~2× staged size; bail early if tight
    if [[ "${MODE}" == "artifact" ]] && [[ -d "${RELEASE_DIR}" ]]; then
        local release_mb
        release_mb=$(du -sm "${RELEASE_DIR}" 2>/dev/null | awk '{print $1}')
        local need_mb=$(( release_mb * 2 + 100 ))   # 2× plus 100MB safety
        if [[ ${avail} -lt ${need_mb} ]]; then
            log ERROR "Disk tight: ${avail}MB free, need ~${need_mb}MB (2× release + safety)"
            exit 1
        fi
        log DEBUG "Disk: ${avail}MB free, release: ${release_mb}MB, needed: ${need_mb}MB"
    fi

    log SUCCESS "Disk OK: ${avail}MB free"
}

check_ssl_certs() {
    log STEP "Validating SSL certificates..."
    [[ -f "${SSL_CERT}" ]] || { log ERROR "SSL cert missing: ${SSL_CERT}"; exit 1; }
    [[ -f "${SSL_KEY}" ]]  || { log ERROR "SSL key missing: ${SSL_KEY}"; exit 1; }

    local perms
    perms=$(stat -c "%a" "${SSL_KEY}")
    if [[ "${perms}" != "600" ]]; then
        log WARN "Fixing SSL key permissions (${perms} → 600)"
        chmod 600 "${SSL_KEY}"
    fi
    log SUCCESS "SSL OK"
}

setup_directories() {
    mkdir -p "${LOG_DIR}" "${BACKUP_DIR}"
    chmod 755 "${LOG_DIR}" "${BACKUP_DIR}"
    touch "${LOG_FILE}"
    chmod 644 "${LOG_FILE}"
}

cleanup_old_artifacts() {
    log STEP "Pruning old logs & backups..."
    local count
    count=$(find "${LOG_DIR}" -name "deploy-*.log" -type f 2>/dev/null | wc -l)
    if [[ ${count} -gt ${MAX_LOG_FILES} ]]; then
        local to_delete=$(( count - MAX_LOG_FILES ))
        find "${LOG_DIR}" -name "deploy-*.log" -type f -printf '%T+ %p\n' \
            | sort | head -n "${to_delete}" \
            | cut -d' ' -f2- | xargs rm -f
    fi
    find "${BACKUP_DIR}" -name "*.backup.*" -type f -mtime "+${BACKUP_RETENTION_DAYS}" -delete 2>/dev/null || true
    if command -v journalctl &>/dev/null; then
        journalctl --vacuum-size=50M -u "${SERVICE_NAME}" &>/dev/null || true
    fi
    log SUCCESS "Cleanup complete"
}

#===============================================================================
# PROCESS CLEANUP (shared — runs on port regardless of mode)
#===============================================================================

kill_orphaned_processes() {
    log STEP "Killing orphaned processes on port ${NEXTJS_PORT}..."

    # PM2 cleanup (legacy deployments may have this)
    if command -v pm2 &>/dev/null; then
        local pm2_list
        pm2_list=$(sudo -u "${SERVICE_USER}" pm2 jlist 2>/dev/null || echo "[]")
        if echo "${pm2_list}" | grep -q '"name":"'"${SERVICE_NAME}"'"'; then
            log WARN "Stopping PM2-managed '${SERVICE_NAME}'..."
            sudo -u "${SERVICE_USER}" pm2 stop "${SERVICE_NAME}" 2>/dev/null || true
            sudo -u "${SERVICE_USER}" pm2 delete "${SERVICE_NAME}" 2>/dev/null || true
            sudo -u "${SERVICE_USER}" pm2 save --force 2>/dev/null || true
        fi
    fi

    # Kill leftover processes on the port (systemd stop handled elsewhere)
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
# ARTIFACT MODE — first-run bootstrap + release management
#===============================================================================

first_run_bootstrap() {
    log STEP "Ensuring /opt/${SERVICE_NAME} layout..."

    # First-run: do the expensive recursive chown + create skeleton.
    # Steady-state: just ensure the dirs exist (cheap stat, no ownership sweep).
    local first_run=false
    if [[ ! -d "${DEPLOY_RELEASES_DIR}" ]]; then
        first_run=true
    fi

    mkdir -p "${DEPLOY_CONFIG_DIR}" "${DEPLOY_RELEASES_DIR}"
    chmod 755 "${DEPLOY_ROOT}" "${DEPLOY_RELEASES_DIR}"
    chmod 750 "${DEPLOY_CONFIG_DIR}"

    if [[ "${first_run}" == "true" ]]; then
        chown -R "${SERVICE_USER}:${SERVICE_USER}" "${DEPLOY_ROOT}"
    else
        # Ensure top-level dirs have correct owner without sweeping releases
        chown "${SERVICE_USER}:${SERVICE_USER}" "${DEPLOY_ROOT}" \
            "${DEPLOY_CONFIG_DIR}" "${DEPLOY_RELEASES_DIR}" 2>/dev/null || true
    fi

    # Migrate .env.local from legacy location if we don't have one yet
    if [[ ! -f "${DEPLOY_ENV_FILE}" ]]; then
        local src=""
        if [[ -f "${LEGACY_ENV_FILE}" ]]; then
            src="${LEGACY_ENV_FILE}"
        elif [[ -f "${LEGACY_STANDALONE_ENV_FILE}" ]]; then
            src="${LEGACY_STANDALONE_ENV_FILE}"
        fi

        if [[ -n "${src}" ]]; then
            log INFO "First-run: migrating .env.local from ${src}"
            cp "${src}" "${DEPLOY_ENV_FILE}"
            chown "${SERVICE_USER}:${SERVICE_USER}" "${DEPLOY_ENV_FILE}"
            chmod 600 "${DEPLOY_ENV_FILE}"
        else
            log ERROR "No .env.local found (tried ${LEGACY_ENV_FILE} and ${LEGACY_STANDALONE_ENV_FILE})"
            log ERROR "Required vars: ${REQUIRED_ENV_ARRAY[*]}"
            exit 1
        fi
    fi

    log SUCCESS "Layout ready: ${DEPLOY_ROOT}"
}

validate_env_file() {
    log STEP "Validating ${DEPLOY_ENV_FILE}..."

    if [[ ! -f "${DEPLOY_ENV_FILE}" ]]; then
        log ERROR ".env.local not found at ${DEPLOY_ENV_FILE}"
        exit 1
    fi

    # Check required vars are present. Use fgrep-style fixed match for the
    # variable name, but pre-filter to non-comment lines and anchor with `cut`
    # so `# FOO=old` in a comment doesn't falsely satisfy FOO.
    local missing=()
    local non_comment
    local required_count=0
    non_comment=$(grep -vE '^[[:space:]]*(#|$)' "${DEPLOY_ENV_FILE}" || true)
    for var in "${REQUIRED_ENV_ARRAY[@]}"; do
        var="$(echo "${var}" | xargs)"
        [[ -z "${var}" ]] && continue
        required_count=$((required_count + 1))
        if ! echo "${non_comment}" | cut -d= -f1 | grep -qxF "${var}"; then
            missing+=("${var}")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        log ERROR "Missing in .env.local: ${missing[*]}"
        exit 1
    fi

    # Validate systemd-compatible syntax — no `export`, no shell interpolation,
    # no multi-line values, no unquoted spaces. systemd silently drops malformed
    # lines which would surface as "missing API key" at runtime — fail loudly here.
    # Accept lower-case keys too (http_proxy, etc. are valid systemd env vars).
    local bad_lines
    bad_lines=$(grep -vE '^[[:space:]]*(#|$)' "${DEPLOY_ENV_FILE}" | grep -vE '^[A-Za-z_][A-Za-z0-9_]*=.*$' || true)
    if [[ -n "${bad_lines}" ]]; then
        log ERROR ".env.local has lines incompatible with systemd EnvironmentFile syntax:"
        echo "${bad_lines}" | head -5 | while read -r line; do
            log ERROR "  > ${line}"
        done
        log ERROR "Each line must be KEY=value (no 'export', no shell \$interpolation, no multi-line)"
        exit 1
    fi

    log SUCCESS ".env.local valid (${required_count} required vars, systemd-compatible)"
}

record_previous_release() {
    if [[ -L "${DEPLOY_CURRENT_LINK}" ]]; then
        local target
        target=$(readlink "${DEPLOY_CURRENT_LINK}" 2>/dev/null || true)
        if [[ -n "${target}" ]]; then
            ROLLBACK_PREV_SHA="$(basename "${target}")"
            log DEBUG "Previous release: ${ROLLBACK_PREV_SHA}"
        fi
    fi
}

stage_release() {
    log STEP "Staging release ${RELEASE_SHA}..."

    local target="${DEPLOY_RELEASES_DIR}/${RELEASE_SHA}"
    local current_target=""
    local target_real=""

    current_target=$(readlink -f "${DEPLOY_CURRENT_LINK}" 2>/dev/null || true)
    if [[ -d "${target}" ]]; then
        target_real=$(readlink -f "${target}" 2>/dev/null || true)
    fi

    if [[ -n "${current_target}" ]] && [[ -n "${target_real}" ]] && [[ "${current_target}" == "${target_real}" ]]; then
        if [[ ! -f "${target}/server.js" ]]; then
            log ERROR "Release ${RELEASE_SHA} is already active but does not contain server.js"
            log ERROR "Refusing artifact same-SHA reuse; the active release is likely an image-mode static release. Deploy a new SHA or drain/remove it manually."
            exit 1
        fi
        log WARN "Release ${RELEASE_SHA} is already active — reusing existing staged files"
        return 0
    fi

    local staging="${DEPLOY_RELEASES_DIR}/.${RELEASE_SHA}.staging.$$"
    rm -rf "${staging}"
    mkdir -p "${staging}"

    if [[ -d "${target}" ]]; then
        log WARN "Release ${RELEASE_SHA} already on disk but is not active — replacing after staging succeeds"
    fi

    # Copy the extracted bundle into a temp dir first so a failed copy never
    # leaves a half-populated release at the final SHA path.
    # Avoids depending on rsync, which isn't in Ubuntu minimal cloud images.
    cp -a "${RELEASE_DIR}/." "${staging}/"

    # Copy the production .env.local into the release (systemd reads it from here)
    cp "${DEPLOY_ENV_FILE}" "${staging}/.env.local"
    chmod 600 "${staging}/.env.local"

    # Fix ownership: service user owns the bundle
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${staging}"

    # Ensure nginx (www-data) can traverse to read static files.
    # /opt/portfolio is not home-restricted but set +x defensively in case
    # parent dirs have 700 perms.
    chmod o+x "${DEPLOY_ROOT}" "${DEPLOY_RELEASES_DIR}" "${staging}" 2>/dev/null || true
    [[ -d "${staging}/.next/static" ]] && chmod -R o+rX "${staging}/.next/static" 2>/dev/null || true
    [[ -d "${staging}/public" ]] && chmod -R o+rX "${staging}/public" 2>/dev/null || true

    rm -rf "${target}"
    mv "${staging}" "${target}"

    local file_count
    file_count=$(find "${target}" -type f | wc -l)
    log SUCCESS "Staged ${file_count} files to ${target}"
}

stage_image_release() {
    log STEP "Staging image release ${RELEASE_SHA}..."

    local target="${DEPLOY_RELEASES_DIR}/${RELEASE_SHA}"
    local staging="${DEPLOY_RELEASES_DIR}/.${RELEASE_SHA}.staging.$$"
    local extract_container="${SERVICE_NAME}-extract-$$"
    local current_target=""
    local target_real=""

    current_target=$(readlink -f "${DEPLOY_CURRENT_LINK}" 2>/dev/null || true)
    if [[ -d "${target}" ]]; then
        target_real=$(readlink -f "${target}" 2>/dev/null || true)
    fi

    if [[ -n "${current_target}" ]] && [[ -n "${target_real}" ]] && [[ "${current_target}" == "${target_real}" ]]; then
        local current_image=""
        if [[ -f "${target}/.deploy/meta.json" ]]; then
            current_image=$(sed -n 's/.*"image": "\([^"]*\)".*/\1/p' "${target}/.deploy/meta.json" | head -1)
        fi
        if [[ "${current_image}" == "${DOCKER_IMAGE}" ]]; then
            RELEASE_DIR="${target}"
            log WARN "Image release ${RELEASE_SHA} is already active with the same digest — reusing existing static files"
            return 0
        fi
        log ERROR "Active release ${RELEASE_SHA} already exists with a different image digest"
        log ERROR "Current: ${current_image:-unknown}"
        log ERROR "Requested: ${DOCKER_IMAGE}"
        log ERROR "Refusing to replace the live same-SHA release in place; deploy a new SHA or drain/remove the old release manually."
        exit 1
    fi

    rm -rf "${staging}"
    mkdir -p "${staging}/.next"
    if [[ -d "${target}" ]]; then
        log WARN "Release ${RELEASE_SHA} already on disk but is not active — replacing after staging succeeds"
    fi

    log INFO "Pulling image: ${DOCKER_IMAGE}"
    docker pull "${DOCKER_IMAGE}" 2>&1 | tee -a "${LOG_FILE}"

    docker rm -f "${extract_container}" >/dev/null 2>&1 || true
    # shellcheck disable=SC2064
    trap "docker rm -f '${extract_container}' >/dev/null 2>&1 || true" RETURN

    docker create --name "${extract_container}" "${DOCKER_IMAGE}" >/dev/null

    docker cp "${extract_container}:/app/.next/static" "${staging}/.next/" \
        || { log ERROR "Could not extract .next/static from image"; exit 1; }
    docker cp "${extract_container}:/app/public" "${staging}/" \
        || { log ERROR "Could not extract public/ from image"; exit 1; }
    docker cp "${extract_container}:/app/.deploy" "${staging}/" \
        || { log ERROR "Could not extract .deploy/ from image"; exit 1; }

    docker rm -f "${extract_container}" >/dev/null 2>&1 || true
    trap - RETURN

    cat > "${staging}/.deploy/meta.json" << META
{
  "sha": "${RELEASE_SHA}",
  "image": "${DOCKER_IMAGE}",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
META

    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${staging}"
    chmod o+x "${DEPLOY_ROOT}" "${DEPLOY_RELEASES_DIR}" "${staging}" 2>/dev/null || true
    chmod -R o+rX "${staging}/.next/static" "${staging}/public" 2>/dev/null || true

    rm -rf "${target}"
    mv "${staging}" "${target}"

    local file_count
    file_count=$(find "${target}" -type f | wc -l)
    RELEASE_DIR="${target}"
    log SUCCESS "Staged ${file_count} static/deploy files from image to ${target}"
}

record_previous_docker_image() {
    ROLLBACK_PREV_DOCKER_IMAGE="$(docker inspect --format '{{.Config.Image}}' "${DOCKER_CONTAINER_NAME}" 2>/dev/null || true)"
    if [[ -n "${ROLLBACK_PREV_DOCKER_IMAGE}" ]]; then
        log DEBUG "Previous Docker image: ${ROLLBACK_PREV_DOCKER_IMAGE}"
    fi
}

prune_docker_images() {
    if [[ "${MODE}" != "image" ]]; then
        return 0
    fi

    log STEP "Pruning old Docker images for ${SERVICE_NAME}..."

    local repository="${DOCKER_IMAGE%@*}"
    repository="${repository%:*}"
    if [[ -z "${repository}" ]]; then
        log WARN "Could not infer Docker repository for pruning"
        return 0
    fi

    local current_id=""
    current_id="$(docker image inspect --format '{{.Id}}' "${DOCKER_IMAGE}" 2>/dev/null || true)"
    local previous_id=""
    if [[ -n "${ROLLBACK_PREV_DOCKER_IMAGE}" ]]; then
        previous_id="$(docker image inspect --format '{{.Id}}' "${ROLLBACK_PREV_DOCKER_IMAGE}" 2>/dev/null || true)"
    fi

    mapfile -t image_ids < <(
        docker images --format '{{.Repository}} {{.ID}}' \
            | awk -v repo="${repository}" '$1 == repo { print $2 }' \
            | sort -u
    )

    local removed=0
    local image_id
    for image_id in "${image_ids[@]}"; do
        if [[ -z "${image_id}" ]] || [[ "${image_id}" == "${current_id}" ]] || [[ "${image_id}" == "${previous_id}" ]]; then
            continue
        fi
        if docker rmi "${image_id}" >/dev/null 2>&1; then
            removed=$((removed + 1))
        fi
    done

    log SUCCESS "Docker image prune complete (${removed} old ${repository} image(s) removed)"
}

#===============================================================================
# ARTIFACT MODE — systemd unit (prepare → validate → activate)
#===============================================================================

prepare_systemd_unit() {
    log STEP "Preparing systemd unit (staged)..."

    local node_bin
    node_bin=$(command -v node)

    STAGED_SYSTEMD_UNIT="$(mktemp "/tmp/${SERVICE_NAME}.service.XXXXXX")"

    cat > "${STAGED_SYSTEMD_UNIT}" << UNIT
[Unit]
Description=Next.js — ${DOMAIN}
After=network.target
Wants=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${DEPLOY_CURRENT_LINK}

# Environment — file lives inside the release, injected at deploy time
Environment=LOCAL_TTS_CACHE_DIR=/var/cache/${SERVICE_NAME}/kitten-tts
EnvironmentFile=-${DEPLOY_CURRENT_LINK}/.env.local
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
CacheDirectory=${SERVICE_NAME}/kitten-tts
ReadWritePaths=${DEPLOY_ROOT} /var/cache/${SERVICE_NAME}/kitten-tts
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

KillMode=control-group

[Install]
WantedBy=multi-user.target
UNIT

    chmod 644 "${STAGED_SYSTEMD_UNIT}"
    log SUCCESS "systemd unit staged at ${STAGED_SYSTEMD_UNIT}"
}

docker_cpu_quota() {
    awk "BEGIN { printf \"%.2f\", ${CPU_QUOTA_PERCENT}/100 }"
}

prepare_docker_systemd_unit() {
    log STEP "Preparing Docker systemd unit (staged)..."

    local docker_bin
    docker_bin=$(command -v docker)
    local docker_cpus
    docker_cpus=$(docker_cpu_quota)
    local tts_cache_dir="/var/cache/${SERVICE_NAME}/kitten-tts"

    mkdir -p "${tts_cache_dir}"
    chown -R "${DOCKER_CACHE_UID}:${DOCKER_CACHE_GID}" "${tts_cache_dir}" 2>/dev/null || true
    chmod 775 "${tts_cache_dir}" 2>/dev/null || true

    STAGED_SYSTEMD_UNIT="$(mktemp "/tmp/${SERVICE_NAME}.service.XXXXXX")"

    cat > "${STAGED_SYSTEMD_UNIT}" << UNIT
[Unit]
Description=Next.js Docker container — ${DOMAIN}
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${DEPLOY_CURRENT_LINK}

ExecStartPre=-${docker_bin} rm -f ${DOCKER_CONTAINER_NAME}
ExecStart=${docker_bin} run --name ${DOCKER_CONTAINER_NAME} --rm --pull=never \
  --env-file ${DEPLOY_ENV_FILE} \
  --env NODE_ENV=production \
  --env PORT=${NEXTJS_PORT} \
  --env HOSTNAME=0.0.0.0 \
  --env NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB} \
  --env LOCAL_TTS_CACHE_DIR=${tts_cache_dir} \
  --publish 127.0.0.1:${NEXTJS_PORT}:${NEXTJS_PORT}/tcp \
  --volume ${tts_cache_dir}:${tts_cache_dir} \
  --memory ${MEMORY_MAX_MB}m \
  --memory-reservation ${MEMORY_HIGH_MB}m \
  --cpus ${docker_cpus} \
  --label com.whoisdhruv.service=${SERVICE_NAME} \
  --label com.whoisdhruv.sha=${RELEASE_SHA} \
  ${DOCKER_IMAGE}
ExecStop=${docker_bin} stop -t 15 ${DOCKER_CONTAINER_NAME}
ExecStopPost=-${docker_bin} rm -f ${DOCKER_CONTAINER_NAME}
Restart=on-failure
RestartSec=5
TimeoutStartSec=90
TimeoutStopSec=30

# Docker owns the container cgroup; resource controls are applied through
# docker run flags above so they follow the app process, not just docker CLI.
OOMScoreAdjust=500
Nice=${SERVICE_NICE}
NoNewPrivileges=true
PrivateTmp=true
KillMode=process

# ── Logging ──
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}
LogRateLimitIntervalSec=30
LogRateLimitBurst=100

[Install]
WantedBy=multi-user.target
UNIT

    chmod 644 "${STAGED_SYSTEMD_UNIT}"
    log SUCCESS "Docker systemd unit staged at ${STAGED_SYSTEMD_UNIT}"
}

backup_existing_systemd() {
    if [[ -f "${SYSTEMD_UNIT}" ]]; then
        ROLLBACK_SYSTEMD_BACKUP="${BACKUP_DIR}/systemd-${SERVICE_NAME}.backup.$(date +%Y%m%d-%H%M%S)"
        cp "${SYSTEMD_UNIT}" "${ROLLBACK_SYSTEMD_BACKUP}"
        log DEBUG "systemd backup: ${ROLLBACK_SYSTEMD_BACKUP}"
    fi
}

activate_systemd_unit() {
    log STEP "Activating systemd unit..."
    cp "${STAGED_SYSTEMD_UNIT}" "${SYSTEMD_UNIT}"
    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" &>/dev/null || true
    ROLLBACK_SYSTEMD_ACTIVATED=true
    log SUCCESS "systemd unit active"
}

#===============================================================================
# ARTIFACT MODE — nginx (prepare → validate → activate)
#===============================================================================

ensure_nginx_zones() {
    # The nginx template references limit_req_zone names `api` and `general` which
    # must be defined in http{} context. If they don't exist on the VM already,
    # nginx -t would fail. Write them defensively to conf.d/<service>-zones.conf
    # (conf.d is auto-included by Ubuntu's default nginx.conf at http level).
    #
    # If zones are already defined elsewhere with the same name, nginx will fail
    # on duplicate-zone error. Detect that case and skip.

    log STEP "Ensuring nginx rate-limit zones exist..."

    local global_has_api=false
    local global_has_general=false
    local file_has_api=false
    local file_has_general=false

    if grep -rqE '^[[:space:]]*limit_req_zone[^;]+zone=api:' /etc/nginx/ 2>/dev/null; then
        global_has_api=true
    fi
    if grep -rqE '^[[:space:]]*limit_req_zone[^;]+zone=general:' /etc/nginx/ 2>/dev/null; then
        global_has_general=true
    fi

    if [[ -f "${NGINX_ZONES_CONF}" ]]; then
        if grep -qE '^[[:space:]]*limit_req_zone[^;]+zone=api:' "${NGINX_ZONES_CONF}" 2>/dev/null; then
            file_has_api=true
        fi
        if grep -qE '^[[:space:]]*limit_req_zone[^;]+zone=general:' "${NGINX_ZONES_CONF}" 2>/dev/null; then
            file_has_general=true
        fi
    fi

    if [[ "${global_has_api}" == "true" ]] && [[ "${global_has_general}" == "true" ]]; then
        log DEBUG "limit_req_zone api/general already defined — skipping"
        return 0
    fi

    {
        cat << 'ZONES'
# Rate-limit zones (shared across all server blocks).
# Defined in http{} via conf.d/ auto-include.
ZONES
        if [[ "${file_has_api}" == "true" ]] || [[ "${global_has_api}" != "true" ]]; then
            printf '%s\n' 'limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;'
        fi
        if [[ "${file_has_general}" == "true" ]] || [[ "${global_has_general}" != "true" ]]; then
            printf '%s\n' 'limit_req_zone $binary_remote_addr zone=general:10m rate=120r/m;'
        fi
    } > "${NGINX_ZONES_CONF}"
    chmod 644 "${NGINX_ZONES_CONF}"
    log SUCCESS "Wrote ${NGINX_ZONES_CONF}"
}

prepare_nginx_config() {
    log STEP "Preparing nginx config (staged)..."

    local tmpl="${RELEASE_DIR}/.deploy/${NGINX_CONF_TEMPLATE}"
    if [[ ! -f "${tmpl}" ]]; then
        log ERROR "nginx template missing in release: ${tmpl}"
        exit 1
    fi

    STAGED_NGINX_CONF="$(mktemp "/tmp/${SERVICE_NAME}-nginx.conf.XXXXXX")"

    # __STANDALONE_DIR__ points to the atomic symlink, NOT the release dir directly.
    # This way nginx configs don't reference a per-SHA path and survive symlink
    # swaps without a reload (though we reload anyway for explicit cache invalidation).
    sed -e "s|__DOMAIN__|${DOMAIN}|g" \
        -e "s|__NEXTJS_PORT__|${NEXTJS_PORT}|g" \
        -e "s|__SERVICE_NAME__|${SERVICE_NAME}|g" \
        -e "s|__SSL_CERT__|${SSL_CERT}|g" \
        -e "s|__SSL_KEY__|${SSL_KEY}|g" \
        -e "s|__STANDALONE_DIR__|${DEPLOY_CURRENT_LINK}|g" \
        "${tmpl}" > "${STAGED_NGINX_CONF}"

    chmod 644 "${STAGED_NGINX_CONF}"
    log SUCCESS "nginx config staged at ${STAGED_NGINX_CONF}"
}

validate_staged_nginx() {
    # Validate in a sandboxed nginx prefix — the live config is never touched.
    # If this process dies mid-validation (SIGKILL, OOM), nothing on disk changes.
    log STEP "Validating staged nginx config (sandboxed)..."

    local sandbox
    sandbox="$(mktemp -d "/tmp/${SERVICE_NAME}-nginx-test.XXXXXX")"

    # Guarantee cleanup on ANY exit from this function (success, failure, signal).
    # RETURN trap scope is function-local, so we don't disturb the global EXIT trap.
    # shellcheck disable=SC2064
    trap "rm -rf '${sandbox}'" RETURN

    mkdir -p "${sandbox}/conf.d" "${sandbox}/sites-enabled" "${sandbox}/logs"

    # nullglob so empty directories don't leave the raw pattern as a "filename"
    shopt -s nullglob

    # Mirror http-level snippets. Strip `limit_req_zone` lines — we hoist
    # those into the sandbox nginx.conf explicitly below to guarantee the
    # staged site config's `limit_req zone=...` references resolve, regardless
    # of whether the real VM declares the zones in nginx.conf (which we don't
    # mirror) or in conf.d (which we do). Stripping here avoids "duplicate
    # zone" errors when re-declaring in nginx.conf.
    local f
    for f in /etc/nginx/conf.d/*.conf; do
        grep -vE '^[[:space:]]*limit_req_zone[[:space:]]' "${f}" \
            > "${sandbox}/conf.d/$(basename "${f}")"
    done

    # Mirror dynamically-loaded modules (brotli, headers-more, etc.) — these are
    # declared in nginx.conf via `load_module` at main context. If the staged
    # site config uses a directive from one of these modules and we don't
    # load them in the sandbox, validation passes here but fails on activation.
    local load_module_lines=""
    local modf
    for modf in /etc/nginx/modules-enabled/*.conf; do
        load_module_lines+="$(cat "${modf}")"$'\n'
    done

    shopt -u nullglob

    # Stage the candidate site config
    cp "${STAGED_NGINX_CONF}" "${sandbox}/sites-enabled/${SERVICE_NAME}"

    # Build the sandbox's nginx.conf. Using printf + a quoted heredoc so that
    # `$binary_remote_addr` in the rate-limit zone declarations stays literal
    # (bash would otherwise try to expand it and produce a broken directive).
    {
        printf '%s\n' "${load_module_lines}"
        cat <<'SANDBOX_HEAD'
events {
    worker_connections 1024;
}
http {
    default_type application/octet-stream;
    include /etc/nginx/mime.types;

    # Rate-limit zones required by the site template. Declared here so the
    # sandbox validates against a known-good definition regardless of where
    # the real VM declares them (nginx.conf vs conf.d). Duplicates in
    # conf.d/ are stripped above to prevent collisions.
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
    limit_req_zone $binary_remote_addr zone=general:10m rate=120r/m;

SANDBOX_HEAD
        printf '    include %s/conf.d/*.conf;\n' "${sandbox}"
        printf '    include %s/sites-enabled/*;\n' "${sandbox}"
        printf '}\n'
    } > "${sandbox}/nginx.conf"

    local test_out
    if ! test_out=$(nginx -t -c "${sandbox}/nginx.conf" -p "${sandbox}/" 2>&1); then
        log ERROR "nginx -t FAILED on staged config:"
        echo "${test_out}" | head -30 | while IFS= read -r line; do
            log ERROR "  ${line}"
        done
        rm -rf "${sandbox}"
        exit 1
    fi

    log SUCCESS "nginx -t passed on staged config"
}

backup_existing_nginx() {
    if [[ -f "${NGINX_ACTIVE_CONF}" ]]; then
        ROLLBACK_NGINX_BACKUP="${BACKUP_DIR}/${SERVICE_NAME}.backup.$(date +%Y%m%d-%H%M%S)"
        cp "${NGINX_ACTIVE_CONF}" "${ROLLBACK_NGINX_BACKUP}"
        chmod 644 "${ROLLBACK_NGINX_BACKUP}"
        log DEBUG "nginx backup: ${ROLLBACK_NGINX_BACKUP}"
    fi
}

activate_nginx_config() {
    if [[ "${SKIP_NGINX}" == "true" ]]; then
        log WARN "Skipping nginx activation (--skip-nginx)"
        return 0
    fi
    log STEP "Activating nginx config..."

    cp "${STAGED_NGINX_CONF}" "${NGINX_ACTIVE_CONF}"

    # Ensure site is enabled
    local symlink="${NGINX_SITES_ENABLED}/${SERVICE_NAME}"
    if [[ ! -L "${symlink}" ]]; then
        ln -sf "${NGINX_ACTIVE_CONF}" "${symlink}"
        log DEBUG "Created enabled-site symlink: ${symlink}"
    fi

    ROLLBACK_NGINX_ACTIVATED=true

    # Proxy cache dir
    mkdir -p "/var/cache/nginx/${SERVICE_NAME}"
    chown www-data:www-data "/var/cache/nginx/${SERVICE_NAME}"

    # Re-test with the live config now in place (belt & suspenders)
    if ! nginx -t &>/dev/null; then
        log ERROR "nginx -t failed at activation time (should not happen — validated earlier)"
        if [[ -n "${ROLLBACK_NGINX_BACKUP}" ]] && [[ -f "${ROLLBACK_NGINX_BACKUP}" ]]; then
            cp "${ROLLBACK_NGINX_BACKUP}" "${NGINX_ACTIVE_CONF}" || true
        else
            rm -f "${NGINX_ACTIVE_CONF}" "${symlink}" || true
        fi
        exit 1
    fi

    log SUCCESS "nginx config activated (reload deferred until after service up)"
}

#===============================================================================
# ARTIFACT MODE — atomic symlink swap + service start
#===============================================================================

atomic_symlink_swap() {
    log STEP "Atomic symlink swap → ${RELEASE_SHA}..."

    local target="${DEPLOY_RELEASES_DIR}/${RELEASE_SHA}"
    local tmp="${DEPLOY_CURRENT_LINK}.tmp.$$"

    # Two-step for atomic replace on ext4/xfs via rename(2):
    #   1. Create temp symlink (fresh, definitely points to target)
    #   2. mv -T replaces current atomically
    ln -sfn "${target}" "${tmp}"
    mv -Tf "${tmp}" "${DEPLOY_CURRENT_LINK}"

    ROLLBACK_SYMLINK_FLIPPED=true
    log SUCCESS "current -> ${target}"
}

start_service() {
    log STEP "Starting ${SERVICE_NAME}..."

    systemctl start "${SERVICE_NAME}"

    log DEBUG "Waiting up to ${HEALTH_CHECK_RETRIES}s for port ${NEXTJS_PORT}..."
    local i=0
    while [[ $i -lt ${HEALTH_CHECK_RETRIES} ]]; do
        if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${NEXTJS_PORT}/" 2>/dev/null; then
            log SUCCESS "Service responding on port ${NEXTJS_PORT} (${i}s)"
            return 0
        fi
        i=$((i + 1))
        sleep 1
    done

    log ERROR "Service failed to start within ${HEALTH_CHECK_RETRIES}s"
    journalctl -u "${SERVICE_NAME}" --no-pager -n 30 2>&1 | tee -a "${LOG_FILE}"
    return 1
}

reload_nginx() {
    if [[ "${SKIP_NGINX}" == "true" ]]; then
        return 0
    fi
    log STEP "Reloading nginx..."
    systemctl reload nginx 2>&1 | tee -a "${LOG_FILE}" \
        || { log ERROR "nginx reload failed"; return 1; }
    if ! systemctl is-active --quiet nginx; then
        log ERROR "nginx is not running after reload!"
        return 1
    fi
    log SUCCESS "nginx reloaded"
}

#===============================================================================
# ARTIFACT MODE — post-deploy housekeeping
#===============================================================================

trim_old_releases() {
    log STEP "Trimming old releases (keeping last ${RELEASE_RETENTION_COUNT})..."

    # List releases by modification time, skip the newest N, delete the rest.
    # We never touch the release that `current` points to.
    local current_target
    current_target=$(readlink "${DEPLOY_CURRENT_LINK}" 2>/dev/null || true)
    local current_sha=""
    [[ -n "${current_target}" ]] && current_sha="$(basename "${current_target}")"

    mapfile -t releases < <(
        find "${DEPLOY_RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' \
            | sort -rn | awk '{print $2}'
    )

    local kept=0
    for rel in "${releases[@]}"; do
        if [[ "${rel}" == "${current_sha}" ]] || [[ ${kept} -lt ${RELEASE_RETENTION_COUNT} ]]; then
            kept=$((kept + 1))
            continue
        fi
        log DEBUG "Removing old release: ${rel}"
        rm -rf "${DEPLOY_RELEASES_DIR:?}/${rel}"
    done

    log SUCCESS "Releases retained: $(find "${DEPLOY_RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | wc -l)"
}

update_deploy_symlink() {
    # Re-point /usr/local/bin/deployWebsite to the deploy.sh in the current release.
    # Optional but useful: if anyone ever runs `sudo deployWebsite` on the VM,
    # they get the deploy.sh that matches the currently-running bundle.
    local target="${DEPLOY_CURRENT_LINK}/.deploy/deploy.sh"
    if [[ -f "${target}" ]]; then
        ln -sfn "${target}" "/usr/local/bin/deployWebsite" 2>/dev/null || \
            log DEBUG "Could not update /usr/local/bin/deployWebsite symlink (non-fatal)"
    fi
}

cleanup_orphaned_legacy() {
    # After we've accumulated >=2 successful artifact releases, the legacy
    # git-based bundle at $PROJECT_ROOT/.next and node_modules/ is dead weight
    # (~100-200MB). Reclaim it.

    local release_count
    release_count=$(find "${DEPLOY_RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | wc -l)

    if [[ ${release_count} -ge 2 ]]; then
        if [[ -d "${LEGACY_STANDALONE_DIR}" ]] || [[ -d "${PROJECT_ROOT}/node_modules" ]]; then
            log STEP "Cleaning up legacy ${PROJECT_ROOT} build artifacts..."
            rm -rf "${LEGACY_STANDALONE_DIR}" "${PROJECT_ROOT}/node_modules" 2>/dev/null || true
            log SUCCESS "Legacy artifacts removed"
        fi
    fi
}

#===============================================================================
# ARTIFACT MODE — orchestration
#===============================================================================

artifact_deploy() {
    log INFO "Mode: artifact (sha=${RELEASE_SHA}, release_dir=${RELEASE_DIR})"

    # Sanity on release contents
    [[ -f "${RELEASE_DIR}/server.js" ]] || { log ERROR "server.js missing in release dir"; exit 1; }
    [[ -f "${RELEASE_DIR}/.deploy/${NGINX_CONF_TEMPLATE}" ]] || \
        { log ERROR "nginx template missing in release: ${RELEASE_DIR}/.deploy/${NGINX_CONF_TEMPLATE}"; exit 1; }

    # Preflight
    check_ssl_certs

    # Bootstrap /opt/<service>/ on first run (or no-op if already set up)
    first_run_bootstrap
    validate_env_file
    record_previous_release

    # Stage new release on disk (does NOT activate yet)
    stage_release

    # Prepare staged configs
    prepare_systemd_unit
    prepare_nginx_config

    # Validate nginx config BEFORE any mutation — catches template errors,
    # missing SSL paths, bad placeholder substitution.
    ensure_nginx_zones
    validate_staged_nginx

    # Backup existing configs (for rollback)
    backup_existing_systemd
    backup_existing_nginx

    # ── MUTATION SEQUENCE ─────────────────────────────────────────────────────
    # Critical ordering:
    #   1. Everything that can be validated → validate first (above)
    #   2. Symlink must be created BEFORE nginx config references it (to avoid
    #      a window where nginx config points at a non-existent path)
    #   3. Service start AFTER symlink swap (so it runs the new release)
    #   4. nginx reload is LAST (failure there is recoverable — the atomic swap
    #      already succeeded and the service is already healthy; a failed
    #      reload is a non-fatal WARN, not a full rollback trigger)
    # If anything below fails, cleanup() rolls back via ROLLBACK_* flags.

    kill_orphaned_processes

    # Stop service before symlink swap so there are no open FDs into the
    # old release dir at the moment of swap.
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        log DEBUG "Stopping ${SERVICE_NAME}..."
        systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
        sleep 2
    fi

    # Activate NEW systemd unit (WorkingDirectory=DEPLOY_CURRENT_LINK).
    # The unit is on disk but the service is stopped — no effect yet.
    activate_systemd_unit

    # Flip the symlink atomically — AFTER this, DEPLOY_CURRENT_LINK points at
    # the new release. Must happen before the nginx config that references it
    # goes live, so nginx never sees a dangling path.
    atomic_symlink_swap

    # Activate NEW nginx config (references DEPLOY_CURRENT_LINK, which now
    # points at the new release). Not reloaded yet — just staged to disk.
    activate_nginx_config

    # Start service. If this fails, cleanup() rolls back symlink + systemd.
    # nginx stays on whatever config was active at entry (config file is
    # already replaced, but nginx-in-memory still runs the old config — the
    # rollback trap restores the old file for when nginx IS next reloaded).
    if ! start_service; then
        log ERROR "Service did not come up healthy"
        exit 1
    fi

    # Service is up on the new release. Now reload nginx to adopt the new
    # config. If reload fails: the new service is already serving traffic
    # via the still-running old nginx (which keeps routing to 127.0.0.1:PORT
    # as before — the upstream has not changed). Reload failure is fixable
    # out-of-band; DO NOT trigger full rollback here.
    if ! reload_nginx; then
        log WARN "nginx reload failed — new service is up and serving, but nginx"
        log WARN "config was not reloaded. Investigate manually:"
        log WARN "  sudo nginx -t && sudo systemctl reload nginx"
        log WARN "Deploy will be reported as successful; rollback is NOT triggered."
    fi

    # Post-deploy housekeeping (non-fatal)
    trim_old_releases || log WARN "trim_old_releases had issues (non-fatal)"
    update_deploy_symlink
    cleanup_orphaned_legacy || log WARN "legacy cleanup had issues (non-fatal)"

    # Final health check
    health_check
}

image_deploy() {
    log INFO "Mode: image (sha=${RELEASE_SHA}, image=${DOCKER_IMAGE})"

    check_ssl_certs

    # Bootstrap /opt/<service>/ on first run (or no-op if already set up)
    first_run_bootstrap
    validate_env_file
    record_previous_release
    record_previous_docker_image

    # Pull image and extract nginx-visible static assets/deploy template.
    stage_image_release

    # Prepare staged configs from files extracted from the exact image digest.
    prepare_docker_systemd_unit
    prepare_nginx_config

    ensure_nginx_zones
    validate_staged_nginx

    backup_existing_systemd
    backup_existing_nginx

    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        log DEBUG "Stopping ${SERVICE_NAME}..."
        systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
        sleep 2
    fi
    docker rm -f "${DOCKER_CONTAINER_NAME}" >/dev/null 2>&1 || true
    kill_orphaned_processes

    activate_systemd_unit
    atomic_symlink_swap
    activate_nginx_config

    if ! start_service; then
        log ERROR "Containerized service did not come up healthy"
        exit 1
    fi

    if ! reload_nginx; then
        log WARN "nginx reload failed — new container is up, but nginx config was not reloaded."
        log WARN "Investigate manually: sudo nginx -t && sudo systemctl reload nginx"
    fi

    trim_old_releases || log WARN "trim_old_releases had issues (non-fatal)"
    prune_docker_images || log WARN "Docker image pruning had issues (non-fatal)"
    update_deploy_symlink
    cleanup_orphaned_legacy || log WARN "legacy cleanup had issues (non-fatal)"

    health_check
}

#===============================================================================
# LEGACY MODE — git pull + build on VM (safety net; NOT the production path)
#===============================================================================

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
}

cleanup_git_changes() {
    cd "${GIT_ROOT}"
    git checkout -- "${PROJECT_ROOT}/package.json" "${PROJECT_ROOT}/package-lock.json" 2>/dev/null || true
}

install_dependencies() {
    if [[ "${SKIP_DEPS}" == "true" ]] || [[ "${SKIP_BUILD}" == "true" ]]; then
        log WARN "Skipping dependency install"
        return 0
    fi
    log STEP "Installing dependencies (nice ${BUILD_NICE})..."
    cd "${PROJECT_ROOT}"
    nice -n "${BUILD_NICE}" ionice -c "${BUILD_IONICE_CLASS}" \
        npm ci --loglevel=warn 2>&1 | tee -a "${LOG_FILE}" \
        || { log ERROR "npm ci failed"; exit 1; }
    log SUCCESS "Dependencies installed"
}

build_project() {
    if [[ "${SKIP_BUILD}" == "true" ]]; then
        log WARN "Skipping build (--skip-build)"
        return 0
    fi
    log STEP "Building Next.js (standalone mode)..."
    cd "${PROJECT_ROOT}"
    export NODE_ENV="production"
    export NEXT_BUILD_ID
    NEXT_BUILD_ID="$(git -C "${GIT_ROOT}" rev-parse HEAD 2>/dev/null || echo "local-build")"
    rm -rf "${PROJECT_ROOT}/.next/cache" 2>/dev/null || true
    if ! timeout "${NPM_BUILD_TIMEOUT}" \
            nice -n "${BUILD_NICE}" ionice -c "${BUILD_IONICE_CLASS}" \
            env NODE_OPTIONS="--max-old-space-size=${BUILD_HEAP_MB}" \
            npm run build 2>&1 | tee -a "${LOG_FILE}"; then
        log ERROR "Build failed"
        exit 1
    fi
    [[ -f "${LEGACY_STANDALONE_DIR}/server.js" ]] \
        || { log ERROR "Standalone output not found"; exit 1; }
    log SUCCESS "Build complete"
}

prepare_legacy_standalone() {
    if [[ "${SKIP_BUILD}" == "true" ]]; then return 0; fi
    log STEP "Preparing standalone bundle (legacy mode)..."
    if [[ -d "${PROJECT_ROOT}/.next/static" ]]; then
        mkdir -p "${LEGACY_STANDALONE_DIR}/.next"
        rm -rf "${LEGACY_STANDALONE_DIR}/.next/static"
        cp -r "${PROJECT_ROOT}/.next/static" "${LEGACY_STANDALONE_DIR}/.next/static"
    fi
    if [[ -d "${PROJECT_ROOT}/public" ]]; then
        rm -rf "${LEGACY_STANDALONE_DIR}/public"
        cp -r "${PROJECT_ROOT}/public" "${LEGACY_STANDALONE_DIR}/public"
    fi
    if [[ -f "${LEGACY_ENV_FILE}" ]]; then
        cp "${LEGACY_ENV_FILE}" "${LEGACY_STANDALONE_DIR}/.env.local"
    fi
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${PROJECT_ROOT}/.next"
    local dir="${LEGACY_STANDALONE_DIR}"
    while [[ "${dir}" != "/" ]]; do
        chmod o+x "${dir}" 2>/dev/null || true
        dir="$(dirname "${dir}")"
    done
    chmod -R o+rX "${LEGACY_STANDALONE_DIR}/.next/static" 2>/dev/null || true
    chmod -R o+rX "${LEGACY_STANDALONE_DIR}/public" 2>/dev/null || true
    log SUCCESS "Legacy standalone prepared"
}

ensure_legacy_systemd() {
    log STEP "Writing legacy systemd unit (points at ${LEGACY_STANDALONE_DIR})..."
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
WorkingDirectory=${LEGACY_STANDALONE_DIR}
Environment=LOCAL_TTS_CACHE_DIR=/var/cache/${SERVICE_NAME}/kitten-tts
EnvironmentFile=-${LEGACY_STANDALONE_DIR}/.env.local
Environment=NODE_ENV=production
Environment=PORT=${NEXTJS_PORT}
Environment=HOSTNAME=0.0.0.0
Environment=NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}"
ExecStart=${node_bin} server.js
Restart=on-failure
RestartSec=5
TimeoutStartSec=60
TimeoutStopSec=15
MemoryHigh=${MEMORY_HIGH_MB}M
MemoryMax=${MEMORY_MAX_MB}M
CPUQuota=${CPU_QUOTA_PERCENT}%
OOMScoreAdjust=500
Nice=${SERVICE_NICE}
IOSchedulingClass=best-effort
IOSchedulingPriority=4
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
CacheDirectory=${SERVICE_NAME}/kitten-tts
ReadWritePaths=${PROJECT_ROOT} /var/cache/${SERVICE_NAME}/kitten-tts
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictRealtime=true
RestrictSUIDSGID=true
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}
LogRateLimitIntervalSec=30
LogRateLimitBurst=100
KillMode=control-group

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" &>/dev/null
}

deploy_legacy_nginx() {
    if [[ "${SKIP_NGINX}" == "true" ]]; then
        log WARN "Skipping nginx (--skip-nginx)"
        return 0
    fi
    log STEP "Deploying nginx config (legacy)..."
    if [[ -f "${NGINX_ACTIVE_CONF}" ]]; then
        ROLLBACK_NGINX_BACKUP="${BACKUP_DIR}/${SERVICE_NAME}.backup.$(date +%Y%m%d-%H%M%S)"
        cp "${NGINX_ACTIVE_CONF}" "${ROLLBACK_NGINX_BACKUP}"
    fi
    local tmpl="${PROJECT_ROOT}/${NGINX_CONF_TEMPLATE}"
    sed -e "s|__DOMAIN__|${DOMAIN}|g" \
        -e "s|__NEXTJS_PORT__|${NEXTJS_PORT}|g" \
        -e "s|__SERVICE_NAME__|${SERVICE_NAME}|g" \
        -e "s|__SSL_CERT__|${SSL_CERT}|g" \
        -e "s|__SSL_KEY__|${SSL_KEY}|g" \
        -e "s|__STANDALONE_DIR__|${LEGACY_STANDALONE_DIR}|g" \
        "${tmpl}" > "${NGINX_ACTIVE_CONF}"
    chmod 644 "${NGINX_ACTIVE_CONF}"
    local symlink="${NGINX_SITES_ENABLED}/${SERVICE_NAME}"
    [[ -L "${symlink}" ]] || ln -sf "${NGINX_ACTIVE_CONF}" "${symlink}"
    mkdir -p "/var/cache/nginx/${SERVICE_NAME}"
    chown www-data:www-data "/var/cache/nginx/${SERVICE_NAME}"
    if ! nginx -t &>/dev/null; then
        log ERROR "nginx -t failed"
        exit 1
    fi
    systemctl reload nginx
}

legacy_deploy() {
    log INFO "Mode: legacy (build on VM — emergency recovery path)"
    log WARN "Legacy mode is for emergency recovery only. Normal deploys use artifact mode."

    check_ssl_certs
    if [[ "${SKIP_GIT}" != "true" ]]; then check_git_status; fi
    kill_orphaned_processes
    git_pull
    install_dependencies
    build_project
    prepare_legacy_standalone
    cleanup_git_changes
    ensure_legacy_systemd

    systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
    systemctl start "${SERVICE_NAME}"
    local i=0
    while [[ $i -lt ${HEALTH_CHECK_RETRIES} ]]; do
        if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${NEXTJS_PORT}/" 2>/dev/null; then
            log SUCCESS "Service up (${i}s)"
            break
        fi
        i=$((i + 1))
        sleep 1
    done
    [[ $i -ge ${HEALTH_CHECK_RETRIES} ]] && { log ERROR "Service failed to start"; exit 1; }

    deploy_legacy_nginx
    health_check
}

#===============================================================================
# HEALTH CHECK (shared)
#===============================================================================

health_check() {
    log STEP "Running health checks..."

    local passed=0
    local total=0

    total=$((total + 1))
    systemctl is-active --quiet nginx && { log DEBUG "✓ Nginx"; passed=$((passed + 1)); } \
        || log WARN "✗ Nginx not running"

    total=$((total + 1))
    systemctl is-active --quiet "${SERVICE_NAME}" && { log DEBUG "✓ ${SERVICE_NAME}"; passed=$((passed + 1)); } \
        || log WARN "✗ ${SERVICE_NAME} not running"

    total=$((total + 1))
    ss -tlnp | grep -q ":${NEXTJS_PORT} " && { log DEBUG "✓ Port ${NEXTJS_PORT}"; passed=$((passed + 1)); } \
        || log WARN "✗ Port ${NEXTJS_PORT} not listening"

    total=$((total + 1))
    local http_code
    http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 5 \
        "https://127.0.0.1/" -H "Host: ${DOMAIN}" 2>/dev/null || echo "000")
    if [[ "${http_code}" =~ ^(200|301|302)$ ]]; then
        log DEBUG "✓ HTTPS: ${http_code}"; passed=$((passed + 1))
    else
        log WARN "? HTTPS: ${http_code}"; passed=$((passed + 1))
    fi

    total=$((total + 1))
    local chat_code
    chat_code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 20 \
        -X POST -H "Content-Type: application/json" \
        -d '{"messages":[{"role":"user","content":"health check"}]}' \
        "http://127.0.0.1:${NEXTJS_PORT}/api/chat" 2>/dev/null || echo "000")
    if [[ "${chat_code}" == "200" ]] || [[ "${chat_code}" == "429" ]]; then
        log DEBUG "✓ Chat API: ${chat_code}"; passed=$((passed + 1))
    else
        log WARN "? Chat API: ${chat_code}"; passed=$((passed + 1))
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
    echo -e "  ${CYAN}•${NC} Mode:      ${MODE}"
    echo -e "  ${CYAN}•${NC} Site:      ${SERVICE_NAME}"
    echo -e "  ${CYAN}•${NC} Domain:    ${DOMAIN}"
    if [[ "${MODE}" == "artifact" ]]; then
        echo -e "  ${CYAN}•${NC} SHA:       ${RELEASE_SHA}"
        echo -e "  ${CYAN}•${NC} Current:   ${DEPLOY_CURRENT_LINK} → $(readlink ${DEPLOY_CURRENT_LINK} 2>/dev/null || echo '?')"
        echo -e "  ${CYAN}•${NC} Releases:  $(find ${DEPLOY_RELEASES_DIR} -mindepth 1 -maxdepth 1 -type d | wc -l) on disk"
    elif [[ "${MODE}" == "image" ]]; then
        echo -e "  ${CYAN}•${NC} SHA:       ${RELEASE_SHA}"
        echo -e "  ${CYAN}•${NC} Image:     ${DOCKER_IMAGE}"
        echo -e "  ${CYAN}•${NC} Container: ${DOCKER_CONTAINER_NAME}"
        echo -e "  ${CYAN}•${NC} Current:   ${DEPLOY_CURRENT_LINK} → $(readlink ${DEPLOY_CURRENT_LINK} 2>/dev/null || echo '?')"
        echo -e "  ${CYAN}•${NC} Releases:  $(find ${DEPLOY_RELEASES_DIR} -mindepth 1 -maxdepth 1 -type d | wc -l) on disk"
    fi
    echo -e "  ${CYAN}•${NC} Service:   ${SERVICE_NAME}.service (port ${NEXTJS_PORT}, heap=${NODE_HEAP_MB}MB)"
    echo -e "  ${CYAN}•${NC} Log:       ${LOG_FILE}"
    echo ""
    echo -e "${GREEN}Live at: https://${DOMAIN}${NC}"
    echo ""
}

#===============================================================================
# MAIN
#===============================================================================

main() {
    DEPLOYMENT_START_TIME=$(date +%s)

    setup_directories

    # Mutex — prevent overlapping deploys on the same VM
    exec 9>"${DEPLOY_LOCK_FILE}"
    if ! flock -n 9; then
        log ERROR "Another deploy is in progress (lock: ${DEPLOY_LOCK_FILE})"
        exit 1
    fi

    trap cleanup EXIT

    parse_arguments "$@"

    log_separator
    log INFO "Starting ${MODE} deployment: site=${SITE_NAME} at $(date)"
    [[ -n "${RELEASE_SHA}" ]] && log INFO "SHA: ${RELEASE_SHA}"
    log INFO "Config: ${SITE_CONF}"
    log INFO "Log: ${LOG_FILE}"
    log_separator

    # Shared preflight
    check_root
    check_dependencies
    check_disk_space
    cleanup_old_artifacts

    # Mode dispatch
    if [[ "${MODE}" == "artifact" ]]; then
        artifact_deploy
    elif [[ "${MODE}" == "image" ]]; then
        image_deploy
    else
        legacy_deploy
    fi

    print_summary
}

main "$@"
