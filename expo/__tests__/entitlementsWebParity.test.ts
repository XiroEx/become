/**
 * ─── THE DRIFT TEST (NP-017 / NP-049) ─────────────────────────────────────────
 *
 * Decision NP-017: the gate copy lives ONCE, in `@become/core`, and both apps
 * import it. `webapp/lib/entitlementsClient.ts` re-exports
 * `@become/core/entitlements` and nothing else; `expo/lib/entitlements` does the
 * same through the Metro `file:` link. There is no second copy, and this file
 * fails the build if one appears — in either tree.
 *
 * Why it is here and not in `webapp/`: the webapp resolves `@become/core` from
 * `https://registry.redbtn.io/` as a published package, so the only place BOTH
 * the shared source and the webapp's module text can be seen at once is a job
 * that has the repo checked out and the shared tree installed. The `expo` job
 * runs on exactly the condition `shared-core` does (`expo/` or `shared/`
 * changed), and `webapp/tests/unit/entitlements/coreModule.test.ts` is the same
 * guard from the always-on side, for a webapp-only PR.
 *
 * A drift here is silent in both builds and lands on the member: two apps that
 * explain the same cap in different words, or — worse — a native lock computed
 * from `limit` and `used` while the web reads the server's `canCreate`.
 *
 * Everything imported below comes from `@become/core/entitlements`, which Jest
 * maps to `shared/core/src/entitlements.ts` — the same file Metro bundles and
 * the same file `shared/core` publishes.
 */

import * as fs from "fs";
import * as path from "path";
import {
  FEATURE_LABELS,
  FEATURE_MIN_TIER,
  FREE_LIMITS,
  PLUS_BENEFITS,
  allowanceLine,
  featureHeadline,
  formatResetsAt,
  gateFrom,
  hasManageableBilling,
  planGate,
  syntheticGate,
  tierLabel,
  type Feature,
} from "@become/core/entitlements";
import * as core from "@become/core/entitlements";

const REPO_ROOT = path.resolve(__dirname, "../..");

const read = (rel: string): string => {
  const file = path.join(REPO_ROOT, rel);
  expect(fs.existsSync(file)).toBe(true);
  return fs.readFileSync(file, "utf8");
};

