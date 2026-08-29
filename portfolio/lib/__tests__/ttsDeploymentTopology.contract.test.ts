import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const deployScript = fs.readFileSync(path.join(projectRoot, 'scripts', 'deploy.sh'), 'utf8');
const nginxTemplate = fs.readFileSync(path.join(projectRoot, 'nginx-cloudflare.conf'), 'utf8');
function readWorkflow(filename: string): string {
  return fs.readFileSync(path.join(projectRoot, '..', '.github', 'workflows', filename), 'utf8')
    .replace(/\r\n/g, '\n');
}

const stagingWorkflow = readWorkflow('deploy-staging.yml');
const productionWorkflow = readWorkflow('deploy.yml');
const rollbackWorkflow = readWorkflow('rollback-production.yml');

describe('centralized Pocket TTS deployment topology', () => {
  it('validates persistent local and remote site roles before rendering', () => {
    expect(deployScript).toContain('readonly TTS_NODE_MODE="${TTS_NODE_MODE:-local}"');
    expect(deployScript).toContain('local|remote)');
    expect(deployScript).toContain('^[A-Za-z0-9_-]{32,128}$');
    expect(deployScript).toContain('^http://([0-9]{1,3}(\\.[0-9]{1,3}){3}):([0-9]{1,5})$');
    expect(deployScript).toContain('is_private_ipv4 "${remote_ip}"');
    expect(deployScript).toContain('is_private_ipv4 "${listen_ip}"');
    expect(deployScript).toContain('TTS_ALLOWED_CLIENTS entries must be RFC1918');
  });

  it('keeps model resources local while allowing the remote memory profile', () => {
    expect(deployScript).toContain('docker_tts_runtime_args="--env TTS_NODE_MODE=remote"');
    expect(deployScript).toContain('if [[ "${TTS_NODE_MODE}" == "local" ]]');
    expect(deployScript).toContain('resolve_docker_tts_runtime_config');
    expect(deployScript).toContain('ensure_tts_cache_dir');
    expect(deployScript).toMatch(/TTS_NODE_MODE[^]*local[^]*MEMORY_MAX_MB < 1536/);
    expect(deployScript).toContain('--skip-nginx is unsafe for remote TTS nodes');
  });

  it('renders only the TTS route to the selected streaming upstream', () => {
    expect(nginxTemplate).toContain('location = /api/tts');
    expect(nginxTemplate).toContain('proxy_pass __TTS_PROXY_TARGET__;');
    expect(nginxTemplate).toContain('__TTS_PROXY_TOKEN_HEADER__');
    expect(nginxTemplate).toContain('proxy_set_header Origin $http_origin;');
    expect(nginxTemplate).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    expect(nginxTemplate).toContain('proxy_set_header X-Forwarded-Host $host;');
    expect(nginxTemplate).toContain('proxy_buffering off;');
    expect(nginxTemplate).toContain('proxy_cache off;');
    expect(nginxTemplate).toContain('proxy_read_timeout 120s;');
  });

  it('generates an authenticated private gateway only for local nodes', () => {
    expect(deployScript).toContain('listen ${TTS_PRIVATE_LISTEN};');
    expect(deployScript).toContain('location = /api/tts');
    expect(deployScript).toContain('$http_x_portfolio_tts_token != "${TTS_BACKEND_TOKEN}"');
    expect(deployScript).toContain('allow 127.0.0.1;');
    expect(deployScript).toContain("printf '        allow %s;\\n'");
    expect(deployScript).toContain('deny all;');
    expect(deployScript).toContain('proxy_set_header X-Real-IP \\$http_x_real_ip;');
    expect(deployScript).toContain('proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;');
  });

  it('protects local TTS deployment and nginx token rendering on disk', () => {
    expect(deployScript).toContain('validate_local_tts_physical_memory');
    expect(deployScript).toContain('(( physical_memory_mb < 1900 ))');
    expect(deployScript).toMatch(/parse_arguments "\$@"\r?\n    validate_runtime_profile/);
    expect(deployScript).toContain('token_rendered=$(mktemp "/tmp/${SERVICE_NAME}-nginx-token.XXXXXX")');
    expect(deployScript).toContain('chmod 600 "${token_rendered}"');
    expect(deployScript).toContain('install -m 600 -o root -g root "${STAGED_NGINX_CONF}" "${NGINX_ACTIVE_CONF}"');
    expect(rollbackWorkflow).toContain('bash "$STAGING/deploy.sh"');
  });

  it('isolates concurrent staging and production deploy kits per host', () => {
    for (const workflow of [stagingWorkflow, productionWorkflow]) {
      expect(workflow).toContain(
        'portfolio-deploy-kit-${{ matrix.server.name }}-${{ github.sha }}.tar.gz',
      );
      expect(workflow).toContain(
        'STAGING="/var/tmp/portfolio-stage-${{ matrix.server.name }}-${SHA}"',
      );
      expect(workflow).toContain(
        'DEPLOY_KIT="/var/tmp/portfolio-deploy-kit-${{ matrix.server.name }}-${SHA}.tar.gz"',
      );
      expect(workflow).not.toContain('STAGING="/var/tmp/portfolio-stage-${SHA}"');
      expect(workflow).not.toContain('DEPLOY_KIT="/var/tmp/portfolio-deploy-kit-${SHA}.tar.gz"');
    }
  });

  it('checks synthesis through public HTTPS nginx only after reload', () => {
    expect(deployScript).toContain('--resolve "${DOMAIN}:443:127.0.0.1"');
    expect(deployScript).toContain('"https://${DOMAIN}/api/tts"');
    expect(deployScript).toContain('for attempt in {1..10}; do');
    expect(deployScript).toContain('Public Pocket TTS status check failed after ${attempt} attempts');
    expect(deployScript).toContain('Private Pocket TTS gateway status check failed after ${attempt} attempts');
    expect(deployScript).toMatch(
      /image_deploy\(\) \{[^]*if ! reload_nginx[^]*private_tts_gateway_health_check[^]*tts_health_check[^]*rollback_deploy\(\)/,
    );
    expect(deployScript).toMatch(
      /rollback_deploy\(\) \{[^]*if ! reload_nginx[^]*private_tts_gateway_health_check[^]*tts_health_check/,
    );
  });

  it.each([
    ['staging', stagingWorkflow, 'staging'],
    ['production', productionWorkflow, 'production'],
    ['rollback', rollbackWorkflow, 'production'],
  ])('assigns server 1 local and servers 2/3 remote in %s', (_name, workflow, prefix) => {
    expect(workflow).toContain(`name: ${prefix}-1\n            tts_mode: local`);
    expect(workflow).toContain(`name: ${prefix}-2\n            tts_mode: remote`);
    expect(workflow).toContain(`name: ${prefix}-3\n            tts_mode: remote`);
    expect(workflow).toContain('TTS_NODE_MODE');
  });

  it.each([
    ['staging', stagingWorkflow],
    ['production', productionWorkflow],
    ['rollback', rollbackWorkflow],
  ])('keeps HF and local model settings conditional in %s', (_name, workflow) => {
    expect(workflow).toContain("matrix.server.tts_mode == 'local'");
    expect(workflow).toContain('$1 !~ /^LOCAL_TTS_/');
    expect(workflow).toContain('if [ "$TTS_MODE" = "local" ]');
    expect(workflow).toContain("printf 'TTS_NODE_MODE=%s\\n'");
  });

  it.each([
    ['staging', stagingWorkflow],
    ['production', productionWorkflow],
    ['rollback', rollbackWorkflow],
  ])('verifies %s synthesis through HTTPS nginx', (_name, workflow) => {
    expect(workflow).toContain('--resolve');
    expect(workflow).toMatch(/https:\/\/(?:\$\{SVC_DOMAIN\}|\$\{\{ env\.DOMAIN \}\})\/api\/tts/);
    expect(workflow).toContain('"type":"ready"');
    expect(workflow).toContain('"type":"chunk"');
    expect(workflow).toContain('"type":"done"');
    expect(workflow).not.toContain('http://127.0.0.1:${SVC_PORT}/api/tts');
  });

  it('uses static preflight checks before post-local remote reachability checks', () => {
    for (const [workflow, prefix] of [
      [stagingWorkflow, 'staging'],
      [productionWorkflow, 'production'],
    ]) {
      expect(workflow).toContain('TTS_NODE_MODE must match matrix role');
      expect(workflow).toContain('memory_high_mb >= 1200');
      expect(workflow).toContain('memory_max_mb >= 1536');
      expect(workflow).toContain('memory_high_mb >= 400');
      expect(workflow).toContain('memory_max_mb >= 500');
      expect(workflow).toContain('X-Portfolio-TTS-Token: $tts_token');
      expect(workflow).toContain('Remote Pocket TTS gateway is not reachable after');
      expect(workflow.indexOf(`name: ${prefix}-1\n            tts_mode: local`)).toBeLessThan(
        workflow.indexOf(`name: ${prefix}-2\n            tts_mode: remote`),
      );
    }
    expect(stagingWorkflow).toContain('deploy-staging-canary:');
    expect(stagingWorkflow).toMatch(
      /deploy-staging-canary:[^]*needs:[^]*- preflight-staging[^]*name: staging-1/,
    );
    expect(stagingWorkflow).toMatch(
      /deploy-staging:[^]*needs:[^]*- preflight-staging[^]*- deploy-staging-canary[^]*max-parallel: 2[^]*name: staging-2[^]*name: staging-3/,
    );
    expect(productionWorkflow).toContain('deploy-production-canary:');
    expect(productionWorkflow).toMatch(
      /deploy-production-canary:[^]*needs:[^]*- preflight-production[^]*name: production-1/,
    );
    expect(productionWorkflow).toMatch(
      /deploy-production:[^]*needs:[^]*- preflight-production[^]*- deploy-production-canary[^]*max-parallel: 2[^]*name: production-2[^]*name: production-3/,
    );
    expect(rollbackWorkflow).toContain('max-parallel: 1');
    expect(productionWorkflow).toContain('DOMAIN="${{ env.DOMAIN }}"');
    expect(productionWorkflow).toContain('-H "Origin: https://${DOMAIN}"');
  });
});