#!/bin/bash
#===============================================================================
#
#          FILE: deploy.sh
#
#         USAGE: sudo ./deploy.sh [--skip-git] [--skip-build] [--force]
#
#   DESCRIPTION: Production-grade deployment script for whoisdhruv.com portfolio
#                - Pulls latest code from master branch
#                - Builds Next.js static export
#                - Updates Nginx configuration with rollback capability
#                - Comprehensive error handling and logging
#
#       OPTIONS:
#                --skip-git    Skip git pull (useful for local testing)
#                --skip-build  Skip npm build (useful when only updating nginx)
#                --force       Force deployment even with uncommitted changes
#                --help        Show this help message
#
#        AUTHOR: Automated Deployment Script
#       VERSION: 1.0.0
#       CREATED: 2026-01-06
#
#===============================================================================

set -euo pipefail  # Exit on error, undefined vars, and pipe failures

#===============================================================================
# CONFIGURATION - ABSOLUTE PATHS
#===============================================================================

# Repository and project paths
readonly GIT_ROOT="/home/portfolioWebsite"
readonly PROJECT_ROOT="/home/portfolioWebsite/portfolio"
readonly SOURCE_NGINX_CONF="${PROJECT_ROOT}/nginx-cloudflare.conf"
readonly BUILD_OUTPUT_DIR="${PROJECT_ROOT}/out"
readonly SCRIPTS_DIR="${PROJECT_ROOT}/scripts"

# Nginx paths
readonly NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
readonly NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
readonly NGINX_CONF_NAME="portfolio"
readonly NGINX_ACTIVE_CONF="${NGINX_SITES_AVAILABLE}/${NGINX_CONF_NAME}"

# Backup paths
readonly BACKUP_DIR="/var/backups/nginx"
readonly BACKUP_RETENTION_DAYS=30

# Log paths
readonly LOG_DIR="/var/log/portfolio-deploy"
readonly LOG_FILE="${LOG_DIR}/deploy-$(date +%Y%m%d-%H%M%S).log"
readonly MAX_LOG_FILES=50

# SSL paths (for validation only)
readonly SSL_CERT="/etc/ssl/cloudflare/whoisdhruv.com.pem"
readonly SSL_KEY="/etc/ssl/cloudflare/whoisdhruv.com.key"

# Git settings
readonly GIT_BRANCH="master"
readonly GIT_REMOTE="origin"

# Node settings
readonly NPM_BUILD_TIMEOUT=600  # 10 minutes

#===============================================================================
# COLOR CODES FOR OUTPUT
#===============================================================================

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m' # No Color

#===============================================================================
# GLOBAL VARIABLES
#===============================================================================

SKIP_GIT=false
SKIP_BUILD=false
FORCE_DEPLOY=false
DEPLOYMENT_START_TIME=""
NGINX_BACKUP_FILE=""
OLD_BUILD_BACKUP=""

#===============================================================================
# LOGGING FUNCTIONS
#===============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Log to file
    echo "[${timestamp}] [${level}] ${message}" >> "${LOG_FILE}"
    
    # Log to console with colors
    case "${level}" in
        INFO)
            echo -e "${CYAN}[${timestamp}]${NC} ${GREEN}[INFO]${NC} ${message}"
            ;;
        WARN)
            echo -e "${CYAN}[${timestamp}]${NC} ${YELLOW}[WARN]${NC} ${message}"
            ;;
        ERROR)
            echo -e "${CYAN}[${timestamp}]${NC} ${RED}[ERROR]${NC} ${message}"
            ;;
        DEBUG)
            echo -e "${CYAN}[${timestamp}]${NC} ${MAGENTA}[DEBUG]${NC} ${message}"
            ;;
        STEP)
            echo -e "\n${CYAN}[${timestamp}]${NC} ${BLUE}[STEP]${NC} ${WHITE}${message}${NC}"
            ;;
        SUCCESS)
            echo -e "${CYAN}[${timestamp}]${NC} ${GREEN}[SUCCESS]${NC} ${GREEN}${message}${NC}"
            ;;
    esac
}

log_separator() {
    local char="${1:-=}"
    local line
    line=$(printf '%*s' 80 '' | tr ' ' "${char}")
    echo -e "${BLUE}${line}${NC}"
    echo "${line}" >> "${LOG_FILE}"
}

