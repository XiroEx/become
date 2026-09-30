/**
 * ─── What the four tiles actually draw, and where a tap goes ──────────────────
 *
 * An App Widget is drawn by the launcher from a `RemoteViews` tree, so there is
 * no DOM and no RN host tree to query — the element tree the library serialises
 * IS the drawing. `test-support/widgetTree.ts` flattens it, which is what lets
 * these tests ask the member's questions: what does it say, where does it go,
 * what colour is the number.
 *
 * The rules under test are the ones that make a widget trustworthy:
 *
 *   • the server's strings are drawn verbatim — no pluralising, no rounding, no
 *     second opinion about what "at risk" means;
 *   • every state is a drawing, including the two that have no numbers;
 *   • a tap always carries a `become://` uri that the ONE resolver can place;
 *   • the palette and the typeface are the app's own.
 */
import type { WidgetState } from "@become/api-client";
import { ANDROID_WIDGETS } from "@/lib/widgets/androidWidgets";
import { darkTokens } from "@/lib/theme/tokens";
import { GEIST_FACES } from "@/lib/theme/fonts";
import {
  NATIVE_ROUTES,
  resolveWebPath,
} from "@/lib/navigation/webPathToRoute";
import {
  BecomeWidgetSurface,
  SignedOutWidgetSurface,
  UnavailableWidgetSurface,
  WIDGET_COLORS,
  WIDGET_FONTS,
  hexFromTriplet,
  renderAndroidWidget,
  widgetSurfaceMode,
} from "@/lib/widgets/render";
import type { WidgetSnapshotRow } from "@/lib/widgets/snapshot";
import {
  styleOfText,
  widgetNodes,
  widgetTaps,
  widgetTexts,
} from "@/test-support/widgetTree";

function snapshotRow(over: Partial<WidgetSnapshotRow> = {}): WidgetSnapshotRow {
  return {
    key: "streak",
    title: "Streak",
    headline: "12",
    headlineUnit: "days",
    caption: "2 days to 14",
    state: "done",
    progress: 0.857,
    deepLink: "/dashboard/streaks",
    ...over,
  };
}

const STREAK = ANDROID_WIDGETS[0]!;