/** Every `.ts`/`.tsx` file under a repo-relative directory. */
function sourcesUnder(rel: string): string[] {
  const root = path.join(REPO_ROOT, rel);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

// ─── One module, two apps ────────────────────────────────────────────────────

describe("there is no second copy of the gate copy", () => {
  it("the webapp's entitlementsClient is a re-export of @become/core and nothing else", () => {
    const client = read("webapp/lib/entitlementsClient.ts");
    expect(client).toMatch(/export\s+\*\s+from\s+['"]@become\/core\/entitlements['"]/);

    // Strip the comments, then refuse any declaration of its own. A copy of
    // `allowanceLine` here would be a second source of truth for what a member
    // is told when they hit a cap, and it would pass every existing test.
    const code = client
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:'"`])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/export\s+(const|function|class|interface|type|enum)\s/);
    expect(code).not.toMatch(/@become\/core\/dist/);
  });

  it("native takes the copy from @become/core and declares none of it", () => {
    const index = read("expo/lib/entitlements/index.ts");
    expect(index).toMatch(/from\s+['"]@become\/core['"]/);

    const copySymbols = [
      "featureHeadline",
      "allowanceLine",
      "formatResetsAt",
      "syntheticGate",
      "planGate",
      "gateFrom",
      "tierLabel",
      "hasManageableBilling",
      "PLUS_BENEFITS",
      "FEATURE_LABELS",
      "FEATURE_NOUN",
      "FREE_LIMITS",
      "FEATURE_MIN_TIER",
    ];
    const nativeSources = [
      ...sourcesUnder("expo/lib/entitlements"),
      ...sourcesUnder("expo/components/entitlements"),
    ];
    expect(nativeSources.length).toBeGreaterThan(0);
    for (const file of nativeSources) {
      const source = fs.readFileSync(file, "utf8");
      for (const symbol of copySymbols) {
        expect(source).not.toMatch(
          new RegExp(`(export\\s+)?(const|function|let|var)\\s+${symbol}\\b`),
        );
      }
    }
  });

  it("every name the webapp imports from it is still exported by @become/core", () => {
    // A rename in `shared/core` that the webapp still asks for by name is a
    // drift the published package hides until the next publish. Reading the
    // web's imports is how it gets caught on this side.
    const declared = new Set<string>(Object.keys(core));
    const source = read("shared/core/src/entitlements.ts");
    for (const match of source.matchAll(
      /export\s+(?:declare\s+)?(?:const|function|class|interface|type|enum)\s+(\w+)/g,
    )) {
      declared.add(match[1] as string);
    }

    const importPattern =
      /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@\/lib\/entitlementsClient['"]/g;
    const wanted = new Set<string>();
    for (const rel of ["webapp/app", "webapp/components", "webapp/hooks", "webapp/lib"]) {
      for (const file of sourcesUnder(rel)) {
        const text = fs.readFileSync(file, "utf8");
        for (const match of text.matchAll(importPattern)) {
          for (const raw of (match[1] as string).split(",")) {
            const name = raw
              .trim()
              .replace(/^type\s+/, "")
              .split(/\s+as\s+/)[0]
              ?.trim();
            if (name) wanted.add(name);
          }
        }
      }
    }

    // If this is empty the scan has stopped working, not the webapp.
    expect(wanted.size).toBeGreaterThan(5);
    for (const name of wanted) {
      expect(declared.has(name)).toBe(true);
    }
  });
});

// ─── The store's rules are the hook's rules ──────────────────────────────────

describe("the native store keeps the web hook's rules", () => {
  const hook = () => read("webapp/hooks/useEntitlements.ts");
  const store = () => read("expo/lib/entitlements/store.ts");

  /** The number after `export const NAME =` / `const NAME =`, underscores and all. */
  const constant = (source: string, name: string): number => {
    const match = new RegExp(`${name}\\s*=\\s*([0-9_]+(?:\\s*\\*\\s*[0-9_]+)*)`).exec(
      source,
    );
    expect(match).not.toBeNull();
    const expression = (match?.[1] as string).replace(/_/g, "");
    return expression
      .split("*")
      .map((part) => Number(part.trim()))
      .reduce((a, b) => a * b, 1);
  };

  it("uses the same 60s TTL and the same 12h seed ceiling", () => {
    expect(constant(store(), "ENTITLEMENTS_TTL_MS")).toBe(constant(hook(), "TTL_MS"));
    expect(constant(store(), "ENTITLEMENTS_SEED_MAX_AGE_MS")).toBe(
      constant(hook(), "SEED_MAX_AGE_MS"),
    );
  });

  it("carries all four ordering rules, not three", () => {
    const source = store();
    // 1. Identity first: a different token is somebody else's plan.
    expect(source).toMatch(/if \(snapshot && token !== fetchedForToken\) resetEntitlementsSnapshot\(\)/);
    // 2. A forced read never adopts what is already on the wire.
    expect(source).toMatch(/if \(!force && inflight && inflightSeq > supersededSeq\) return inflight/);
    // 3. …and declares it out of date, so it cannot land on top.
    expect(source).toMatch(/if \(force\) supersededSeq = seq - 1/);
    // 4. A response that was superseded is dropped rather than cached.
    expect(source).toMatch(/if \(seq <= supersededSeq\) return snapshot/);
    // And the invalidate half of the same race.
    expect(source).toMatch(/supersededSeq = requestSeq/);
  });
});

// ─── The copy itself ─────────────────────────────────────────────────────────
//
// The exact strings both apps render. `webapp/tests/unit/entitlements/
// uiSurfaces.test.tsx` asserts the same ones against the PUBLISHED package, so
// the two suites together are the behavioural lockstep: if the published build
// and this source ever disagree, one of them goes red.

describe("the gate copy", () => {
  it("headlines the cap for an inventory feature, and the feature otherwise", () => {
    for (const feature of [
      "custom-meals",
      "custom-exercises",
      "custom-programs",
      "custom-foods",
      "custom-sessions",
    ] as Feature[]) {
      expect(featureHeadline(feature, "plus")).toMatch(/^Unlimited /);
    }
    expect(featureHeadline("custom-exercises", "plus")).toBe(
      "Unlimited custom exercises are a Plus feature",
    );
    expect(featureHeadline("vision", "plus")).toBe("Vision is a Plus feature");
    expect(featureHeadline(undefined, "plus")).toBe("What Plus unlocks");
    expect(tierLabel("free")).toBe("Free");
    expect(tierLabel("plus")).toBe("Plus");
  });

  it("agrees with itself about number in a synthetic gate", () => {
    for (const feature of [
      "custom-meals",
      "custom-exercises",
      "custom-programs",
      "custom-foods",
      "custom-sessions",
      "ai-food-estimate",
    ] as Feature[]) {
      expect(syntheticGate(feature).error).toMatch(/ are included with Plus\.$/);
    }
    for (const feature of [
      "workout-generation",
      "mind-sessions",
      "vision",
    ] as Feature[]) {
      expect(syntheticGate(feature).error).toMatch(/ is included with Plus\.$/);
    }
  });

  it("names the way back out of an inventory cap", () => {
    expect(
      allowanceLine({
        error: "x",
        requiresTier: "plus",
        feature: "custom-exercises",
        limit: 3,
        remaining: 0,
        window: "lifetime",
      }),
    ).toBe(
      "You're using all 3 of your free slots. Delete one to free a slot, or upgrade for unlimited.",
    );
    // Starring is undone by UNstarring, not by deleting.
    expect(
      allowanceLine({
        error: "x",
        requiresTier: "plus",
        feature: "custom-sessions",
        limit: 3,
        remaining: 0,
        window: "lifetime",
      }),
    ).toMatch(/Unstar one to free a slot/);
    // A milestone has no way back: it is progress, not inventory.
    expect(
      allowanceLine({
        error: "x",
        requiresTier: "plus",
        feature: "mind-sessions",
        limit: 10,
        remaining: 0,
        window: "lifetime",
      }),
    ).toBe("You've finished all 10 of your free sessions.");
    expect(
      allowanceLine({
        error: "x",
        requiresTier: "plus",
        feature: "ai-food-estimate",
        limit: 1,
        remaining: 0,
        resetsAt: "2026-10-01T04:00:00.000Z",
        window: "day",
      }),
    ).toBe("0 of 1 left. Resets at midnight.");
    expect(allowanceLine({ error: "x", requiresTier: "plus" })).toBeNull();
  });

  it("phrases a reset from the window, not from the timestamp", () => {
    expect(formatResetsAt("2026-10-01T04:00:00.000Z", "day")).toBe("at midnight");
    expect(formatResetsAt("2026-10-05T04:00:00.000Z", "week")).toBe("on Monday");
    expect(formatResetsAt(null)).toBeNull();
    expect(formatResetsAt("not a date", "day")).toBeNull();
  });

  it("only treats a 403 carrying BOTH feature and requiresTier as a gate", () => {
    expect(
      gateFrom(403, {
        error: "You've saved all 3 of your free custom exercises.",
        requiresTier: "plus",
        feature: "custom-exercises",
        limit: 3,
        remaining: 0,
        resetsAt: null,
        window: "lifetime",
      }),
    ).toMatchObject({ feature: "custom-exercises", requiresTier: "plus", limit: 3 });
    // An ownership or role 403 must keep falling through to the ordinary error.
    expect(gateFrom(403, { error: "Not your program" })).toBeNull();
    expect(gateFrom(403, { error: "Nope", requiresTier: "plus" })).toBeNull();
    expect(gateFrom(401, { error: "Unauthorized" })).toBeNull();
    expect(gateFrom(200, { error: "x", feature: "vision", requiresTier: "plus" })).toBeNull();
    // A sheet that names no feature headlines the TIER.
    expect(planGate("Everything in Become, with no limits.").feature).toBeUndefined();
  });

  it("decides Manage billing from Stripe's status, never from the tier", () => {
    expect(
      hasManageableBilling({ status: "past_due", currentPeriodEnd: null, cancelAtPeriodEnd: false }),
    ).toBe(true);
    expect(
      hasManageableBilling({ status: "none", currentPeriodEnd: null, cancelAtPeriodEnd: false }),
    ).toBe(false);
    expect(hasManageableBilling(null)).toBe(false);
  });

  it("carries one label and one free limit per gated feature", () => {
    const features = Object.keys(FEATURE_MIN_TIER) as Feature[];
    expect(features.length).toBeGreaterThan(0);
    for (const feature of features) {
      expect(typeof FEATURE_LABELS[feature]).toBe("string");
      expect(FREE_LIMITS[feature]).toBeDefined();
    }
    expect(PLUS_BENEFITS.length).toBe(3);
  });
});