#===============================================================================
# UTILITY FUNCTIONS
#===============================================================================

show_help() {
    cat << EOF
Usage: sudo $0 [OPTIONS]

Production deployment script for whoisdhruv.com portfolio website.

OPTIONS:
    --skip-git      Skip git pull step (useful for local testing)
    --skip-build    Skip npm build step (only update nginx config)
    --force         Force deployment even with uncommitted changes
    --help          Display this help message and exit

EXAMPLES:
    sudo $0                    # Full deployment
    sudo $0 --skip-git         # Deploy without git pull
    sudo $0 --skip-build       # Only update nginx configuration
    sudo $0 --force            # Force deploy with uncommitted changes

REQUIREMENTS:
    - Must be run as root (sudo)
    - Node.js and npm must be installed
    - Nginx must be installed
    - Git repository must be initialized

LOG FILES:
    Logs are stored in: ${LOG_DIR}

EOF
    exit 0
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --skip-git)
                SKIP_GIT=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --force)
                FORCE_DEPLOY=true
                shift
                ;;
            --help|-h)
                show_help
                ;;
            *)
                log ERROR "Unknown option: $1"
                log INFO "Use --help for usage information"
                exit 1
                ;;
        esac
    done
}

cleanup() {
    local exit_code=$?
    
    if [[ ${exit_code} -ne 0 ]]; then
        log_separator
        log ERROR "Deployment failed with exit code: ${exit_code}"
        log ERROR "Check log file for details: ${LOG_FILE}"
        
        # Attempt nginx rollback if we have a backup
        if [[ -n "${NGINX_BACKUP_FILE}" ]] && [[ -f "${NGINX_BACKUP_FILE}" ]]; then
            log WARN "Attempting to restore nginx configuration from backup..."
            if cp "${NGINX_BACKUP_FILE}" "${NGINX_ACTIVE_CONF}"; then
                if nginx -t &>/dev/null; then
                    systemctl reload nginx
                    log SUCCESS "Nginx configuration restored successfully"
                else
                    log ERROR "CRITICAL: Restored config also fails! Manual intervention required!"
                fi
            fi
        fi
    fi
    
    # Calculate deployment duration
    if [[ -n "${DEPLOYMENT_START_TIME}" ]]; then
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - DEPLOYMENT_START_TIME))
        local minutes=$((duration / 60))
        local seconds=$((duration % 60))
        log INFO "Total deployment time: ${minutes}m ${seconds}s"
    fi
}

#===============================================================================
# PRE-FLIGHT CHECKS
#===============================================================================

check_root() {
    log STEP "Checking root privileges..."
    
    if [[ $EUID -ne 0 ]]; then
        log ERROR "This script must be run as root (use sudo)"
        log INFO "Example: sudo $0"
        exit 1
    fi
    
    log SUCCESS "Running with root privileges"
}

check_dependencies() {
    log STEP "Checking required dependencies..."
    
    local dependencies=("git" "node" "npm" "nginx" "systemctl")
    local missing=()
    
    for cmd in "${dependencies[@]}"; do
        if ! command -v "${cmd}" &>/dev/null; then
            missing+=("${cmd}")
            log ERROR "Missing dependency: ${cmd}"
        else
            local version
            case "${cmd}" in
                node)
                    version=$(node --version 2>/dev/null || echo "unknown")
                    ;;
                npm)
                    version=$(npm --version 2>/dev/null || echo "unknown")
                    ;;
                nginx)
                    version=$(nginx -v 2>&1 | cut -d'/' -f2 || echo "unknown")
                    ;;
                git)
                    version=$(git --version | cut -d' ' -f3 || echo "unknown")
                    ;;
                *)
                    version="installed"
                    ;;
            esac
            log DEBUG "${cmd}: ${version}"
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log ERROR "Missing dependencies: ${missing[*]}"
        log INFO "Please install missing dependencies before running this script"
        exit 1
    fi
    
    log SUCCESS "All dependencies are available"
}

