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
  it('uses package.json as the 0.2.0 baseline mirrored by the npm lockfile', () => {
    expect(packageJson.version).toBe('0.2.0');
    expect(packageLock.version).toBe(packageJson.version);
    expect(
      (packageLock.packages as Record<string, { version?: string }> | undefined)?.['']?.version,
    ).toBe(packageJson.version);
  });

  it('makes the next genuinely new staging release 0.3.0', () => {
    const [major, minor] = String(packageJson.version).split('.').map(Number);

    expect(`${major}.${minor + 1}.0`).toBe('0.3.0');
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
      `'"version": "\${{ needs.build.outputs.release_version }}"'`,
    );
  });
});