describe("a widget with a feed row behind it", () => {
  it("draws the server's headline, unit and caption, unchanged", () => {
    const tile = <BecomeWidgetSurface row={snapshotRow()} />;
    expect(widgetTexts(tile)).toEqual(["Streak", "12", "days", "2 days to 14"]);
  });

  it("draws a headline that is a word, not a number, just as happily", () => {
    const tile = (
      <BecomeWidgetSurface
        row={snapshotRow({
          key: "mind",
          title: "Mind",
          headline: "Resting",
          headlineUnit: null,
          caption: "Chapter 2 · Momentum · 3/7",
          state: "none",
          progress: 0.42,
          deepLink: "/dashboard/mind",
        })}
      />
    );
    expect(widgetTexts(tile)).toEqual([
      "Mind",
      "Resting",
      "Chapter 2 · Momentum · 3/7",
    ]);
  });

  it("taps through to the row's own screen, as a become:// uri", () => {
    const taps = widgetTaps(<BecomeWidgetSurface row={snapshotRow()} />);
    expect(taps).toEqual([
      { clickAction: "OPEN_URI", uri: "become://dashboard/streaks" },
    ]);
  });

  it("is one tap target, not four", () => {
    expect(widgetTaps(<BecomeWidgetSurface row={snapshotRow()} />)).toHaveLength(
      1,
    );
  });

  it("draws the bar as integer weights out of 100 — the Java side reads an int", () => {
    const tile = <BecomeWidgetSurface row={snapshotRow({ progress: 0.42 })} />;
    const weights = widgetNodes(tile)
      .map((n) => (n.props.style as { flex?: number } | undefined)?.flex)
      .filter((f): f is number => typeof f === "number");
    expect(weights).toEqual([42, 58]);
    for (const weight of weights) expect(Number.isInteger(weight)).toBe(true);
  });

  it("draws no empty first segment at 0%", () => {
    const tile = <BecomeWidgetSurface row={snapshotRow({ progress: 0 })} />;
    const weights = widgetNodes(tile)
      .map((n) => (n.props.style as { flex?: number } | undefined)?.flex)
      .filter((f): f is number => typeof f === "number");
    expect(weights).toEqual([100]);
  });

  it("draws no bar at all when the row has nothing to fill", () => {
    const tile = <BecomeWidgetSurface row={snapshotRow({ progress: null })} />;
    const weights = widgetNodes(tile)
      .map((n) => (n.props.style as { flex?: number } | undefined)?.flex)
      .filter((f): f is number => typeof f === "number");
    expect(weights).toEqual([]);
  });

  it("warns in the accent colour when the day is at risk, and dims a nothing-yet state", () => {
    const atRisk = (
      <BecomeWidgetSurface
        row={snapshotRow({ state: "at-risk", caption: "Nothing logged yet today" })}
      />
    );
    expect(styleOfText(atRisk, "12").color).toBe(WIDGET_COLORS.accent);

    const none = <BecomeWidgetSurface row={snapshotRow({ state: "none" })} />;
    expect(styleOfText(none, "12").color).toBe(WIDGET_COLORS.muted);

    const done = <BecomeWidgetSurface row={snapshotRow({ state: "done" })} />;
    expect(styleOfText(done, "12").color).toBe(WIDGET_COLORS.foreground);
  });

  it("reads the member's day out loud for a screen reader", () => {
    const tile = <BecomeWidgetSurface row={snapshotRow()} />;
    const root = widgetNodes(tile)[0];
    expect(root?.props.accessibilityLabel).toBe(
      "Streak: 12 days. 2 days to 14",
    );
  });
});

describe("the signed-out prompt", () => {
  it("says sign in, and says nothing about the member's day", () => {
    const tile = <SignedOutWidgetSurface definition={STREAK} />;
    const texts = widgetTexts(tile);
    expect(texts).toEqual([
      "Become",
      "Sign in",
      "Tap to sign in and see your day.",
    ]);
    expect(texts.join(" ")).not.toMatch(/\d/);
  });

  it("taps to the sign-in screen, not Home", () => {
    const taps = widgetTaps(<SignedOutWidgetSurface definition={STREAK} />);
    expect(taps).toEqual([{ clickAction: "OPEN_URI", uri: "become://login" }]);
    expect(resolveWebPath("become://login")).toMatchObject({
      kind: "native",
      pathname: NATIVE_ROUTES.login,
    });
  });

  it("is what every one of the four draws when the token is gone", () => {
    for (const definition of ANDROID_WIDGETS) {
      const tile = renderAndroidWidget({ definition, row: null, signedIn: false });
      expect(widgetTexts(tile)).toContain("Sign in");
      expect(widgetTaps(tile)[0]?.uri).toBe("become://login");
    }
  });

  // A signed-out widget must not keep painting a cached day: the decision is
  // made on the TOKEN, so a snapshot left behind cannot leak through it.
  it("ignores a snapshot row when there is no token", () => {
    const tile = renderAndroidWidget({
      definition: STREAK,
      row: snapshotRow(),
      signedIn: false,
    });
    expect(widgetTexts(tile)).not.toContain("12");
  });
});

describe("the no-trustworthy-data state", () => {
  it("asks the member to open Become instead of drawing a hollow zero", () => {
    const tile = <UnavailableWidgetSurface definition={STREAK} />;
    expect(widgetTexts(tile)).toEqual([
      "Streak",
      "—",
      "Open Become to update this.",
    ]);
  });

  it("taps into the app", () => {
    const taps = widgetTaps(<UnavailableWidgetSurface definition={STREAK} />);
    expect(taps[0]?.uri).toBe("become://dashboard");
    expect(resolveWebPath("become://dashboard")).toMatchObject({
      kind: "native",
      pathname: NATIVE_ROUTES.home,
      fallback: "exact",
    });
  });
});