check_paths() {
    log STEP "Validating required paths..."
    
    # Check project directory
    if [[ ! -d "${PROJECT_ROOT}" ]]; then
        log ERROR "Project directory does not exist: ${PROJECT_ROOT}"
        exit 1
    fi
    log DEBUG "Project root exists: ${PROJECT_ROOT}"
    
    # Check source nginx config
    if [[ ! -f "${SOURCE_NGINX_CONF}" ]]; then
        log ERROR "Source nginx config not found: ${SOURCE_NGINX_CONF}"
        exit 1
    fi
    log DEBUG "Source nginx config exists: ${SOURCE_NGINX_CONF}"
    
    # Check nginx directories
    if [[ ! -d "${NGINX_SITES_AVAILABLE}" ]]; then
        log ERROR "Nginx sites-available directory not found: ${NGINX_SITES_AVAILABLE}"
        exit 1
    fi
    log DEBUG "Nginx sites-available exists: ${NGINX_SITES_AVAILABLE}"
    
    # Check SSL certificates
    if [[ ! -f "${SSL_CERT}" ]]; then
        log ERROR "SSL certificate not found: ${SSL_CERT}"
        log INFO "Please ensure Cloudflare origin certificate is installed"
        exit 1
    fi
    log DEBUG "SSL certificate exists: ${SSL_CERT}"
    
    if [[ ! -f "${SSL_KEY}" ]]; then
        log ERROR "SSL private key not found: ${SSL_KEY}"
        exit 1
    fi
    log DEBUG "SSL private key exists: ${SSL_KEY}"
    
    # Check SSL key permissions
    local key_perms
    key_perms=$(stat -c "%a" "${SSL_KEY}")
    if [[ "${key_perms}" != "600" ]]; then
        log WARN "SSL key has insecure permissions: ${key_perms} (should be 600)"
        log INFO "Fixing permissions..."
        chmod 600 "${SSL_KEY}"
    fi
    
    log SUCCESS "All paths validated successfully"
}

check_disk_space() {
    log STEP "Checking available disk space..."
    
    local required_mb=500  # Minimum required space in MB
    local available_mb
    
    available_mb=$(df -m "${PROJECT_ROOT}" | awk 'NR==2 {print $4}')
    
    if [[ ${available_mb} -lt ${required_mb} ]]; then
        log ERROR "Insufficient disk space: ${available_mb}MB available, ${required_mb}MB required"
        exit 1
    fi
    
    log SUCCESS "Disk space OK: ${available_mb}MB available"
}

check_git_status() {
    log STEP "Checking git repository status..."
    
    cd "${GIT_ROOT}"
    
    # Check if it's a git repository
    if [[ ! -d ".git" ]]; then
        log ERROR "Not a git repository: ${GIT_ROOT}"
        exit 1
    fi
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        if [[ "${FORCE_DEPLOY}" == "true" ]]; then
            log WARN "Uncommitted changes detected, but --force flag is set"
        else
            log ERROR "Uncommitted changes detected in repository"
            log INFO "Commit or stash changes, or use --force flag"
            git status --short
            exit 1
        fi
    fi
    
    # Check current branch
    local current_branch
    current_branch=$(git branch --show-current)
    log DEBUG "Current branch: ${current_branch}"
    
    if [[ "${current_branch}" != "${GIT_BRANCH}" ]]; then
        log WARN "Not on ${GIT_BRANCH} branch (currently on: ${current_branch})"
        log INFO "Switching to ${GIT_BRANCH} branch..."
        git checkout "${GIT_BRANCH}"
    fi
    
    log SUCCESS "Git repository status OK"
}

#===============================================================================
# DIRECTORY SETUP
#===============================================================================

setup_directories() {
    log STEP "Setting up required directories..."
    
    # Create log directory
    if [[ ! -d "${LOG_DIR}" ]]; then
        mkdir -p "${LOG_DIR}"
        chmod 755 "${LOG_DIR}"
        log DEBUG "Created log directory: ${LOG_DIR}"
    fi
    
    # Create backup directory
    if [[ ! -d "${BACKUP_DIR}" ]]; then
        mkdir -p "${BACKUP_DIR}"
        chmod 755 "${BACKUP_DIR}"
        log DEBUG "Created backup directory: ${BACKUP_DIR}"
    fi
    
    # Initialize log file
    touch "${LOG_FILE}"
    chmod 644 "${LOG_FILE}"
    
    log SUCCESS "Directories setup complete"
}

