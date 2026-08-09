import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')) as Record<
    string,
    unknown
  >;
}

function readWorkflow(filename: string): string {
  return fs
    .readFileSync(path.join(projectRoot, '..', '.github', 'workflows', filename), 'utf8')
    .replace(/\r\n/g, '\n');
}

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const stagingPromotion = readWorkflow('promote-staging.yml');
const productionPromotion = readWorkflow('promote-production.yml');
const stagingDeploy = readWorkflow('deploy-staging.yml');
const productionDeploy = readWorkflow('deploy.yml');
const productionRollback = readWorkflow('rollback-production.yml');
const modelCatalogAudit = readWorkflow('model-catalog-audit.yml');
const modelHealthPublisher = readWorkflow('publish-model-health.yml');
const dockerfile = fs.readFileSync(path.join(projectRoot, 'Dockerfile'), 'utf8');
const deployScript = fs.readFileSync(path.join(projectRoot, 'scripts', 'deploy.sh'), 'utf8');

describe('release version promotion', () => {
  it('uses a semantic package.json version mirrored by the npm lockfile', () => {
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageLock.version).toBe(packageJson.version);
    expect(
      (packageLock.packages as Record<string, { version?: string }> | undefined)?.['']?.version,
    ).toBe(packageJson.version);
  });

  it('increments the minor version for each genuinely new staging release', () => {
    expect(stagingPromotion).toContain(
      'npm@${{ env.CI_NPM_VERSION }} --prefix portfolio version minor',
    );
    expect(stagingPromotion).toContain(
      'git add portfolio/package.json portfolio/package-lock.json',
    );
    expect(stagingPromotion).toContain('git commit -m "chore(release): v${version}"');
  });

  it('bumps only after detecting a real source delta and advances both branches atomically', () => {
    const noChangeGuard = stagingPromotion.indexOf('if [ "$source_sha" = "$target_sha" ]');
    const bump = stagingPromotion.indexOf('version minor --no-git-tag-version');

    expect(noChangeGuard).toBeGreaterThan(-1);
    expect(bump).toBeGreaterThan(noChangeGuard);
    expect(stagingPromotion).toContain('git push --atomic origin');
    expect(stagingPromotion).toContain('"HEAD:refs/heads/${SOURCE_BRANCH}"');
    expect(stagingPromotion).toContain('"HEAD:refs/heads/${TARGET_BRANCH}"');
    expect(stagingPromotion).toContain('gh workflow run deploy-staging.yml --ref "$TARGET_BRANCH"');
  });

  it('promotes the exact staged release to production without another version bump', () => {
    expect(productionPromotion).toContain('source_sha="$(git rev-parse "origin/${SOURCE_BRANCH}")"');
    expect(productionPromotion).toContain('git push origin "${source_sha}:refs/heads/${TARGET_BRANCH}"');
    expect(productionPromotion).not.toContain('version minor');
    expect(productionPromotion).not.toContain('npm version');
  });

  it.each([
    ['staging', stagingDeploy, 'portfolio-staging-image'],
    ['production', productionDeploy, 'portfolio-production-image'],
  ])('builds %s once in Docker with an isolated BuildKit cache', (_name, workflow, scope) => {
    expect(workflow).not.toContain('- name: Build Next.js (standalone)');
    expect(workflow).not.toContain('actions/upload-artifact');
    expect(workflow).toContain(`cache-from: type=gha,scope=${scope}`);
    expect(workflow).toContain(`cache-to: type=gha,mode=max,scope=${scope}`);
    expect(workflow).toContain('org.opencontainers.image.version=${{ steps.release-meta.outputs.version }}');
  });

  it('carries the package version through the image into verified VM metadata', () => {
    expect(dockerfile).toContain(`RELEASE_VERSION="$(node -p "require('./package.json').version")"`);
    expect(dockerfile).toContain(`"version":"%s"`);
    expect(dockerfile).toContain(`find /app/standalone -type d -name '.cache'`);
    expect(dockerfile).toContain(`-name '*.node' -o -name '*.dll' -o -name '*.so'`);
    expect(deployScript).toContain('release_version="$(release_meta_value "${staging}" version)"');
    expect(deployScript).toContain('"version": "${release_version}"');
    expect(stagingDeploy).toContain(
      `'"version": "\${{ needs.build.outputs.release_version }}"'`,
    );
    expect(productionDeploy).toContain(
      '"version": "${{ needs.build.outputs.release_version }}"',
    );
  });

  it('validates production edge resources while safely skipping a confirmed Cloudflare challenge', () => {
    const productionResourceSmoke = productionDeploy.slice(
      productionDeploy.indexOf('- name: Verify public resources at the edge'),
    );

    expect(productionResourceSmoke).toContain('headers_file="$(mktemp)"');
    expect(productionResourceSmoke).toContain('body_file="$(mktemp)"');
    expect(productionResourceSmoke).toContain('-D "$headers_file" -o "$body_file"');
    expect(productionResourceSmoke).toContain('echo "${resource_path}: HTTP ${resource_status}"');
    expect(productionResourceSmoke).toContain(
      "grep -Ei '^(content-type:|content-range:|cache-control:|cf-cache-status:|cf-ray:|cf-mitigated:|server:)'",
    );
    expect(productionResourceSmoke).not.toContain('cat "$body_file"');
    expect(productionResourceSmoke).not.toContain('head -c');
    expect(productionResourceSmoke).toContain(
      "grep -qiE '^cf-mitigated:[[:space:]]*challenge' \"$headers_file\"",
    );
    expect(productionResourceSmoke).toContain("grep -qi '<title>Just a moment' \"$body_file\"");
    expect(productionResourceSmoke).toContain("grep -qi 'challenges.cloudflare.com' \"$body_file\"");
    expect(productionResourceSmoke).toContain('::warning::Cloudflare returned a bot challenge');
    expect(productionResourceSmoke).toContain('## Production edge resource smoke skipped');
    expect(productionResourceSmoke).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(productionResourceSmoke).toContain('rm -f "$headers_file" "$body_file"');
    expect(productionResourceSmoke).toContain('exit 0');
    expect(productionResourceSmoke).toContain('resource_status" != "206"');
    expect(productionResourceSmoke).toContain(
      '^content-type:[[:space:]]*${expected_mime}([;[:space:]]|$)',
    );
    expect(productionResourceSmoke).toContain(
      '^content-range:[[:space:]]*bytes[[:space:]]+0-0/[0-9]+[[:space:]]*$',
    );
    expect(productionResourceSmoke).toContain('::error::Production public resource failed through Cloudflare');
  });

  it('discovers staging canaries at runtime and reports model degradation without blocking deployment', () => {
    const stagingCanaryJob = stagingDeploy.slice(
      stagingDeploy.indexOf('deploy-staging-canary:'),
      stagingDeploy.indexOf('deploy-staging:', stagingDeploy.indexOf('deploy-staging-canary:')),
    );

    expect(stagingDeploy).toMatch(
      /STAGING_LOCAL_AGENT_BASE_URL:\s*https:\/\/llm\.whoisdhruv\.com\/v1/,
    );
    expect(stagingDeploy).toContain(
      'STAGING_LOCAL_AGENT_API_KEY: ${{ secrets.STAGING_LOCAL_AGENT_API_KEY }}',
    );
    expect(stagingDeploy).toMatch(
      /if \[ -z "\$\{STAGING_LOCAL_AGENT_API_KEY:-\}" \]; then/,
    );
    expect(stagingDeploy).toContain(
      'RUNTIME_LOCAL_AGENT_API_KEY: ${{ secrets.STAGING_LOCAL_AGENT_API_KEY }}',
    );
    expect(stagingDeploy).toContain(
      'RUNTIME_LOCAL_AGENT_BASE_URL: ${{ env.STAGING_LOCAL_AGENT_BASE_URL }}',
    );
    expect(stagingDeploy).toMatch(
      /envs:\s*[^\n]*RUNTIME_LOCAL_AGENT_API_KEY[^\n]*RUNTIME_LOCAL_AGENT_BASE_URL/,
    );
    expect(stagingDeploy).toMatch(
      /if \[ -z "\$\{RUNTIME_LOCAL_AGENT_API_KEY:-\}" \]; then/,
    );
    expect(stagingDeploy).toMatch(
      /if \[ -z "\$\{RUNTIME_LOCAL_AGENT_BASE_URL:-\}" \]; then/,
    );
    expect(stagingDeploy).toContain('[[ "$RUNTIME_LOCAL_AGENT_BASE_URL" != https://* ]]');
    expect(stagingDeploy).toContain('$1 !~ /^LOCAL_AGENT_/');
    expect(stagingDeploy).toContain(
      "printf 'LOCAL_AGENT_BASE_URL=%s\\n' \"$RUNTIME_LOCAL_AGENT_BASE_URL\"",
    );
    expect(stagingDeploy).toContain(
      "printf 'LOCAL_AGENT_API_KEY=%s\\n' \"$RUNTIME_LOCAL_AGENT_API_KEY\"",
    );
    expect(stagingCanaryJob).toContain('timeout-minutes: 45');

    expect(stagingCanaryJob).toContain('Audit staging model canaries');
    expect(stagingCanaryJob).toContain('https://${{ env.STAGING_DOMAIN }}/api/chat/model-status');
    expect(stagingCanaryJob).toContain('deploymentCanaryModelIds');
    expect(stagingCanaryJob).toContain('mapfile -t DEPLOYMENT_CANARY_MODEL_IDS');
    expect(stagingCanaryJob).toContain('for CHAT_MODEL in "${DEPLOYMENT_CANARY_MODEL_IDS[@]}"; do');
    expect(stagingCanaryJob).toContain('::error::Staging model-status route failed');
    expect(stagingCanaryJob).toContain('::error::Staging model-status response schema is invalid');
    expect(stagingCanaryJob).toContain('::warning::Staging chat canary degraded:');
    expect(stagingCanaryJob).toContain('## Staging model canary audit');
    expect(stagingCanaryJob).toContain('jq -nc --arg model "$CHAT_MODEL"');
    expect(stagingCanaryJob).not.toContain('STAGING_CHAT_MODELS=(');
    expect(stagingCanaryJob).not.toContain('CHAT_CANARY_FAILURES=()');
    expect(stagingCanaryJob).not.toContain('fail "Staging chat canary failed');
    expect(stagingCanaryJob).not.toContain('qwen-3.6-27b');

    expect(stagingDeploy).toContain('Note GHCR credential fallback');
    expect(stagingDeploy).toContain('::notice::GHCR_READ_TOKEN is not configured');
    expect(stagingDeploy).toContain('if [ -n "${GHCR_READ_TOKEN:-}" ]; then\n                DOCKER_CONFIG_DIR="$(mktemp -d)"');
    expect(stagingDeploy).toContain('if [ -n "$DOCKER_CONFIG_DIR" ]; then\n                sudo env DOCKER_CONFIG="$DOCKER_CONFIG_DIR" bash');
    expect(productionDeploy).not.toContain('Warn when GHCR token is absent');
    expect(productionDeploy).not.toContain('::warning::GHCR_READ_TOKEN is not configured');
    expect(productionRollback).toContain(
      'if [ -n "${GHCR_READ_TOKEN:-}" ]; then\n              DOCKER_CONFIG_DIR="$(mktemp -d)"',
    );
    expect(productionRollback).toContain(
      'if [ -n "$DOCKER_CONFIG_DIR" ]; then\n              sudo env DOCKER_CONFIG="$DOCKER_CONFIG_DIR" bash',
    );

    expect(modelCatalogAudit).toContain('workflow_dispatch:');
    expect(modelCatalogAudit).toContain('schedule:');
    expect(modelCatalogAudit).toContain('https://${STAGING_DOMAIN}/api/chat/model-status');
    expect(modelCatalogAudit).toContain('(.models | type == "array")');
    expect(modelCatalogAudit).toContain('invalid models[].id schema');
    expect(modelCatalogAudit).toContain("mapfile -t CHAT_MODEL_IDS < <(jq -r '.models[].id'");
    expect(modelCatalogAudit).toContain('for CHAT_MODEL in "${CHAT_MODEL_IDS[@]}"; do');
    expect(modelCatalogAudit).toContain('"$CHAT_RETURNED_MODEL_ID" = "localStatic"');
    expect(modelCatalogAudit).toContain('"$CHAT_RETURNED_MODEL_ID" != "$CHAT_MODEL"');
    expect(modelCatalogAudit).toContain('::warning::Runtime chat catalog model degraded:');
    expect(modelCatalogAudit).not.toContain('deploymentCanaryModelIds');
    expect(modelCatalogAudit).toContain('## Staging model catalog audit');
    expect(modelCatalogAudit).not.toContain('exit 1');

    expect(modelHealthPublisher).toContain('workflow_dispatch:');
    expect(modelHealthPublisher).toContain('cron: "*/10 * * * *"');
    expect(modelHealthPublisher).toContain('concurrency:');
    expect(modelHealthPublisher).toContain('publish-model-health-${{ matrix.environment }}');
    expect(modelHealthPublisher).toContain('MODEL_HEALTH_TOKEN: ${{ secrets.MODEL_HEALTH_TOKEN }}');
    expect(modelHealthPublisher).toContain('https://${MODEL_HEALTH_SITE_DOMAIN}/api/chat/model-status');
    expect(modelHealthPublisher).toContain('deploymentCanaryModelIds');
    expect(modelHealthPublisher).toContain('mapfile -t DEPLOYMENT_CANARY_MODEL_IDS');
    expect(modelHealthPublisher).toContain('for CHAT_MODEL in "${DEPLOYMENT_CANARY_MODEL_IDS[@]}"; do');
    expect(modelHealthPublisher).not.toContain('mapfile -t CHAT_MODEL_IDS');
    expect(modelHealthPublisher).toContain('"$returned_model" = "localStatic"');
    expect(modelHealthPublisher).toContain('"$returned_model" != "$chat_model"');
    expect(modelHealthPublisher).toContain('.modelId == $model');
    expect(modelHealthPublisher).toContain('status/v1/${MODEL_HEALTH_ENVIRONMENT}.json');
    expect(modelHealthPublisher).toContain('consecutiveFailures');
    expect(modelHealthPublisher).toContain('if $consecutiveFailures >= 2 then "unhealthy" else "degraded" end');
    expect(modelHealthPublisher).toContain('if [ "$write_status" = "409" ] && [ "$attempt" -eq 1 ]; then');
    expect(modelHealthPublisher).toContain('::warning::${message}');
    expect(modelHealthPublisher).toContain('exit 0');
    expect(modelHealthPublisher).not.toContain('exit 1');
  });
});