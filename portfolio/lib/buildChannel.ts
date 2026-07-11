export const PRODUCTION_URL = 'https://whoisdhruv.com' as const;
export const STAGING_URL = 'https://staging.whoisdhruv.com' as const;

export type BuildChannel = 'production' | 'staging' | 'local' | 'unknown';

export interface BuildChannelInfo {
  channel: BuildChannel;
  destinationUrl: typeof PRODUCTION_URL | typeof STAGING_URL | null;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '').replace(/^\[(.*)\]$/, '$1');
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) {
    return false;
  }
  const values = octets.map(Number);
  if (values.some((value) => value > 255)) return false;
  return values[0] === 10
    || values[0] === 127
    || (values[0] === 172 && values[1] >= 16 && values[1] <= 31)
    || (values[0] === 192 && values[1] === 168);
}

export function classifyBuildChannel(hostname: string): BuildChannelInfo {
  const normalized = normalizeHostname(hostname);
  if (normalized === 'whoisdhruv.com' || normalized === 'www.whoisdhruv.com') {
    return { channel: 'production', destinationUrl: STAGING_URL };
  }
  if (normalized === 'staging.whoisdhruv.com') {
    return { channel: 'staging', destinationUrl: PRODUCTION_URL };
  }
  if (
    normalized === 'localhost'
    || normalized === '::1'
    || normalized === '0.0.0.0'
    || normalized.endsWith('.localhost')
    || isPrivateIpv4(normalized)
  ) {
    return { channel: 'local', destinationUrl: null };
  }
  return { channel: 'unknown', destinationUrl: null };
}