/**
 * ─── What one iOS tile draws, and where a tap goes ───────────────────────────
 *
 * `BecomeWidget` (`lib/widgets/ios/BecomeWidget.tsx`) is the `'widget'`
 * layout every one of the five WidgetKit tiles renders: title, headline +
 * unit, caption, a `ProgressView` bar when `progress` is not null, a state
 * tint, and the sign-in prompt when signed out. The tap target is `props.url`,
 * carried both as the `Link` destination and the `widgetURL` modifier on the
 * root `VStack` (`expo-widgets` 57 exposes no separate tap-URL API — see
 * `node_modules/expo-widgets/build/Widgets.d.ts`).
 *
 * Under Jest the `'widget'` directive means `babel-preset-expo` replaces the
 * component with its stringified layout — importing the module yields the
 * layout source, not a callable. That is exactly what the extension evaluates
 * (`__expoWidgetLayout`), so these tests evaluate the layout source back into
 * a function (with the real `@expo/ui` views and modifiers in scope) and
 * render it with `@testing-library/react-native`, where the `@expo/ui` views
 * appear as `ViewManagerAdapter_ExpoUI` hosts carrying the props the extension
 * would read (`text`, `value`, `destination`, `modifiers`). The rules under
 * test are the ones that make a widget trustworthy:
 *
 *   • the server's strings are drawn verbatim — no re-wording, no re-derived
 *     state;
 *   • the bar appears exactly when `progress` is not null;
 *   • signed out is the prompt and the sign-in url — never a number, because
 *     a number on a signed-out tile is another member's day.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { jsx, jsxs } from "react/jsx-runtime";
import * as swiftUI from "@expo/ui/swift-ui";
import * as modifiers from "@expo/ui/swift-ui/modifiers";
import type { WidgetState } from "@become/api-client";
import {
  BecomeWidget,
  iosWidgetStateTint,
} from "@/lib/widgets/ios/BecomeWidget";
import {
  IOS_WIDGET_SIGN_IN_PROMPT,
  type IosWidgetProps,
} from "@/lib/widgets/iosTimeline";

interface Host {
  type: string;
  props: Record<string, unknown>;
  children: Host[] | null;
}

function hostOf(node: unknown): Host | null {
  if (!node || typeof node !== "object") return null;
  const candidate = node as Partial<Host>;
  if (typeof candidate.type !== "string") return null;
  return node as Host;
}

/** Every `text` prop in the tree, in draw order. */
function texts(node: Host | null, out: string[] = []): string[] {
  if (!node) return out;
  const text = node.props["text"];
  if (typeof text === "string") out.push(text);
  for (const child of node.children ?? []) texts(child, out);
  return out;
}

/** Every `value` prop (a `ProgressView` bar) in the tree. */
function bars(node: Host | null, out: unknown[] = []): unknown[] {
  if (!node) return out;
  if ("value" in node.props) out.push(node.props["value"]);
  for (const child of node.children ?? []) bars(child, out);
  return out;
}

/** Every tap target: `Link` destinations plus `widgetURL` modifiers. */
function tapTargets(node: Host | null, out: string[] = []): string[] {
  if (!node) return out;
  const destination = node.props["destination"];
  if (typeof destination === "string") out.push(destination);
  const mods = node.props["modifiers"];
  if (Array.isArray(mods)) {
    for (const modifier of mods) {
      if (
        modifier &&
        typeof modifier === "object" &&
        (modifier as Record<string, unknown>)["$type"] === "widgetURL" &&
        typeof (modifier as Record<string, unknown>)["url"] === "string"
      ) {
        out.push((modifier as Record<string, unknown>)["url"] as string);
      }
    }
  }
  for (const child of node.children ?? []) tapTargets(child, out);
  return out;
}

type LayoutFn = (
  props: IosWidgetProps,
  environment?: { widgetFamily?: string },
) => React.ReactElement;

/**
 * The layout source back into a function, the way the extension evaluates it:
 * the stringified component references the `@expo/ui` views, the modifiers
 * and the prompt constant free, so they go in scope explicitly.
 */
