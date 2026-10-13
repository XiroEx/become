/**
 * ─── THE WHOLE-SURFACE GATE, ON THE PHONE (NP-052) ────────────────────────────
 *
 * Native counterpart of the web's `components/TierGate.tsx`. Four states, and the
 * one that matters most is the one where it draws NOTHING tier-aware:
 *
 *   • free member, feature not allowed  → the teaser, and the sheet on a tap;
 *   • Plus (or any `allowed` member)    → the children, untouched;
 *   • `enforced: false`, or no snapshot → the children, untouched. That single
 *     check is what lets the paywall ship dark, and it is also why a network blip
 *     can never lock anybody out of a surface the server would have allowed;
 *   • snapshot still in flight          → a neutral placeholder rather than a
 *     flash of the real surface followed by a lock.
 *
 * The words come from `@become/core`, so they are the same sentence the browser
 * shows for the same refusal.
 */

import { View } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Text } from "@/components/Text";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import { TierGate } from "@/components/entitlements/TierGate";
import {
  configureEntitlementsStore,
  loadEntitlements,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import type { BillingDeps } from "@/lib/entitlements/billing";

const NOW_MS = Date.UTC(2026, 8, 30, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor((NOW_MS + 30 * DAY_MS) / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

const MEMBER = jwtFor("member-1");

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

/** Vision: the one surface a free member may see and may not use. */
function visionPlan(allowed: boolean, enforced = true) {
  return {
    role: "user",
    tier: allowed ? "plus" : "free",
    enforced,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {
      vision: {
        allowed,
        canCreate: allowed,
        requiresTier: "plus",
        limit: allowed ? null : 0,
        used: 0,
        remaining: allowed ? null : 0,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

/** A snapshot that knows nothing about Vision at all. */
const NO_SUCH_FEATURE = {
  role: "user",
  tier: "free",
  enforced: true,
  grandfathered: false,
  subscription: null,
  checkoutAvailable: true,
  features: {},
};

/** The sheet this gate raises never reaches the network in these tests. */
const SHEET_DEPS: BillingDeps = {
  baseUrl: "https://example.test",
  store: createMemoryTokenStore(MEMBER),
  openUrl: jest.fn(async () => true),
  fetchImpl: (async () =>
    jsonResponse(200, { configured: true })) as unknown as typeof fetch,
};

let storage: AsyncStorageLike;
let entitlementsBody: unknown = visionPlan(false);
/** Settled by the test when it wants the plan read to land. */
let holdOpen: (() => void) | null = null;

const entitlementsFetch = (async () => {
  if (holdOpen) {
    await new Promise<void>((resolve) => {
      holdOpen = resolve;
    });
  }
  return jsonResponse(200, entitlementsBody);
}) as unknown as typeof fetch;

async function withPlan(body: unknown): Promise<void> {
  entitlementsBody = body;
  setEntitlementsToken(MEMBER);
  await loadEntitlements(true);
}

function Gated({ deps = SHEET_DEPS }: { deps?: BillingDeps }) {
  return (
    <TierGate feature="vision" deps={deps}>
      <View testID="vision-surface">
        <Text>Your Vision board</Text>
      </View>
    </TierGate>
  );
}

beforeEach(async () => {
  storage = createMemoryAsyncStorage();
  await clearAll(storage);
  setCacheMemberId(null);
  holdOpen = null;
  configureEntitlementsStore({
    baseUrl: "https://example.test",
    fetchImpl: entitlementsFetch,
    storage,
  });
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  entitlementsBody = visionPlan(false);
  jest.spyOn(Date, "now").mockImplementation(() => NOW_MS);
});

afterEach(async () => {
  jest.restoreAllMocks();
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  await clearAll(storage);
});

describe("a free member on a Plus-only surface", () => {
  it("sees the teaser instead of the surface, in @become/core's words", async () => {
    await withPlan(visionPlan(false));
    const screen = render(<Gated />);

    const teaser = await waitFor(() => screen.getByTestId("tier-gate-teaser"));
    expect(screen.queryByTestId("vision-surface")).toBeNull();
    expect(screen.getByTestId("tier-gate-tier")).toHaveTextContent("Plus");
    expect(screen.getByTestId("tier-gate-description")).toHaveTextContent(
      "Included with Plus. Tap to see what you get.",
    );
    // The accessible name carries the reason, not just the feature name.
    expect(teaser.props.accessibilityLabel).toBe(
      "Vision — Vision is included with Plus.",
    );
  });

  it("opens the one upgrade sheet on a tap, with the gate's own words", async () => {
    await withPlan(visionPlan(false));
    const screen = render(<Gated />);

    const teaser = await waitFor(() => screen.getByTestId("tier-gate-teaser"));
    expect(screen.queryByTestId("upgrade-sheet-error")).toBeNull();

    await act(async () => {
      fireEvent.press(teaser);
    });

    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-error")).toHaveTextContent(
        "Vision is included with Plus.",
      ),
    );
    expect(screen.getByTestId("upgrade-sheet-headline")).toHaveTextContent(
      "Vision is a Plus feature",
    );
    // `limit: 0` is "a feature you have none of", not "a cap of zero", so there
    // is no allowance line to draw.
    expect(screen.queryByTestId("upgrade-sheet-allowance")).toBeNull();

    // And it closes again.
    const dismiss = screen.getByTestId("upgrade-sheet-dismiss");
    await act(async () => {
      fireEvent.press(dismiss);
    });
    await waitFor(() => expect(screen.queryByTestId("upgrade-sheet-error")).toBeNull());
  });

  it("lets a caller replace the teaser and keep the sheet", async () => {
    await withPlan(visionPlan(false));
    const screen = render(
      <TierGate
        feature="vision"
        deps={SHEET_DEPS}
        teaser={({ requiresTier, open }) => (
          <View testID="custom-teaser">
            <Text testID="custom-teaser-tier">{requiresTier}</Text>
            <Text testID="custom-teaser-open" onPress={open}>
              See what you get
            </Text>
          </View>
        )}
      >
        <View testID="vision-surface" />
      </TierGate>,
    );

    await waitFor(() => expect(screen.getByTestId("custom-teaser")).toBeTruthy());
    expect(screen.getByTestId("custom-teaser-tier")).toHaveTextContent("plus");
    expect(screen.queryByTestId("tier-gate-teaser")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("custom-teaser-open"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("upgrade-sheet-error")).toHaveTextContent(
        "Vision is included with Plus.",
      ),
    );
  });
});

describe("everyone else", () => {
  it("renders the surface for a member the server allows", async () => {
    await withPlan(visionPlan(true));
    const screen = render(<Gated />);

    await waitFor(() => expect(screen.getByTestId("vision-surface")).toBeTruthy());
    expect(screen.queryByTestId("tier-gate-teaser")).toBeNull();
    expect(screen.queryByText("Plus")).toBeNull();
  });

  it("renders the surface with enforcement off, even for a member at the gate", async () => {
    await withPlan(visionPlan(false, false));
    const screen = render(<Gated />);

    await waitFor(() => expect(screen.getByTestId("vision-surface")).toBeTruthy());
    expect(screen.queryByTestId("tier-gate-teaser")).toBeNull();
    expect(screen.queryByTestId("tier-gate-tier")).toBeNull();
  });

  it("renders the surface when the snapshot does not carry the feature", async () => {
    await withPlan(NO_SUCH_FEATURE);
    const screen = render(<Gated />);

    await waitFor(() => expect(screen.getByTestId("vision-surface")).toBeTruthy());
    expect(screen.queryByTestId("tier-gate-teaser")).toBeNull();
  });

  it("renders the surface when there is no snapshot at all — a blip locks nobody", async () => {
    // Signed out: nothing is known about anybody's plan, and the route refuses
    // independently anyway.
    const screen = render(<Gated />);
    await waitFor(() => expect(screen.getByTestId("vision-surface")).toBeTruthy());
    expect(screen.queryByTestId("tier-gate-teaser")).toBeNull();
  });

  it("draws a neutral placeholder while the first read is in flight", async () => {
    holdOpen = () => {};
    setEntitlementsToken(MEMBER);
    const screen = render(<Gated />);

    // Neither the surface nor a lock: flashing the real thing and then locking it
    // is worse than a beat of nothing.
    // Queried with `includeHiddenElements` because the placeholder is deliberately
    // hidden from assistive technology: it is a picture of nothing, and VoiceOver
    // announcing two empty boxes is worse than silence.
    await waitFor(() =>
      expect(
        screen.getByTestId("tier-gate-placeholder", { includeHiddenElements: true }),
      ).toBeTruthy(),
    );
    expect(screen.queryByTestId("vision-surface")).toBeNull();
    expect(screen.queryByTestId("tier-gate-teaser")).toBeNull();

    await act(async () => {
      holdOpen?.();
      holdOpen = null;
    });
    await waitFor(() => expect(screen.getByTestId("tier-gate-teaser")).toBeTruthy());
  });
});
