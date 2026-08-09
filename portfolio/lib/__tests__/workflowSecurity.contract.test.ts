import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowDirectory = path.join(process.cwd(), '..', '.github', 'workflows');
const productionDeploy = fs.readFileSync(path.join(workflowDirectory, 'deploy.yml'), 'utf8');
const stagingDeploy = fs.readFileSync(path.join(workflowDirectory, 'deploy-staging.yml'), 'utf8');
const nginxTemplate = fs.readFileSync(path.join(process.cwd(), 'nginx-cloudflare.conf'), 'utf8');
const policyUpdater = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'update-cloudflare-origin-policy.sh'),
  'utf8',
);
const bootstrapScript = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'bootstrap-docker-vm.sh'),
  'utf8',
);
const optimizeScript = fs.readFileSync(path.join(process.cwd(), 'optimize_vm.sh'), 'utf8');
const deployScript = fs.readFileSync(path.join(process.cwd(), 'scripts', 'deploy.sh'), 'utf8');
const standaloneSanitizer = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'sanitize-standalone.mjs'),
  'utf8',
);
const expectedActionRefs: Record<string, string> = {
  'actions/checkout': '11d5960a326750d5838078e36cf38b85af677262',
  'actions/setup-node': '49933ea5288caeca8642d1e84afbd3f7d6820020',
  'actions/download-artifact': 'd3f86a106a0bac45b974a628896c90dbdf5c8093',
  'docker/setup-qemu-action': 'c7c53464625b32c7a7e944ae62b3e17d2b600130',
  'docker/setup-buildx-action': '8d2750c68a42422c14e847fe6c8ac0403b4cbd6f',
  'docker/login-action': 'c94ce9fb468520275223c153574b00df6fe4bcc9',
  'docker/build-push-action': '10e90e3645eae34f1e60eeb005ba3a3d33f178e8',
  'appleboy/scp-action': '917f8b81dfc1ccd331fef9e2d61bdc6c8be94634',
  'appleboy/ssh-action': '7eaf76671a0d7eec5d98ee897acda4f968735a17',
};

