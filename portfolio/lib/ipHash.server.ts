import 'server-only';

import { createHash } from 'node:crypto';

const DEVELOPMENT_IP_HASH_SALT = 'development-sketchbook-ip-salt-v1';

function getIpHashSalt(): string {
  const salt = process.env.IP_HASH_SALT?.trim();
  if (salt) return salt;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('IP_HASH_SALT is required in production');
  }

  return DEVELOPMENT_IP_HASH_SALT;
}

export function hashClientIP(ip: string): string {
  return createHash('sha256')
    .update(getIpHashSalt())
    .update(':')
    .update(ip)
    .digest('hex')
    .slice(0, 16);
}