describe("widgetSurfaceMode — one decision, two callers", () => {
  it("signed out wins over everything", () => {
    expect(widgetSurfaceMode({ signedIn: false, row: snapshotRow() })).toBe(
      "signed-out",
    );
  });

  it("a row draws the row; no row draws the invitation", () => {
    expect(widgetSurfaceMode({ signedIn: true, row: snapshotRow() })).toBe("row");
    expect(widgetSurfaceMode({ signedIn: true, row: null })).toBe("unavailable");
  });
});

describe("every widget draws a tile that can never be blank", () => {
  const states: WidgetState[] = ["none", "todo", "done", "at-risk"];

  it("has text and a tap in every state, for every widget", () => {
    for (const definition of ANDROID_WIDGETS) {
      for (const state of states) {
        const tile = renderAndroidWidget({
          definition,
          row: snapshotRow({ key: definition.feedKey, state }),
          signedIn: true,
        });
        expect(widgetTexts(tile).filter(Boolean).length).toBeGreaterThan(0);
        expect(widgetTaps(tile)[0]?.uri).toMatch(/^become:\/\//);
      }
    }
  });
});

describe("the tree is one the native side can actually inflate", () => {
  // `buildWidgetTree` is what the library runs before handing the tree to Java:
  // it expands every custom component by CALLING it (so a widget component may
  // not use hooks), demands that every leaf be a real widget primitive, and
  // rejects an impossible tree. Running it here is the closest this container
  // gets to the launcher inflating the tile.
  const { buildWidgetTree } = jest.requireActual<{
    buildWidgetTree: (tree: unknown) => { type: string };
  }>("react-native-android-widget/lib/commonjs/api/build-widget-tree");

  it("builds for every widget, in every state", () => {
    for (const definition of ANDROID_WIDGETS) {
      for (const signedIn of [true, false]) {
        for (const row of [
          null,
          snapshotRow({ key: definition.feedKey }),
          snapshotRow({ key: definition.feedKey, progress: null, headlineUnit: null }),
        ]) {
          const built = buildWidgetTree(
            renderAndroidWidget({ definition, row, signedIn }),
          );
          // A `LinearLayoutWidget` root is a FlexWidget: the tile itself.
          expect(built.type).toBe("LinearLayoutWidget");
        }
      }
    }
  });
});

describe("the palette and the typeface are the app's own", () => {
  it("derives every colour from darkTokens rather than retyping one", () => {
    expect(hexFromTriplet("10 10 10")).toBe("#0a0a0a");
    expect(WIDGET_COLORS.surface).toBe(hexFromTriplet(darkTokens.card));
    expect(WIDGET_COLORS.foreground).toBe(
      hexFromTriplet(darkTokens.foreground),
    );
    expect(WIDGET_COLORS.muted).toBe(
      hexFromTriplet(darkTokens["muted-foreground"]),
    );
    expect(WIDGET_COLORS.primary).toBe(hexFromTriplet(darkTokens.primary));
    expect(WIDGET_COLORS.accent).toBe(hexFromTriplet(darkTokens.accent));
  });

  it("names Geist faces the app already registers", () => {
    expect(WIDGET_FONTS.headline).toBe(GEIST_FACES.sans[700]);
    expect(WIDGET_FONTS.title).toBe(GEIST_FACES.sans[500]);
    expect(WIDGET_FONTS.caption).toBe(GEIST_FACES.sans[400]);
  });

  it("puts a face on every string it draws — RN has no cascade and neither has this", () => {
    const tile = <BecomeWidgetSurface row={snapshotRow()} />;
    const faces = Object.values(WIDGET_FONTS) as string[];
    for (const node of widgetNodes(tile).filter((n) => n.name === "TextWidget")) {
      const style = node.props.style as { fontFamily?: string };
      expect(faces).toContain(style.fontFamily);
    }
  });
});
