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

  it('requires, syncs, and locally verifies the staging Qwen agent', () => {
    const verificationScript = stagingDeploy.slice(
      stagingDeploy.indexOf('- name: Verify staging deployment'),
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

    expect(verificationScript).toContain('--resolve "${SVC_DOMAIN}:443:127.0.0.1"');
    expect(verificationScript).toContain('"https://${SVC_DOMAIN}/chat/respond"');
    expect(verificationScript).toContain('"model":"qwen-3.5-4b-local"');
    expect(verificationScript).toContain('-H "Origin: https://${SVC_DOMAIN}"');
    expect(verificationScript).toContain('-H "Sec-Fetch-Site: same-origin"');
    expect(verificationScript).toContain('application/json');
    expect(verificationScript).toContain('x-chat-fallback:[[:space:]]*primaryOnline');
    expect(verificationScript).toContain("body?.modelId !== 'qwen-3.5-4b-local'");
    expect(verificationScript).toContain("typeof body?.reply !== 'string' || !body.reply.trim()");
  });
});