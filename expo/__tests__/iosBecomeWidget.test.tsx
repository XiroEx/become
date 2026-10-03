/* eslint-disable import/first */
// ─── What the one iOS layout draws, and where a tap goes ───────────────────
//
// `jest.mock` sits between the imports on purpose: `@expo/ui/swift-ui` has no
// native side under jest, so the mocks below must win before `BecomeWidget`
// loads it.
/**
 * ─── What the one iOS layout draws, and where a tap goes ───────────────────
 *
 * WidgetKit paints a pushed timeline, not our code, so there is no host tree
 * to query — the element tree `BecomeWidget` returns IS the drawing. These
 * tests walk it the same way `test-support/widgetTree.ts` walks the Android
 * tree: flatten to plain nodes and ask the member's questions.
 *
 * The rules under test are the ones that make a widget trustworthy:
 *
 *   • the server's strings are drawn verbatim — no pluralising, no rounding,
 *     no second opinion about what "at risk" means;
 *   • the signed-out prompt says sign in and never a number;
 *   • a tap always carries the `become://` url the timeline built, through a
 *     `Link` with `destination` and the `widgetURL` modifier on the root
 *     stack — the two shapes of the one tap target.
 *
 * `@expo/ui/swift-ui` has no native side under jest, so its primitives are
 * mocked to plain host elements (`BecomeText`, `BecomeVStack`, …) that carry
 * the same props through. `expo-widgets` itself is never imported here — only
 * the layout component.
 */
import type { ReactElement, ReactNode } from "react";

jest.mock("@expo/ui/swift-ui", () => {
  const React = jest.requireActual("react");
  const host = (name: string) =>
    function MockedHost({ children, ...props }: { children?: ReactNode }) {
      return React.createElement(name, props, children);
    };
  return {
    Text: host("BecomeText"),
    VStack: host("BecomeVStack"),
    HStack: host("BecomeHStack"),
    Spacer: host("BecomeSpacer"),
    ProgressView: host("BecomeProgressView"),
    Link: ({
      destination,
      children,
    }: {
      destination: string;
      children?: ReactNode;
    }) => React.createElement("BecomeLink", { destination }, children),
  };
});

jest.mock(
  "@expo/ui/swift-ui/modifiers",
  () => ({
    widgetURL: (url: string) => ({ $type: "widgetURL", url }),
    foregroundStyle: (style: unknown) => ({ $type: "foregroundStyle", style }),
    tint: (tintValue: unknown) => ({ $type: "tint", tint: tintValue }),
  }),
  { virtual: true },
);

import { isValidElement } from "react";
import { BecomeWidget } from "@/lib/widgets/ios/BecomeWidget";
import { IOS_WIDGET_SIGN_IN_PROMPT } from "@/lib/widgets/iosTimeline";
import type { IosWidgetProps } from "@/lib/widgets/iosTimeline";

interface FlatNode {
  name: string;
  props: Record<string, unknown>;
}

function flatten(node: ReactNode, out: FlatNode[] = []): FlatNode[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (!isValidElement(node)) {
    // A bare string/number child of a host element (e.g. `<Text>12</Text>`
    // under the mock) — record it as text on the current parent below.
    if (typeof node === "string" || typeof node === "number") {
      out.push({ name: "#text", props: { text: String(node) } });
    }
    return out;
  }
  const element = node as ReactElement<{
    children?: ReactNode;
    [key: string]: unknown;
  }>;
  const type = element.type;
  if (typeof type === "function") {
    const rendered = (type as (props: unknown) => ReactNode)(element.props);
    return flatten(rendered, out);
  }
  const { children, ...props } = element.props ?? {};
  out.push({ name: String(type), props: props as Record<string, unknown> });
  flatten(children as ReactNode, out);
  return out;
}

function nodesOf(element: ReactElement): FlatNode[] {
  return flatten(element);
}

function findText(nodes: FlatNode[], text: string): FlatNode | undefined {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node?.name !== "BecomeText") continue;
    const next = nodes[i + 1];
    if (next?.name === "#text" && String(next.props.text ?? "") === text) {
      return node;
    }
  }
  return undefined;
}

function textsOf(element: ReactElement): string[] {
  const nodes = nodesOf(element);
  const out: string[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node?.name !== "BecomeText") continue;
    const next = nodes[i + 1];
    out.push(next?.name === "#text" ? String(next.props.text ?? "") : "");
  }
  return out;
}

function signedInProps(
  over: Partial<Extract<IosWidgetProps, { signedIn: true }>> = {},
): IosWidgetProps {
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
  };
}

