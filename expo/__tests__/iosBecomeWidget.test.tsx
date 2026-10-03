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

type LayoutFn = (props: IosWidgetProps) => React.ReactElement;

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

function rendered(props: IosWidgetProps): Host | null {
  const { toJSON } = render(layoutFn()(props) as never);
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
    url: "become://dashboard/streaks",
    ...over,
  } as IosWidgetProps;
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