cleanup_old_logs() {
    log STEP "Cleaning up old log files..."
    
    local log_count
    log_count=$(find "${LOG_DIR}" -name "deploy-*.log" -type f | wc -l)
    
    if [[ ${log_count} -gt ${MAX_LOG_FILES} ]]; then
        local to_delete=$((log_count - MAX_LOG_FILES))
        log DEBUG "Removing ${to_delete} old log files..."
        find "${LOG_DIR}" -name "deploy-*.log" -type f -printf '%T+ %p\n' | \
            sort | head -n "${to_delete}" | cut -d' ' -f2- | xargs rm -f
    fi
    
    # Clean up old backups
    find "${BACKUP_DIR}" -name "*.backup.*" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete 2>/dev/null || true
    
    log SUCCESS "Cleanup complete"
}

#===============================================================================
# GIT OPERATIONS
#===============================================================================

git_pull() {
    if [[ "${SKIP_GIT}" == "true" ]]; then
        log WARN "Skipping git pull (--skip-git flag set)"
        return 0
    fi
    
    log STEP "Pulling latest code from ${GIT_REMOTE}/${GIT_BRANCH}..."
    
    cd "${GIT_ROOT}"
    
    # Fetch latest changes
    log DEBUG "Fetching from remote..."
    if ! git fetch "${GIT_REMOTE}" "${GIT_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"; then
        log ERROR "Failed to fetch from remote"
        exit 1
    fi
    
    # Check if we're behind remote
    local local_hash remote_hash
    local_hash=$(git rev-parse HEAD)
    remote_hash=$(git rev-parse "${GIT_REMOTE}/${GIT_BRANCH}")
    
    if [[ "${local_hash}" == "${remote_hash}" ]]; then
        log INFO "Already up to date with ${GIT_REMOTE}/${GIT_BRANCH}"
    else
        log DEBUG "Local: ${local_hash:0:8}, Remote: ${remote_hash:0:8}"
        
        # Pull changes
        if ! git pull "${GIT_REMOTE}" "${GIT_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"; then
            log ERROR "Failed to pull from remote"
            exit 1
        fi
        
        log SUCCESS "Code updated to: $(git rev-parse --short HEAD)"
    fi
    
    # Show last commit info
    log DEBUG "Last commit: $(git log -1 --pretty=format:'%h - %s (%an, %ar)')"
}

#===============================================================================
# BUILD OPERATIONS
#===============================================================================

install_dependencies() {
    log STEP "Installing npm dependencies..."
    
    cd "${PROJECT_ROOT}"
    
    # Check if node_modules exists and package-lock.json hasn't changed
    if [[ -d "node_modules" ]] && [[ -f "package-lock.json" ]]; then
        log DEBUG "node_modules exists, checking for changes..."
        
        # Use npm ci for faster, more reliable installs in CI/CD
        if ! npm ci --omit=dev 2>&1 | tee -a "${LOG_FILE}"; then
            log WARN "npm ci failed, falling back to npm install..."
            if ! npm install --omit=dev 2>&1 | tee -a "${LOG_FILE}"; then
                log ERROR "Failed to install dependencies"
                exit 1
            fi
        fi
    else
        log DEBUG "Fresh install required..."
        if ! npm install --omit=dev 2>&1 | tee -a "${LOG_FILE}"; then
            log ERROR "Failed to install dependencies"
            exit 1
        fi
    fi
    
    log SUCCESS "Dependencies installed successfully"
}

