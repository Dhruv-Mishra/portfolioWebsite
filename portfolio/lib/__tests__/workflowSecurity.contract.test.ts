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
  'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node': '820762786026740c76f36085b0efc47a31fe5020',
  'actions/download-artifact': '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
  'docker/setup-qemu-action': '96fe6ef7f33517b61c61be40b68a1882f3264fb8',
  'docker/setup-buildx-action': 'bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
  'docker/login-action': 'dbcb813823bdd20940b903addbd779551569679f',
  'docker/build-push-action': '53b7df96c91f9c12dcc8a07bcb9ccacbed38856a',
  'appleboy/scp-action': 'ff85246acaad7bdce478db94a363cd2bf7c90345',
  'appleboy/ssh-action': '0ff4204d59e8e51228ff73bce53f80d53301dee2',
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