import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const deployScript = fs.readFileSync(path.join(process.cwd(), 'scripts', 'deploy.sh'), 'utf8');
const productionWorkflow = fs.readFileSync(
  path.join(process.cwd(), '..', '.github', 'workflows', 'deploy.yml'),
  'utf8',
);

function functionBody(name: string): string {
  const match = deployScript.match(
    new RegExp(`\\n${name}\\(\\) \\{([^]*?)\\r?\\n\\}\\r?\\n\\r?\\n(?=[a-z_]+\\(\\))`, 'm'),
  );
  expect(match, `${name} should exist`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('deployment release directory identity', () => {
  it('qualifies image releases with the first 12 lowercase digest characters', () => {
    expect(deployScript).toContain('[[ "${DOCKER_IMAGE}" =~ @sha256:[0-9a-f]{64}$ ]]');
    expect(functionBody('image_release_id')).toContain(
      `printf '%s-%s\\n' "\${RELEASE_SHA}" "\${digest:0:12}"`,
    );
    expect(functionBody('stage_image_release')).toContain(
      'local target="${DEPLOY_RELEASES_DIR}/${release_id}"',
    );
    expect(functionBody('stage_image_release')).toContain('RELEASE_ID="${release_id}"');
  });

  it('keeps release directory identity separate from the source SHA', () => {
    expect(deployScript).toContain('RELEASE_ID=""');
    expect(deployScript).toContain('RELEASE_SHA=""');
    expect(functionBody('stage_release')).toContain('RELEASE_ID="${RELEASE_SHA}"');
    expect(functionBody('stage_release')).toContain(
      'local target="${DEPLOY_RELEASES_DIR}/${RELEASE_ID}"',
    );

    const atomicSwap = functionBody('atomic_symlink_swap');
    expect(atomicSwap).toContain('if [[ -z "${RELEASE_ID}" ]]');
    expect(atomicSwap).toContain('local target="${DEPLOY_RELEASES_DIR}/${RELEASE_ID}"');
    expect(atomicSwap).not.toContain('image_release_id');
    expect(atomicSwap).not.toContain('MODE');
  });

  it('reuses the same image digest without replacing its directory', () => {
    const stageImageRelease = functionBody('stage_image_release');
    const reuseReturn = stageImageRelease.indexOf('return 0');

    expect(stageImageRelease).toContain('docker pull "${DOCKER_IMAGE}"');
    expect(stageImageRelease).toContain('verify_pulled_image_architecture');
    expect(stageImageRelease).toContain('if [[ "${staged_image}" == "${DOCKER_IMAGE}" ]]');
    expect(stageImageRelease).toContain('RELEASE_DIR="${target}"');
    expect(stageImageRelease).toContain('reusing existing static files');
    expect(stageImageRelease.indexOf('docker pull "${DOCKER_IMAGE}"')).toBeLessThan(reuseReturn);
    expect(stageImageRelease.indexOf('verify_pulled_image_architecture')).toBeLessThan(reuseReturn);
    expect(stageImageRelease.indexOf('NEW_RELEASE_DIR="${target}"')).toBeGreaterThan(reuseReturn);
    expect(stageImageRelease).not.toContain('rm -rf "${target}"');
  });

  it('stages a different digest for the same SHA as a distinct immutable directory', () => {
    const stageImageRelease = functionBody('stage_image_release');

    expect(stageImageRelease).not.toContain('different image digest');
    expect(stageImageRelease).not.toContain('deploy a new SHA');
    expect(stageImageRelease).toContain('mv "${staging}" "${target}"');
    expect(stageImageRelease).toContain('NEW_RELEASE_DIR="${target}"');
  });

  it('tracks and removes only a newly materialized failed release after restoration', () => {
    const stageRelease = functionBody('stage_release');
    const rollbackArtifact = functionBody('rollback_artifact');

    expect(deployScript).toContain('NEW_RELEASE_DIR=""');
    expect(stageRelease.indexOf('NEW_RELEASE_DIR="${target}"')).toBeGreaterThan(
      stageRelease.indexOf('mv "${staging}" "${target}"'),
    );
    expect(stageRelease.indexOf('NEW_RELEASE_DIR="${target}"')).toBeGreaterThan(
      stageRelease.indexOf('return 0'),
    );
    expect(rollbackArtifact).toContain('current_target=$(readlink -f "${DEPLOY_CURRENT_LINK}"');
    expect(rollbackArtifact).toContain('new_release_target=$(readlink -f "${NEW_RELEASE_DIR}"');
    expect(rollbackArtifact).toContain('[[ "${current_target}" != "${new_release_target}" ]]');
    expect(rollbackArtifact).toContain('rm -rf "${NEW_RELEASE_DIR}"');
    expect(rollbackArtifact.indexOf('rm -rf "${NEW_RELEASE_DIR}"')).toBeGreaterThan(
      rollbackArtifact.indexOf('Restoring nginx config'),
    );
  });

  it('rolls back by directory ID while restoring the source SHA from metadata', () => {
    const rollbackDeploy = functionBody('rollback_deploy');

    expect(rollbackDeploy).toContain('RELEASE_ID="${target_release_id}"');
    expect(rollbackDeploy).toContain('RELEASE_DIR="${DEPLOY_RELEASES_DIR}/${RELEASE_ID}"');
    expect(rollbackDeploy).toContain('RELEASE_SHA="$(release_meta_value "${RELEASE_DIR}" sha)"');
    expect(rollbackDeploy).toContain('if [[ -z "${RELEASE_SHA}" ]]');
    expect(rollbackDeploy.indexOf('RELEASE_SHA="$(release_meta_value')).toBeLessThan(
      rollbackDeploy.indexOf('prepare_docker_systemd_unit'),
    );
    expect(rollbackDeploy).not.toContain('NEW_RELEASE_DIR=');
  });

  it('rejects ambiguous rollback SHA-prefix matches instead of guessing', () => {
    const resolveRollbackRelease = functionBody('resolve_rollback_release');

    expect(deployScript).toContain('^[0-9a-fA-F]{7,40}$');
    expect(resolveRollbackRelease).toContain('-name "${ROLLBACK_TARGET_SHA}*"');
    expect(resolveRollbackRelease).toContain('if [[ ${#matches[@]} -gt 1 ]]');
    expect(resolveRollbackRelease).toContain(
      'Rollback target ${ROLLBACK_TARGET_SHA} is ambiguous: ${matches[*]}',
    );
  });

  it('verifies production source SHA from metadata and accepts digest-qualified IDs', () => {
    expect(productionWorkflow).toContain(
      'CURRENT_RELEASE_ID=$(basename "$(sudo readlink -f "$DEPLOY_ROOT/current")")',
    );
    expect(productionWorkflow).toContain('echo "current -> $CURRENT_RELEASE_ID"');
    expect(productionWorkflow).toContain('"${{ github.sha }}"|"${{ github.sha }}-"*)');
    expect(productionWorkflow).toContain('META_FILE="$DEPLOY_ROOT/current/.deploy/meta.json"');
    expect(productionWorkflow).toContain(
      "sudo grep -q '\"sha\": \"${{ github.sha }}\"' \"$META_FILE\"",
    );
    expect(productionWorkflow).not.toContain('if [ "$CURRENT_SHA" = "${{ github.sha }}" ]');
  });
});