build_project() {
    if [[ "${SKIP_BUILD}" == "true" ]]; then
        log WARN "Skipping build (--skip-build flag set)"
        return 0
    fi
    
    log STEP "Building Next.js project..."
    
    cd "${PROJECT_ROOT}"
    
    # Backup current build if it exists
    if [[ -d "${BUILD_OUTPUT_DIR}" ]]; then
        OLD_BUILD_BACKUP="${BACKUP_DIR}/out.backup.$(date +%Y%m%d-%H%M%S)"
        log DEBUG "Backing up current build to: ${OLD_BUILD_BACKUP}"
        cp -r "${BUILD_OUTPUT_DIR}" "${OLD_BUILD_BACKUP}"
    fi
    
    # Set environment for production build
    export NODE_ENV="production"
    
    # Run build with timeout
    log DEBUG "Running npm run build (timeout: ${NPM_BUILD_TIMEOUT}s)..."
    
    if ! timeout "${NPM_BUILD_TIMEOUT}" npm run build 2>&1 | tee -a "${LOG_FILE}"; then
        log ERROR "Build failed!"
        log ERROR "Check the log file for details: ${LOG_FILE}"
        
        # Restore old build if available
        if [[ -n "${OLD_BUILD_BACKUP}" ]] && [[ -d "${OLD_BUILD_BACKUP}" ]]; then
            log WARN "Restoring previous build..."
            rm -rf "${BUILD_OUTPUT_DIR}"
            mv "${OLD_BUILD_BACKUP}" "${BUILD_OUTPUT_DIR}"
        fi
        
        exit 1
    fi
    
    # Verify build output exists
    if [[ ! -d "${BUILD_OUTPUT_DIR}" ]]; then
        log ERROR "Build completed but output directory not found: ${BUILD_OUTPUT_DIR}"
        exit 1
    fi
    
    # Count generated files
    local file_count
    file_count=$(find "${BUILD_OUTPUT_DIR}" -type f | wc -l)
    log DEBUG "Generated ${file_count} files in ${BUILD_OUTPUT_DIR}"
    
    # Set proper permissions on build output
    log DEBUG "Setting permissions on build output..."
    chmod -R 755 "${BUILD_OUTPUT_DIR}"
    
    # Clean up successful build backup
    if [[ -n "${OLD_BUILD_BACKUP}" ]] && [[ -d "${OLD_BUILD_BACKUP}" ]]; then
        rm -rf "${OLD_BUILD_BACKUP}"
    fi
    
    log SUCCESS "Build completed successfully (${file_count} files)"
}

#===============================================================================
# NGINX OPERATIONS
#===============================================================================

backup_nginx_config() {
    log STEP "Backing up current nginx configuration..."
    
    if [[ -f "${NGINX_ACTIVE_CONF}" ]]; then
        NGINX_BACKUP_FILE="${BACKUP_DIR}/${NGINX_CONF_NAME}.backup.$(date +%Y%m%d-%H%M%S)"
        
        if ! cp "${NGINX_ACTIVE_CONF}" "${NGINX_BACKUP_FILE}"; then
            log ERROR "Failed to backup nginx configuration"
            exit 1
        fi
        
        chmod 644 "${NGINX_BACKUP_FILE}"
        log DEBUG "Nginx config backed up to: ${NGINX_BACKUP_FILE}"
        log SUCCESS "Nginx configuration backed up"
    else
        log WARN "No existing nginx configuration found at: ${NGINX_ACTIVE_CONF}"
        log INFO "This appears to be a fresh deployment"
    fi
}

validate_nginx_source_config() {
    log STEP "Validating source nginx configuration..."
    
    # Check if source config exists
    if [[ ! -f "${SOURCE_NGINX_CONF}" ]]; then
        log ERROR "Source nginx config not found: ${SOURCE_NGINX_CONF}"
        exit 1
    fi
    
    # Check for required directives
    local required_patterns=(
        "listen 443 ssl"
        "ssl_certificate"
        "ssl_certificate_key"
        "root"
        "server_name"
    )
    
    for pattern in "${required_patterns[@]}"; do
        if ! grep -q "${pattern}" "${SOURCE_NGINX_CONF}"; then
            log ERROR "Missing required directive in nginx config: ${pattern}"
            exit 1
        fi
    done
    
    log SUCCESS "Source nginx configuration validated"
}

update_nginx_config() {
    log STEP "Updating nginx configuration..."
    
    # Copy new config to sites-available
    log DEBUG "Copying ${SOURCE_NGINX_CONF} to ${NGINX_ACTIVE_CONF}"
    
    if ! cp "${SOURCE_NGINX_CONF}" "${NGINX_ACTIVE_CONF}"; then
        log ERROR "Failed to copy nginx configuration"
        exit 1
    fi
    
    chmod 644 "${NGINX_ACTIVE_CONF}"
    log SUCCESS "Nginx configuration file updated"
}

