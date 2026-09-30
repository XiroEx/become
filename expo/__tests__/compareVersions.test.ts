import { compareVersions } from '../lib/version/compareVersions';

describe('compareVersions', () => {
  it('correctly compares equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1', '1.0.0')).toBe(0);
  });

  it('correctly compares greater and lesser versions', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0);
    expect(compareVersions('0.2.0', '0.1.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('handles prerelease versions according to SemVer', () => {
    // 1.0.0-alpha is less than 1.0.0
    expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0);
    // 1.0.0-alpha < 1.0.0-beta
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
    // 1.0.0-beta.1 < 1.0.0-beta.2
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.2')).toBeLessThan(0);
  });

  it('fails open (returns 0) on null, undefined, or unparseable versions', () => {
    expect(compareVersions(null, '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', null)).toBe(0);
    expect(compareVersions(undefined, '1.0.0')).toBe(0);
    expect(compareVersions('', '1.0.0')).toBe(0);
    expect(compareVersions('not-a-version', '1.0.0')).toBe(0);
  });
});
