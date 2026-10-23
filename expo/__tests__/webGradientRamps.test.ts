// `webGradientRamps` are oklab-sampled five-stop ramps (Tailwind v4 blends
// gradients in oklab; expo-linear-gradient blends in sRGB). Each one is
// RE-DERIVED here from its two end tokens, so moving a token without
// regenerating the ramp fails the build instead of quietly skewing a badge.

import {
  darkTokens,
  webGradientRamps,
  webGradientTokens,
} from "@/lib/theme/tokens";

type V3 = [number, number, number];

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklab([r8, g8, b8]: V3): V3 {
  const r = lin(r8 / 255);
  const g = lin(g8 / 255);
  const b = lin(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: V3): V3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin3: V3 = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin3.map((x) => Math.round(gam(Math.min(1, Math.max(0, x))) * 255)) as V3;
}

const parse = (triplet: string): V3 => triplet.split(" ").map(Number) as V3;

function ramp(from: string, to: string): string[] {
  const A = toOklab(parse(from));
  const B = toOklab(parse(to));
  return [0, 0.25, 0.5, 0.75, 1].map((t) =>
    fromOklab(A.map((x, i) => x + (B[i]! - x) * t) as V3).join(" "),
  );
}

describe("webGradientRamps", () => {
  const cases: [keyof typeof webGradientRamps, string, string][] = [
    ["violetToGreen", darkTokens["mind-violet"], darkTokens["mind-green"]],
    ["amberToGreen", webGradientTokens.amber500, darkTokens["mind-green"]],
    ["redToAmber", webGradientTokens.red500, webGradientTokens.amber500],
    ["skyToGreen", webGradientTokens.sky500, darkTokens["mind-green"]],
  ];

  it.each(cases)("%s is its two end tokens blended in oklab at ¼ steps", (name, from, to) => {
    const derived = ramp(from, to);
    const stored = [...webGradientRamps[name]];
    // ±1 per channel: the stored values were rounded by a sibling script.
    for (let i = 0; i < 5; i++) {
      const a = parse(stored[i]!);
      const b = parse(derived[i]!);
      for (let c = 0; c < 3; c++) expect(Math.abs(a[c]! - b[c]!)).toBeLessThanOrEqual(1);
    }
    expect(stored[0]).toBe(from);
    expect(stored[4]).toBe(to);
  });

  it("the violet → green mid stop is the web's #699bb5, not sRGB's duller #5791aa", () => {
    expect(webGradientRamps.violetToGreen[2]).toBe("105 155 181");
  });
});
