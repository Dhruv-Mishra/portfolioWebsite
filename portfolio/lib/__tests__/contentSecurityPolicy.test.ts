import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import {
  CONTENT_SECURITY_POLICY,
  DEVELOPMENT_CONTENT_SECURITY_POLICY,
} from '../contentSecurityPolicy';

function parsePolicy(policy: string): Map<string, Set<string>> {
  return new Map(
    policy
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/);
        return [name, new Set(values)];
      }),
  );
}

function sortedPolicy(policy: Map<string, Set<string>>) {
  return [...policy.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([directive, values]) => [directive, [...values].sort()]);
}

describe('Whisper deployment content security policy', () => {
  it('keeps unsafe eval limited to the development script policy', () => {
    const productionPolicy = parsePolicy(CONTENT_SECURITY_POLICY);
    const developmentPolicy = parsePolicy(DEVELOPMENT_CONTENT_SECURITY_POLICY);

    expect(productionPolicy.get('script-src')).not.toContain("'unsafe-eval'");
    expect(developmentPolicy.get('script-src')).toContain("'unsafe-eval'");
    expect(
      [...(developmentPolicy.get('script-src') ?? [])]
        .filter((source) => source === "'unsafe-eval'"),
    ).toHaveLength(1);

    developmentPolicy.get('script-src')?.delete("'unsafe-eval'");
    expect(sortedPolicy(developmentPolicy)).toEqual(sortedPolicy(productionPolicy));
  });

  it('keeps Next and the deployed nginx policy semantically aligned', async () => {
    const headerRules = await nextConfig.headers?.();
    const globalHeaders = headerRules?.find((rule) => rule.source === '/:path*')?.headers ?? [];
    const nextPolicyValue = globalHeaders.find((header) => header.key === 'Content-Security-Policy')?.value;
    expect(nextPolicyValue).toBeDefined();

    const nginx = fs.readFileSync(path.join(process.cwd(), 'nginx-cloudflare.conf'), 'utf8');
    const [, variable, nginxPolicy] = nginx.match(/map \$host (\$\w+) \{\s*default "([^"]+)";/) ?? [];
    expect(nginxPolicy).toBeDefined();
    expect(sortedPolicy(parsePolicy(nginxPolicy))).toEqual(sortedPolicy(parsePolicy(nextPolicyValue!)));
    expect(nginx).not.toMatch(/add_header Content-Security-Policy "/);
    expect(nginx).toContain(`add_header Content-Security-Policy ${variable} always;`);
    expect(nginx).toContain('proxy_hide_header Content-Security-Policy;');
  });

  it('allows only the proven external fetch origins and required runtime capabilities', async () => {
    const headerRules = await nextConfig.headers?.();
    const headers = headerRules?.find((rule) => rule.source === '/:path*')?.headers ?? [];
    const policyValue = headers.find((header) => header.key === 'Content-Security-Policy')?.value;
    const policy = parsePolicy(policyValue!);

    expect(policy.get('connect-src')).toEqual(new Set([
      "'self'",
      'https://v2.jokeapi.dev',
      'https://cloudflareinsights.com',
      'https://huggingface.co',
      'https://us.aws.cdn.hf.co',
      'https://cdn.jsdelivr.net',
      'wss://generativelanguage.googleapis.com',
    ]));
    expect(policy.get('connect-src')).not.toContain('https:');
    expect(policy.get('connect-src')).not.toContain('*');
    expect(policy.get('worker-src')).toEqual(new Set(["'self'"]));
    const scriptSources = policy.get('script-src');
    expect(scriptSources).toContain("'self'");
    expect(scriptSources).toContain("'wasm-unsafe-eval'");
    expect(scriptSources).toContain('blob:');
    expect(scriptSources).not.toContain('https://v2.jokeapi.dev');
    expect(scriptSources).not.toContain('*');
    expect(policy.get('object-src')).toEqual(new Set(["'self'"]));
    expect(policy.has('upgrade-insecure-requests')).toBe(true);
  });
});