function workflowReferences(filename: string): string[] {
  const source = fs.readFileSync(path.join(workflowDirectory, filename), 'utf8');
  return [...source.matchAll(/^\s*uses:\s*([^\s#]+)\s*$/gm)].map((match) => match[1]);
}

describe('workflow supply-chain hardening', () => {
  it('pins every third-party action to an approved full commit SHA', () => {
    for (const filename of fs.readdirSync(workflowDirectory).filter((name) => name.endsWith('.yml'))) {
      for (const reference of workflowReferences(filename)) {
        if (reference.startsWith('./')) {
          continue;
        }

        const [action, revision] = reference.split('@');
        expect(revision, `${filename}: ${reference}`).toMatch(/^[0-9a-f]{40}$/);
        expect(expectedActionRefs[action], `${filename}: ${action}`).toBe(revision);
      }
    }
  });

  it('passes the production site input through a validated environment variable', () => {
    expect(productionDeploy).toContain("DEPLOY_SITE: ${{ inputs.site || 'portfolio' }}");
    expect(productionDeploy).toContain('envs: DEPLOY_SITE');
    expect(productionDeploy).toContain('[ "${DEPLOY_SITE:-}" != "portfolio" ]');
    expect(productionDeploy).not.toContain('SITE="${{ inputs.site || \'portfolio\' }}"');
    expect(productionDeploy).not.toContain('[ "${{ inputs.skip_nginx || \'false\' }}"');
  });

  it('does not let production or staging workflow delivery skip Nginx hardening', () => {
    expect(productionDeploy).toContain('Production nginx hardening cannot be skipped');
    expect(stagingDeploy).toContain('Staging nginx hardening cannot be skipped');
    expect(productionDeploy).not.toContain('deploy_args+=(--skip-nginx)');
    expect(productionDeploy).not.toContain('--site "$SITE" --skip-nginx > "$DEPLOY_CMD_LOG"');
  });

  it('uses generated Cloudflare origin policy files and keeps loopback health probes', () => {
    expect(nginxTemplate).toContain('include /etc/nginx/cloudflare-policy/trusted-proxies.conf;');
    expect(nginxTemplate).toContain('if ($cloudflare_peer_allowed = 0) { return 444; }');
    expect(policyUpdater).toContain('https://www.cloudflare.com/ips-v4');
    expect(policyUpdater).toContain('https://www.cloudflare.com/ips-v6');
    expect(policyUpdater).toContain("--proto '=https'");
    expect(policyUpdater).toContain('ip_network(candidate, strict=True)');
    expect(policyUpdater).toContain('127.0.0.1 1;');
    expect(policyUpdater).toContain('::1 1;');
    expect(policyUpdater).toContain('mv -f -- "${next}" "${target}"');
    expect(policyUpdater).toContain('ufw allow in on lo');

    for (const source of [nginxTemplate, policyUpdater, bootstrapScript, optimizeScript]) {
      expect(source).not.toMatch(/set_real_ip_from\s+[0-9a-f:.]+\/\d+/i);
    }
  });

  it('installs the updater before restricted firewall rules and blocks unsafe deploys', () => {
    for (const source of [bootstrapScript, optimizeScript]) {
      expect(source).toContain('/usr/local/sbin/update-cloudflare-origin-policy');
    }
    for (const source of [policyUpdater, bootstrapScript, optimizeScript]) {
      expect(source).not.toMatch(/ufw\s+allow\s+(?:80|443)\/tcp/);
    }
    expect(optimizeScript).toContain('limit_req_zone $binary_remote_addr');
    expect(optimizeScript).not.toContain('$http_cf_connecting_ip');
    expect(deployScript).toContain('check_cloudflare_origin_policy');
    expect(deployScript).toContain('CLOUDFLARE_TRUSTED_PROXIES_CONF');
    for (const source of [productionDeploy, stagingDeploy]) {
      const installUpdater =
        'sudo install -m 0700 -o root -g root "$STAGING/update-cloudflare-origin-policy.sh"';

      expect(source).toContain(
        'cp portfolio/scripts/update-cloudflare-origin-policy.sh deploy-kit/update-cloudflare-origin-policy.sh',
      );
      expect(source).toContain(
        'Cloudflare origin policy not installed yet; deploy kit will install and validate it before deploy.sh runs.',
      );
      expect(source).toContain(installUpdater);
      expect(source).toContain('sudo /usr/local/sbin/update-cloudflare-origin-policy');
      expect(source).toContain('sudo systemctl is-active --quiet nginx');
      expect(source).toContain("sudo ufw status | grep -Fx 'Status: active'");
      expect(source.indexOf(installUpdater)).toBeLessThan(
        source.indexOf('sudo /usr/local/sbin/update-cloudflare-origin-policy'),
      );
      expect(source.indexOf('sudo /usr/local/sbin/update-cloudflare-origin-policy')).toBeLessThan(
        source.indexOf('Invoking image deploy script'),
      );
    }
  });

  it('removes every prior policy-managed UFW rule using padded numbered output', () => {
    expect(policyUpdater).toContain('match($0, /^[[:space:]]*\\[[[:space:]]*[0-9]+[[:space:]]*\\]/)');
    expect(policyUpdater).toContain('gsub(/[^0-9]/, "", rule_number)');
    expect(policyUpdater).toContain('ufw --force delete "${rule_number}"');
    expect(policyUpdater).toContain('| sort -rn)');
  });

  it('removes nested optional native package trees before checking the release bundle', () => {
    expect(standaloneSanitizer).toContain(
      "const optionalNativePackageNames = new Set(['@img', 'onnxruntime-node', 'sharp']);",
    );
    expect(standaloneSanitizer).toContain("path.basename(directory) === 'node_modules'");
    expect(standaloneSanitizer).toContain('await removeOptionalNativePackageTrees(standaloneDir);');
    expect(standaloneSanitizer).toContain('if (nativeFiles.length > 0)');
  });
});