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

  it('requires, syncs, and locally verifies every staging chat model through Nginx', () => {
    const stagingCanaryJob = stagingDeploy.slice(
      stagingDeploy.indexOf('deploy-staging-canary:'),
      stagingDeploy.indexOf('deploy-staging:', stagingDeploy.indexOf('deploy-staging-canary:')),
    );
    const verificationScript = stagingDeploy.slice(
      stagingDeploy.indexOf('- name: Verify staging deployment'),
    );
    const modelCanaryLoop = verificationScript.slice(
      verificationScript.indexOf('for CHAT_MODEL in "${STAGING_CHAT_MODELS[@]}"; do'),
      verificationScript.indexOf('\n            done', verificationScript.indexOf('for CHAT_MODEL in "${STAGING_CHAT_MODELS[@]}"; do')),
    );
    const expectedStagingChatModels = [
      'qwen-3.6-27b',
      'glm-5.2',
      'inkling',
      'minimax-m3',
      'diffusiongemma-26b',
      'deepseek-v4-flash',
      'gemma-4-31b-it',
      'nemotron-3-super-120b-a12b',
      'gpt-oss-120b',
      'qwen-3.5-4b-local',
    ];
    const modelMatrix = verificationScript.match(/STAGING_CHAT_MODELS=\(\n([\s\S]*?)\n\s*\)/);

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

    expect(verificationScript).toContain('--resolve "${SVC_DOMAIN}:443:127.0.0.1"');
    expect(verificationScript).toContain('"https://${SVC_DOMAIN}/chat/respond"');
    expect(stagingCanaryJob).toContain('timeout-minutes: 45');
    expect(verificationScript).toContain('command_timeout: 20m');
    expect(verificationScript).toContain('STAGING_CHAT_MODELS=(');
    expect(verificationScript).toContain('for CHAT_MODEL in "${STAGING_CHAT_MODELS[@]}"; do');
    expect(
      modelMatrix?.[1]
        .trim()
        .split('\n')
        .map((modelId) => modelId.trim()),
    ).toEqual(expectedStagingChatModels);
    expect(verificationScript).toContain('CHAT_HEADERS_FILE="$(mktemp)"');
    expect(verificationScript).toContain('CHAT_BODY_FILE="$(mktemp)"');
    expect(verificationScript).toContain('\\"model\\":\\"${CHAT_MODEL}\\"');
    expect(verificationScript).toContain(
      'Staging deployment canary health check. Please provide a brief acknowledgement.',
    );
    expect(verificationScript).toContain('-H "Origin: https://${SVC_DOMAIN}"');
    expect(verificationScript).toContain('-H "Referer: https://${SVC_DOMAIN}/"');
    expect(verificationScript).toContain('-H "Sec-Fetch-Site: same-origin"');
    expect(verificationScript).toContain('-H "Accept: application/json" -H "Content-Type: application/json"');
    expect(modelCanaryLoop).toContain('--max-time 100');
    expect(modelCanaryLoop).not.toContain('--max-time 45');
    expect(modelCanaryLoop).toMatch(
      /if CHAT_CURL_METRICS="\$\(curl -sk --max-time 100[\s\S]*?-w '%\{http_code\} %\{time_total\}'[\s\S]*?\)"; then\n\s+CHAT_CURL_EXIT=0\n\s+else\n\s+CHAT_CURL_EXIT=\$\?\n\s+fi/,
    );
    expect(modelCanaryLoop).not.toContain('|| echo "000"');
    expect(modelCanaryLoop).toContain('CHAT_ELAPSED_SECONDS="unknown"');
    expect(modelCanaryLoop).toContain('CHAT_HTTP_CODE="${BASH_REMATCH[1]}"');
    expect(modelCanaryLoop).toContain('CHAT_ELAPSED_SECONDS="${BASH_REMATCH[2]}"');
    expect(modelCanaryLoop).toContain('CHAT_FALLBACK="unknown"');
    expect(modelCanaryLoop).toContain('primaryOnline|fallbackOnline|localStatic');
    expect(modelCanaryLoop).toContain('CHAT_FALLBACK_REASON="unknown"');
    expect(modelCanaryLoop).toContain(
      'all-providers-failed|no-providers-configured|request-aborted|server-deadline-exceeded|provider-timeout|invalid-provider-response',
    );
    expect(modelCanaryLoop).toContain(
      'CHAT_CANARY_DIAGNOSTICS="model=${CHAT_MODEL} status=${CHAT_HTTP_CODE} curl_exit=${CHAT_CURL_EXIT} fallback=${CHAT_FALLBACK} reason=${CHAT_FALLBACK_REASON} elapsed_seconds=${CHAT_ELAPSED_SECONDS}"',
    );
    expect(modelCanaryLoop).not.toContain('cat "$CHAT_HEADERS_FILE"');
    expect(modelCanaryLoop).not.toContain('cat "$CHAT_BODY_FILE"');
    expect(verificationScript).toContain('content-type:[[:space:]]*application/json');
    expect(verificationScript).toContain('x-chat-fallback:[[:space:]]*primaryOnline[[:space:]]*$');
    expect(verificationScript).toContain('body?.modelId !== process.env.CHAT_MODEL');
    expect(verificationScript).toContain("typeof body?.reply !== 'string' || !body.reply.trim()");
    expect(verificationScript).toContain(
      'fail "Staging chat canary failed: ${CHAT_CANARY_DIAGNOSTICS};',
    );
  });
});