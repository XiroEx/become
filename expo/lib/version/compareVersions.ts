/**
 * Compares two semantic version strings according to SemVer 2.0.0 precedence.
 *
 * Returns:
 *   < 0 if v1 < v2
 *   > 0 if v1 > v2
 *   0 if v1 === v2 (or if either version cannot be parsed — fails open)
 */
export function compareVersions(v1?: string | null, v2?: string | null): number {
  if (!v1 || !v2 || typeof v1 !== 'string' || typeof v2 !== 'string') {
    return 0;
  }

  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);

  if (!p1 || !p2) {
    return 0;
  }

  // Compare major, minor, patch
  for (let i = 0; i < 3; i++) {
    const c1 = p1.core[i] ?? 0;
    const c2 = p2.core[i] ?? 0;
    if (c1 !== c2) {
      return c1 - c2;
    }
  }

  // Pre-release precedence:
  // When major, minor, and patch are equal, a normal version has greater precedence than a pre-release.
  if (p1.prerelease === null && p2.prerelease !== null) return 1;
  if (p1.prerelease !== null && p2.prerelease === null) return -1;
  if (p1.prerelease === null && p2.prerelease === null) return 0;

  // Both have pre-release strings
  return comparePrereleases(p1.prerelease!, p2.prerelease!);
}

interface ParsedSemver {
  core: [number, number, number];
  prerelease: string | null;
}

function parseSemver(raw: string): ParsedSemver | null {
  const trimmed = raw.trim().replace(/^[vV]/, '');
  if (!trimmed) return null;

  // Split off build metadata (+) first
  const withoutBuild = trimmed.split('+')[0] ?? '';
  // Split off prerelease (-)
  const parts = withoutBuild.split('-');
  const corePart = parts[0] ?? '';
  const prerelease = parts.length > 1 ? parts.slice(1).join('-') : null;

  const coreSegments = corePart.split('.');
  if (coreSegments.length === 0 || coreSegments.length > 3) {
    return null;
  }

  const core: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < coreSegments.length; i++) {
    const segment = coreSegments[i];
    if (segment === undefined) return null;
    const num = Number(segment);
    if (!Number.isInteger(num) || num < 0) {
      return null;
    }
    core[i] = num;
  }

  return { core, prerelease };
}

function comparePrereleases(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    if (i >= aParts.length) return -1;
    if (i >= bParts.length) return 1;

    const aPart = aParts[i] ?? '';
    const bPart = bParts[i] ?? '';

    const aNum = Number(aPart);
    const bNum = Number(bPart);
    const aIsNum = Number.isInteger(aNum) && String(aNum) === aPart;
    const bIsNum = Number.isInteger(bNum) && String(bNum) === bPart;

    if (aIsNum && bIsNum) {
      if (aNum !== bNum) return aNum - bNum;
    } else if (aIsNum && !bIsNum) {
      return -1; // Numeric identifiers always have lower precedence than non-numeric
    } else if (!aIsNum && bIsNum) {
      return 1;
    } else {
      if (aPart !== bPart) {
        return aPart.localeCompare(bPart);
      }
    }
  }

  return 0;
}
