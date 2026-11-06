import { describe, expect, it } from 'vitest';
import { validIntegrationKey } from './integrationKey';

const KEY = 'k'.repeat(32);
describe('validIntegrationKey', () => {
  it('accepts exactly the configured key', () => expect(validIntegrationKey(KEY, KEY)).toBe(true));
  it('refuses a wrong, partial, longer, empty or missing key', () => {
    for (const bad of ['x'.repeat(32), KEY.slice(0, 31), KEY + 'k', '', null]) expect(validIntegrationKey(bad, KEY)).toBe(false);
  });
  it('is off when no key is configured, or the configured key is too short to be safe', () => {
    expect(validIntegrationKey(KEY, undefined)).toBe(false);
    expect(validIntegrationKey('short', 'short')).toBe(false);
    expect(validIntegrationKey('', '')).toBe(false);
  });
});
