/**
 * READING AN ANDROID WIDGET TREE IN A TEST.
 *
 * `react-native-android-widget`'s elements are not React Native components:
 * `TextWidget` returns null, `FlexWidget` returns its children, and the real
 * rendering happens on the Java side, which turns the tree into `RemoteViews`.
 * So `@testing-library/react-native` has nothing to render and nothing to query
 * — `render(<StreakWidget/>)` would report an empty tree and pass whatever the
 * widget actually draws.
 *
 * What IS assertable is the element tree itself, which is exactly what the
 * library serialises and hands to the native side. This walks it and flattens it
 * into plain nodes, so a test can ask the questions a member would: what does
 * this tile SAY, where does tapping it go, what colour is the number.
 *
 * Node names come from the library's own `__name__` (the Java widget class it
 * maps to: `LinearLayoutWidget`, `TextWidget`), falling back to the function
 * name, so the flattened tree names the same things the native side does.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";

export interface WidgetNode {
  name: string;
  props: Record<string, unknown>;
  children: WidgetNode[];
}

/**
 * Expand a custom component down to a library primitive, the same way
 * `buildWidgetTree` does on the real path: `while (!type.__name__) node =
 * type(props)`. That is also why a widget component may not use hooks — the
 * library calls it as a plain function — so a test that walked the tree WITHOUT
 * expanding would never notice a component that cannot be expanded at all.
 */
function expand(element: ReactElement): ReactElement | null {
  let current: ReactElement = element;
  for (let depth = 0; depth < 20; depth += 1) {
    const type = current.type as { __name__?: string } | string;
    if (typeof type === "string" || type.__name__) return current;
    const next = (current.type as (props: unknown) => ReactNode)(current.props);
    if (!isValidElement(next)) return null;
    current = next;
  }
  throw new Error("widget tree nested more than 20 components deep");
}

function nameOf(type: unknown): string {
  if (typeof type === "function") {
    const named = type as { __name__?: string; name?: string };
    return named.__name__ ?? named.name ?? "anonymous";
  }
  return String(type);
}

/** Flatten a widget element (and its children) into plain nodes. */
export function widgetTree(node: ReactNode): WidgetNode[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap((child) => widgetTree(child));
  if (!isValidElement(node)) return [];

  const element = expand(node);
  if (!element) return [];

  const props = { ...(element.props as Record<string, unknown>) };
  const children = "children" in props ? props.children : undefined;
  delete props.children;

  return [
    {
      name: nameOf(element.type),
      props,
      children: widgetTree(children as ReactNode),
    },
  ];
}

/** Depth-first walk of every node in a tree. */
export function widgetNodes(node: ReactNode): WidgetNode[] {
  const out: WidgetNode[] = [];
  const visit = (nodes: WidgetNode[]): void => {
    for (const n of nodes) {
      out.push(n);
      visit(n.children);
    }
  };
  visit(widgetTree(node));
  return out;
}

/** Every string the tile draws, in order. */
export function widgetTexts(node: ReactNode): string[] {
  return widgetNodes(node)
    .filter((n) => n.name === "TextWidget")
    .map((n) => String(n.props.text ?? ""));
}

export interface WidgetTap {
  clickAction: string;
  uri: string | null;
}

/** Every tap target on the tile: what it does and where it goes. */
export function widgetTaps(node: ReactNode): WidgetTap[] {
  return widgetNodes(node)
    .filter((n) => typeof n.props.clickAction === "string")
    .map((n) => {
      const data = (n.props.clickActionData ?? {}) as { uri?: unknown };
      return {
        clickAction: String(n.props.clickAction),
        uri: typeof data.uri === "string" ? data.uri : null,
      };
    });
}

/** The style of the first node whose text matches, for a colour assertion. */
export function styleOfText(
  node: ReactNode,
  text: string,
): Record<string, unknown> {
  const hit = widgetNodes(node).find(
    (n) => n.name === "TextWidget" && n.props.text === text,
  );
  return (hit?.props.style ?? {}) as Record<string, unknown>;
}