function layoutFn(): LayoutFn {
  const src = BecomeWidget as unknown as string;
  if (typeof src !== "string") {
    throw new Error("expected the 'widget' layout source");
  }
  const scope: Record<string, unknown> = {
    ...swiftUI,
    ...modifiers,
    React,
    _jsx: jsx,
    _jsxs: jsxs,
    jsx,
    jsxs,
    IOS_WIDGET_SIGN_IN_PROMPT,
  };
  const names = Object.keys(scope);
  const factory = new Function(
    ...names,
    `"use strict"; return (${src});`,
  ) as (...args: unknown[]) => LayoutFn;
  return factory(...names.map((name) => scope[name]));
}

function rendered(
  props: IosWidgetProps,
  environment?: { widgetFamily?: string },
): Host | null {
  const { toJSON } = render(layoutFn()(props, environment) as never);
  return hostOf(toJSON());
}

function signedInProps(over: Partial<IosWidgetProps> = {}): IosWidgetProps {
  return {
    signedIn: true,
    title: "Streak",
    headline: "12",
    headlineUnit: "days",
    caption: "2 days to 14",
    state: "done",
    progress: 0.85,
    rings: [],
    url: "become://dashboard/streaks",
    ...over,
  } as IosWidgetProps;
}

function nutritionProps(): IosWidgetProps {
  return signedInProps({
    title: "Nutrition",
    headline: "820",
    headlineUnit: "cal left",
    caption: "P 120/160g · C 180/240g · F 40/60g",
    state: "todo",
    progress: 0.59,
    rings: [
      ["Cal", 1180, 0.59, "cal"],
      ["Protein", 120, 0.75, "g"],
      ["Carbs", 180, 0.75, "g"],
      ["Fat", 40, 0.67, "g"],
    ],
    url: "become://dashboard/nutrition",
  });
}

describe("iosWidgetStateTint", () => {
  it("tints done/todo/at-risk/none distinctly", () => {
    const states: WidgetState[] = ["done", "todo", "at-risk", "none"];
    const tints = states.map(iosWidgetStateTint);
    expect(new Set(tints).size).toBe(states.length);
    for (const tint of tints) expect(typeof tint).toBe("string");
  });
});