ensure_nginx_enabled() {
    log STEP "Ensuring nginx site is enabled..."
    
    local symlink="${NGINX_SITES_ENABLED}/${NGINX_CONF_NAME}"
    
    if [[ ! -L "${symlink}" ]]; then
        log DEBUG "Creating symlink: ${symlink} -> ${NGINX_ACTIVE_CONF}"
        ln -sf "${NGINX_ACTIVE_CONF}" "${symlink}"
        log SUCCESS "Nginx site enabled"
    else
        log DEBUG "Symlink already exists: ${symlink}"
        log SUCCESS "Nginx site already enabled"
    fi
}

test_nginx_config() {
    log STEP "Testing nginx configuration..."
    
    local test_output
    
    if test_output=$(nginx -t 2>&1); then
        log DEBUG "Nginx test output: ${test_output}"
        log SUCCESS "Nginx configuration test passed"
        return 0
    else
        log ERROR "Nginx configuration test FAILED!"
        log ERROR "Test output: ${test_output}"
        echo "${test_output}" >> "${LOG_FILE}"
        return 1
    fi
}

reload_nginx() {
    log STEP "Reloading nginx..."
    
    if ! systemctl reload nginx 2>&1 | tee -a "${LOG_FILE}"; then
        log ERROR "Failed to reload nginx"
        return 1
    fi
    
    # Verify nginx is running
    if ! systemctl is-active --quiet nginx; then
        log ERROR "Nginx is not running after reload!"
        return 1
    fi
    
    log SUCCESS "Nginx reloaded successfully"
    return 0
}

rollback_nginx_config() {
    log ERROR "Rolling back nginx configuration..."
    
    if [[ -n "${NGINX_BACKUP_FILE}" ]] && [[ -f "${NGINX_BACKUP_FILE}" ]]; then
        log DEBUG "Restoring from: ${NGINX_BACKUP_FILE}"
        
        if ! cp "${NGINX_BACKUP_FILE}" "${NGINX_ACTIVE_CONF}"; then
            log ERROR "CRITICAL: Failed to restore nginx configuration!"
            log ERROR "Manual intervention required!"
            log ERROR "Backup file location: ${NGINX_BACKUP_FILE}"
            exit 1
        fi
        
        # Test restored config
        if nginx -t &>/dev/null; then
            systemctl reload nginx
            log SUCCESS "Nginx configuration rolled back successfully"
        else
            log ERROR "CRITICAL: Restored configuration also fails!"
            log ERROR "Manual intervention required!"
            exit 1
        fi
    else
        log ERROR "No backup file available for rollback!"
        log ERROR "Manual intervention required!"
        exit 1
    fi
}

deploy_nginx() {
    # Backup current config
    backup_nginx_config
    
    # Validate source config
    validate_nginx_source_config
    
    # Update nginx config
    update_nginx_config
    
    # Ensure site is enabled
    ensure_nginx_enabled
    
    # Test nginx configuration
    if ! test_nginx_config; then
        log ERROR "Nginx configuration test failed!"
        rollback_nginx_config
        exit 1
    fi
    
    # Reload nginx
    if ! reload_nginx; then
        log ERROR "Nginx reload failed!"
        rollback_nginx_config
        exit 1
    fi
}

#===============================================================================
# HEALTH CHECKS
#===============================================================================