describe("BecomeWidget signed in", () => {
  it("draws the server's title, headline + unit, and caption, unchanged", () => {
    const texts = textsOf(<BecomeWidget {...signedInProps()} />);
    expect(texts).toEqual(["Streak", "12", "days", "2 days to 14"]);
  });

  it("draws a headline that is a word, not a number, just as happily", () => {
    const texts = textsOf(
      <BecomeWidget
        {...signedInProps({
          title: "Mind",
          headline: "Resting",
          headlineUnit: null,
          caption: "Chapter 2 · Momentum · 3/7",
          state: "none",
          progress: 0.42,
          url: "become://dashboard/mind",
        })}
      />,
    );
    expect(texts).toEqual(["Mind", "Resting", "Chapter 2 · Momentum · 3/7"]);
  });

  it("draws the bar when progress is not null, and no bar when it is null", () => {
    const withBar = nodesOf(<BecomeWidget {...signedInProps()} />);
    expect(
      withBar.filter((n) => n.name === "BecomeProgressView"),
    ).toHaveLength(1);
    expect(
      withBar.find((n) => n.name === "BecomeProgressView")?.props.value,
    ).toBe(0.85);

    const withoutBar = nodesOf(
      <BecomeWidget {...signedInProps({ progress: null })} />,
    );
    expect(
      withoutBar.filter((n) => n.name === "BecomeProgressView"),
    ).toHaveLength(0);
  });

  it("tints the headline by state — at-risk warns, none dims", () => {
    // `foregroundStyle` normalises a bare colour into `{ type: 'color',
    // color }` on the native side; assert the colour it carries, not the
    // wrapper shape.
    const tintOf = (nodes: FlatNode[], text: string): unknown => {
      const modifiers = (findText(nodes, text)?.props.modifiers ?? []) as {
        $type?: string;
        style?: unknown;
      }[];
      const fg = modifiers.find((m) => m.$type === "foregroundStyle");
      const style = fg?.style as { color?: unknown } | string | undefined;
      return typeof style === "object" && style !== null && "color" in style
        ? style.color
        : style;
    };
    const atRisk = nodesOf(
      <BecomeWidget {...signedInProps({ state: "at-risk" })} />,
    );
    expect(tintOf(atRisk, "12")).toBe("orange");

    const none = nodesOf(<BecomeWidget {...signedInProps({ state: "none" })} />);
    expect(tintOf(none, "12")).toBe("secondary");

    const done = nodesOf(<BecomeWidget {...signedInProps({ state: "done" })} />);
    expect(tintOf(done, "12")).toBe("primary");

    const todo = nodesOf(<BecomeWidget {...signedInProps({ state: "todo" })} />);
    expect(tintOf(todo, "12")).toBe("primary");
  });

  it("is one tap target: a Link to props.url plus the widgetURL modifier", () => {
    const nodes = nodesOf(<BecomeWidget {...signedInProps()} />);
    const links = nodes.filter((n) => n.name === "BecomeLink");
    expect(links).toHaveLength(1);
    expect(links[0]?.props.destination).toBe("become://dashboard/streaks");
    const stacks = nodes.filter((n) => n.name === "BecomeVStack");
    expect(stacks).toHaveLength(1);
    expect(stacks[0]?.props.modifiers).toEqual([
      { $type: "widgetURL", url: "become://dashboard/streaks" },
    ]);
  });
});

describe("BecomeWidget signed out", () => {
  const signedOut: IosWidgetProps = {
    signedIn: false,
    title: "Become · Streak",
    prompt: IOS_WIDGET_SIGN_IN_PROMPT,
    url: "become://login",
  };

  it("shows the prompt and never a number", () => {
    const texts = textsOf(<BecomeWidget {...signedOut} />);
    expect(texts).toEqual(["Become · Streak", IOS_WIDGET_SIGN_IN_PROMPT]);
    expect(texts.join(" ")).not.toMatch(/\d/);
  });

  it("taps to the sign-in screen", () => {
    const nodes = nodesOf(<BecomeWidget {...signedOut} />);
    const links = nodes.filter((n) => n.name === "BecomeLink");
    expect(links).toHaveLength(1);
    expect(links[0]?.props.destination).toBe("become://login");
    const stacks = nodes.filter((n) => n.name === "BecomeVStack");
    expect(stacks[0]?.props.modifiers).toEqual([
      { $type: "widgetURL", url: "become://login" },
    ]);
  });
});