describe("BecomeWidget — signed in", () => {
  it("draws the feed's strings verbatim", () => {
    const found = texts(rendered(signedInProps()));
    expect(found).toContain("Streak");
    expect(found).toContain("12");
    expect(found).toContain("days");
    expect(found).toContain("2 days to 14");
  });

  it("draws the bar exactly when progress is not null", () => {
    expect(bars(rendered(signedInProps({ progress: 0.85 })))).toEqual([0.85]);
    expect(bars(rendered(signedInProps({ progress: null })))).toEqual([]);
  });

  it("omits the unit when there is none", () => {
    const found = texts(rendered(signedInProps({ headlineUnit: null })));
    expect(found).toContain("12");
    expect(found).not.toContain("days");
  });

  it("draws a state tint (done/todo/at-risk/none)", () => {
    for (const [state, label] of [
      ["done", "Done"],
      ["todo", "To do"],
      ["at-risk", "Needs attention today"],
      ["none", "Not set up yet"],
    ] as const) {
      const found = texts(rendered(signedInProps({ state })));
      expect(found).toContain(label);
    }
  });

  it("carries the tap target as Link destination and widgetURL modifier", () => {
    const targets = tapTargets(rendered(signedInProps()));
    expect(targets).toContain("become://dashboard/streaks");
    // Both: the Link's destination AND the root's widgetURL modifier.
    expect(
      targets.filter((t) => t === "become://dashboard/streaks").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("uses @expo/ui swift-ui primitives only", () => {
    const layout = BecomeWidget as unknown as string;
    for (const primitive of [
      "Text",
      "VStack",
      "HStack",
      "Spacer",
      "ProgressView",
      "Link",
    ]) {
      expect(layout).toMatch(new RegExp(`\\b${primitive}\\b`));
    }
  });

  it("inlines the sign-in prompt — a free import would be a red box natively", () => {
    // The stringified layout runs in a bare JSContext: module-scope bindings
    // do not survive, so the prompt must appear as a literal. This pins the
    // literal to the constant the timeline builder sends.
    const layout = BecomeWidget as unknown as string;
    expect(typeof layout === "string" ? layout : "").toContain(
      IOS_WIDGET_SIGN_IN_PROMPT,
    );
  });

  it("references no module-scope helper — only views, modifiers and literals", () => {
    // Anything the layout calls but the extension's scope does not provide is
    // a ReferenceError at paint time. The scope is the `@expo/ui` views, the
    // modifiers, React and the jsx runtime (see the test harness above) —
    // these are the only free names the layout may use.
    const layout = BecomeWidget as unknown as string;
    expect(typeof layout === "string" ? layout : "").not.toMatch(
      /\biosWidget(StateTint|InlineLine)\b/,
    );
  });

  it("renders every size with nothing but the extension's own scope", () => {
    // The proof of the scoping rule above: evaluate the layout WITHOUT the
    // prompt constant (or anything else from this repo) in scope. A free
    // reference would throw a ReferenceError here — natively that is a red
    // box with no error anywhere.
    const src = BecomeWidget as unknown as string;
    if (typeof src !== "string") throw new Error("expected layout source");
    const scope: Record<string, unknown> = {
      ...swiftUI,
      ...modifiers,
      React,
      _jsx: jsx,
      _jsxs: jsxs,
      jsx,
      jsxs,
    };
    const names = Object.keys(scope);
    const factory = new Function(
      ...names,
      `"use strict"; return (${src});`,
    ) as (...args: unknown[]) => LayoutFn;
    const bare = factory(...names.map((name) => scope[name]));
    const families = [
      "systemSmall",
      "systemMedium",
      "accessoryCircular",
      "accessoryRectangular",
      "accessoryInline",
      undefined,
    ];
    for (const widgetFamily of families) {
      const element = bare(signedInProps(), { widgetFamily });
      expect(() => render(element as never)).not.toThrow();
      const out: IosWidgetProps = {
        signedIn: false,
        title: "Become · Streak",
        prompt: IOS_WIDGET_SIGN_IN_PROMPT,
        url: "become://login",
      };
      expect(() => render(bare(out, { widgetFamily }) as never)).not.toThrow();
    }
  });
});

describe("BecomeWidget — signed out", () => {
  const signedOut: IosWidgetProps = {
    signedIn: false,
    title: "Become · Streak",
    prompt: IOS_WIDGET_SIGN_IN_PROMPT,
    url: "become://login",
  };

  it("shows the prompt and never a number", () => {
    const found = texts(rendered(signedOut));
    expect(found).toContain(IOS_WIDGET_SIGN_IN_PROMPT);
    expect(found).not.toContain("12");
    expect(bars(rendered(signedOut))).toEqual([]);
  });

  it("taps to sign-in, both ways", () => {
    const targets = tapTargets(rendered(signedOut));
    expect(targets).toContain("become://login");
    expect(targets.filter((t) => t === "become://login").length).toBeGreaterThanOrEqual(2);
  });
});

describe("BecomeWidget — medium (systemMedium)", () => {
  const medium = { widgetFamily: "systemMedium" };

  it("draws the feed's strings verbatim, like small", () => {
    const found = texts(rendered(signedInProps(), medium));
    expect(found).toContain("Streak");
    expect(found).toContain("12");
    expect(found).toContain("days");
    expect(found).toContain("2 days to 14");
  });

  it("draws the nutrition macros from the rings, with one bar per ring", () => {
    const found = texts(rendered(nutritionProps(), medium));
    expect(found).toContain("Nutrition");
    expect(found).toContain("820");
    expect(found).toContain("cal left");
    for (const macro of ["Cal 1180cal", "Protein 120g", "Carbs 180g", "Fat 40g"]) {
      expect(found).toContain(macro);
    }
    // Four ring bars plus the overall progress bar.
    expect(bars(rendered(nutritionProps(), medium))).toEqual([
      0.59, 0.75, 0.75, 0.67, 0.59,
    ]);
  });

  it("draws no macro rows when the widget ships no rings", () => {
    const found = texts(rendered(signedInProps(), medium));
    expect(found).not.toContain("Cal 1180cal");
    expect(bars(rendered(signedInProps(), medium))).toEqual([0.85]);
  });

  it("draws a ring value with no bar when the member has no target for it", () => {
    const props = nutritionProps();
    if (props.signedIn !== true) throw new Error("expected signed-in props");
    const targetless = {
      ...props,
      rings: [["Carbs", 180, null, "g"] as [string, number, null, string]],
    };
    const found = texts(rendered(targetless, medium));
    expect(found).toContain("Carbs 180g");
    // The overall progress bar only — the target-less ring draws no bar.
    expect(bars(rendered(targetless, medium))).toEqual([0.59]);
  });

  it("draws the state words and carries the tap target both ways", () => {
    for (const [state, label] of [
      ["done", "Done"],
      ["todo", "To do"],
      ["at-risk", "Needs attention today"],
      ["none", "Not set up yet"],
    ] as const) {
      expect(texts(rendered(signedInProps({ state }), medium))).toContain(label);
    }
    const targets = tapTargets(rendered(signedInProps(), medium));
    expect(targets.filter((t) => t === "become://dashboard/streaks").length).toBeGreaterThanOrEqual(2);
  });

  it("signs out to the prompt, never a number", () => {
    const props: IosWidgetProps = {
      signedIn: false,
      title: "Become · Streak",
      prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      url: "become://login",
    };
    const found = texts(rendered(props, medium));
    expect(found).toContain(IOS_WIDGET_SIGN_IN_PROMPT);
    expect(found).not.toContain("12");
  });
});

describe("BecomeWidget — Lock Screen (accessory families)", () => {
  it("circular draws the headline and unit, verbatim", () => {
    const found = texts(
      rendered(signedInProps(), { widgetFamily: "accessoryCircular" }),
    );
    expect(found).toContain("12");
    expect(found).toContain("days");
  });

  it("circular omits the unit when there is none", () => {
    const found = texts(
      rendered(signedInProps({ headlineUnit: null }), {
        widgetFamily: "accessoryCircular",
      }),
    );
    expect(found).toContain("12");
    expect(found).not.toContain("days");
  });

  it("circular signs out to words, never a number", () => {
    const props: IosWidgetProps = {
      signedIn: false,
      title: "Become · Streak",
      prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      url: "become://login",
    };
    const found = texts(rendered(props, { widgetFamily: "accessoryCircular" }));
    expect(found).not.toContain("12");
    expect(found.length).toBeGreaterThan(0);
  });

  it("rectangular draws headline plus caption, verbatim", () => {
    const found = texts(
      rendered(signedInProps(), { widgetFamily: "accessoryRectangular" }),
    );
    expect(found).toContain("12");
    expect(found).toContain("days");
    expect(found).toContain("2 days to 14");
  });

  it("rectangular signs out to the prompt, never a number", () => {
    const props: IosWidgetProps = {
      signedIn: false,
      title: "Become · Streak",
      prompt: IOS_WIDGET_SIGN_IN_PROMPT,
      url: "become://login",
    };
    const found = texts(
      rendered(props, { widgetFamily: "accessoryRectangular" }),
    );
    expect(found).toContain(IOS_WIDGET_SIGN_IN_PROMPT);
    expect(found).not.toContain("12");
  });

  it("inline draws one line from the feed's words", () => {
    const found = texts(
      rendered(signedInProps(), { widgetFamily: "accessoryInline" }),
    );
    expect(found).toContain("Streak: 12 days · 2 days to 14");
  });

  it("inline without a unit joins the words that are there", () => {
    const found = texts(
      rendered(signedInProps({ headlineUnit: null }), {
        widgetFamily: "accessoryInline",
      }),
    );
    expect(found).toContain("Streak: 12 · 2 days to 14");
  });

  it("every Lock Screen size carries the tap target both ways", () => {
    for (const widgetFamily of [
      "accessoryCircular",
      "accessoryRectangular",
      "accessoryInline",
    ]) {
      const targets = tapTargets(rendered(signedInProps(), { widgetFamily }));
      expect(
        targets.filter((t) => t === "become://dashboard/streaks").length,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("BecomeWidget — family fallback", () => {
  it("draws small with no environment, and with a family it does not know", () => {
    for (const environment of [undefined, {}, { widgetFamily: "systemLarge" }]) {
      const found = texts(rendered(signedInProps(), environment));
      expect(found).toContain("Streak");
      expect(found).toContain("12");
      expect(found).toContain("2 days to 14");
      // Small draws the state words and the overall bar.
      expect(found).toContain("Done");
      expect(bars(rendered(signedInProps(), environment))).toEqual([0.85]);
    }
  });
});