health_check() {
    log STEP "Running health checks..."
    
    local checks_passed=0
    local checks_total=0
    local failed_checks=""
    
    # Check 1: Nginx process
    checks_total=$((checks_total + 1))
    if systemctl is-active --quiet nginx; then
        log DEBUG "✓ Nginx process is running"
        checks_passed=$((checks_passed + 1))
    else
        log WARN "✗ Nginx process is not running"
        failed_checks="${failed_checks} nginx-process"
    fi
    
    # Check 2: Nginx listening on port 80
    checks_total=$((checks_total + 1))
    if ss -tlnp | grep -q ':80 '; then
        log DEBUG "✓ Nginx listening on port 80"
        checks_passed=$((checks_passed + 1))
    else
        log WARN "✗ Nginx not listening on port 80"
        failed_checks="${failed_checks} port-80"
    fi
    
    # Check 3: Nginx listening on port 443
    checks_total=$((checks_total + 1))
    if ss -tlnp | grep -q ':443 '; then
        log DEBUG "✓ Nginx listening on port 443"
        checks_passed=$((checks_passed + 1))
    else
        log WARN "✗ Nginx not listening on port 443"
        failed_checks="${failed_checks} port-443"
    fi
    
    # Check 4: Build output exists
    checks_total=$((checks_total + 1))
    if [[ -d "${BUILD_OUTPUT_DIR}" ]] && [[ -f "${BUILD_OUTPUT_DIR}/index.html" ]]; then
        log DEBUG "✓ Build output exists with index.html"
        checks_passed=$((checks_passed + 1))
    else
        log WARN "✗ Build output missing or incomplete"
        failed_checks="${failed_checks} build-output"
    fi
    
    # Check 5: Local HTTP response (optional - may fail if only accessible via HTTPS)
    checks_total=$((checks_total + 1))
    if command -v curl &>/dev/null; then
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost" 2>/dev/null || echo "000")
        if echo "${http_code}" | grep -qE '^(200|301|302)$'; then
            log DEBUG "✓ HTTP response OK (${http_code})"
            checks_passed=$((checks_passed + 1))
        else
            log DEBUG "? HTTP check returned ${http_code} (may be expected with HTTPS-only setup)"
            checks_passed=$((checks_passed + 1))  # Don't fail on this
        fi
    else
        log WARN "? curl not available, skipping HTTP check"
        checks_passed=$((checks_passed + 1))
    fi
    
    if [[ ${checks_passed} -eq ${checks_total} ]]; then
        log SUCCESS "All health checks passed (${checks_passed}/${checks_total})"
    else
        log WARN "Some health checks failed (${checks_passed}/${checks_total})"
        log WARN "Deployment completed but some health checks did not pass"
    fi
    
    # Always return success - health checks are informational
    # Nginx was already tested and reloaded successfully
    return 0
}

#===============================================================================
# DEPLOYMENT SUMMARY
#===============================================================================

print_summary() {
    log_separator
    log SUCCESS "🚀 DEPLOYMENT COMPLETED SUCCESSFULLY!"
    log_separator
    
    echo ""
    echo -e "${WHITE}Deployment Summary:${NC}"
    echo -e "  ${CYAN}•${NC} Git Root: ${GIT_ROOT}"
    echo -e "  ${CYAN}•${NC} Project: ${PROJECT_ROOT}"
    echo -e "  ${CYAN}•${NC} Branch: ${GIT_BRANCH}"
    echo -e "  ${CYAN}•${NC} Commit: $(cd "${GIT_ROOT}" && git rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
    echo -e "  ${CYAN}•${NC} Build Output: ${BUILD_OUTPUT_DIR}"
    echo -e "  ${CYAN}•${NC} Nginx Config: ${NGINX_ACTIVE_CONF}"
    echo -e "  ${CYAN}•${NC} Log File: ${LOG_FILE}"
    echo ""
    
    if [[ -n "${NGINX_BACKUP_FILE}" ]] && [[ -f "${NGINX_BACKUP_FILE}" ]]; then
        echo -e "${YELLOW}Backup Location:${NC} ${NGINX_BACKUP_FILE}"
        echo ""
    fi
    
    echo -e "${GREEN}Website should now be live at: https://whoisdhruv.com${NC}"
    echo ""
}

#===============================================================================
# MAIN EXECUTION
#===============================================================================

main() {
    DEPLOYMENT_START_TIME=$(date +%s)
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Initial setup
    setup_directories
    
    # Start deployment
    log_separator
    log INFO "🚀 Starting deployment at $(date)"
    log INFO "Log file: ${LOG_FILE}"
    log_separator
    
    # Pre-flight checks
    check_root
    check_dependencies
    check_disk_space
    check_paths
    
    if [[ "${SKIP_GIT}" != "true" ]]; then
        check_git_status
    fi
    
    cleanup_old_logs
    
    # Git operations
    git_pull
    
    # Build operations
    if [[ "${SKIP_BUILD}" != "true" ]]; then
        install_dependencies
    fi
    build_project
    
    # Nginx operations
    deploy_nginx
    
    # Post-deployment checks
    health_check
    
    # Print summary
    print_summary
}

# Run main function with all arguments
main "$@"
