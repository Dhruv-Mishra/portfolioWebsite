import { describe, expect, it } from 'vitest';
import {
  classifyBuildChannel,
  PRODUCTION_URL,
  STAGING_URL,
} from '@/lib/buildChannel';

describe('build channel classifier', () => {
  it.each(['whoisdhruv.com', 'www.whoisdhruv.com', 'WHOISDHRUV.COM.'])(
    'classifies %s as production with the exact staging destination',
    (hostname) => {
      expect(classifyBuildChannel(hostname)).toEqual({
        channel: 'production',
        destinationUrl: STAGING_URL,
      });
      expect(STAGING_URL).toBe('https://staging.whoisdhruv.com');
    },
  );

  it('classifies staging with a clean production destination', () => {
    expect(classifyBuildChannel('staging.whoisdhruv.com')).toEqual({
      channel: 'staging',
      destinationUrl: PRODUCTION_URL,
    });
  });

  it.each([
    'localhost',
    'app.localhost',
    '127.0.0.1',
    '127.24.8.9',
    '10.20.30.40',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.20',
    '::1',
    '[::1]',
  ])('never provides a redirect destination for local host %s', (hostname) => {
    expect(classifyBuildChannel(hostname)).toEqual({
      channel: 'local',
      destinationUrl: null,
    });
  });

  it.each([
    'example.com',
    'preview.whoisdhruv.com',
    '172.15.0.1',
    '172.32.0.1',
    '192.169.1.1',
    '',
  ])('never provides a redirect destination for unknown host %s', (hostname) => {
    expect(classifyBuildChannel(hostname)).toEqual({
      channel: 'unknown',
      destinationUrl: null,
    });
  });
});