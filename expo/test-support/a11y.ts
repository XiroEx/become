import { StyleSheet } from "react-native";
import type { ReactTestInstance } from "react-test-renderer";
import type { ViewStyle } from "react-native";
import { MIN_TOUCH_TARGET } from "@/lib/a11y/touchTarget";

/**
 * THE ACCESSIBILITY TREE, AS A SCREEN READER WOULD WALK IT.
 *
 * Helpers shared by `__tests__/accessibility.test.tsx`. They read the RENDERED
 * tree rather than the source, because "every interactive element has a role and
 * a label" is a fact about what a screen produces, not about what a file
 * contains — a `<Pressable>` with a role five lines above it in the same file
 * says nothing about the one below it.
 *
 * Only HOST nodes are inspected (`typeof type === "string"`: the View, Text and
 * TextInput React Native actually renders). A composite `<Button>` also carries
 * an `onPress` prop and would double every count.
 */

/** Roles whose owner a screen reader offers to activate. */
export const INTERACTIVE_ROLES: readonly string[] = [
  "button",
  "link",
  "switch",
  "checkbox",
  "radio",
  "tab",
  "menuitem",
  "imagebutton",
  "togglebutton",
  "combobox",
  "slider",
  "spinbutton",
  "searchbox",
];

export function isHost(node: ReactTestInstance): boolean {
  return typeof node.type === "string";
}

/** The host element's name ("View", "Text", "TextInput"), or "" for composites. */
export function hostName(node: ReactTestInstance): string {
  return typeof node.type === "string" ? node.type : "";
}

/** True when the node is hidden from assistive technology on purpose. */
export function isHiddenFromAccessibility(node: ReactTestInstance): boolean {
  const props = node.props as {
    accessible?: boolean;
    accessibilityRole?: string;
    accessibilityElementsHidden?: boolean;
    importantForAccessibility?: string;
  };
  return (
    props.accessible === false ||
    props.accessibilityElementsHidden === true ||
    props.importantForAccessibility === "no" ||
    props.importantForAccessibility === "no-hide-descendants" ||
    // "none" is React Native's own opt-out: the Modal card swallows taps so
    // they do not reach the backdrop, and is not a control.
    props.accessibilityRole === "none"
  );
}

/**
 * Everything on the screen that responds to a touch. A Pressable's host View is
 * recognised by `onStartShouldSetResponder` (Pressability wires it), a field by
 * being a TextInput.
 */
export function interactiveNodes(
  root: ReactTestInstance,
): ReactTestInstance[] {
  return root
    .findAll((node) => {
      if (!isHost(node)) return false;
      const props = node.props as { onStartShouldSetResponder?: unknown };
      return (
        hostName(node) === "TextInput" ||
        typeof props.onStartShouldSetResponder === "function"
      );
    })
    .filter((node) => !isHiddenFromAccessibility(node));
}

/** Every rendered `<Text>` with words in it. */
export function textNodes(root: ReactTestInstance): ReactTestInstance[] {
  return root.findAll(
    (node) => hostName(node) === "Text" && spokenText(node) !== "",
  );
}

/** The words a node reads out, its children included. */
export function spokenText(node: ReactTestInstance): string {
  const parts: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") parts.push(value);
    else if (typeof value === "number") parts.push(String(value));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (
      value &&
      typeof value === "object" &&
      "props" in (value as { props?: { children?: unknown } })
    ) {
      walk((value as { props?: { children?: unknown } }).props?.children);
    }
  };
  walk((node.props as { children?: unknown }).children);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** The accessible NAME: the label, or the words inside when there is none. */
export function accessibleName(node: ReactTestInstance): string {
  const label = (node.props as { accessibilityLabel?: string })
    .accessibilityLabel;
  if (typeof label === "string" && label.trim() !== "") return label.trim();
  return spokenText(node);
}

/** A node's own style, flattened. `className` is not resolved in jest. */
export function styleOf(node: ReactTestInstance): ViewStyle {
  return (StyleSheet.flatten(
    (node.props as { style?: unknown }).style as never,
  ) ?? {}) as ViewStyle;
}

export interface HitSlopish {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

/**
 * Whether a node guarantees a 44 x 44 target, and why not when it does not.
 *
 * A guarantee means a NUMBER in the props: `minWidth`/`minHeight` (or an
 * explicit width/height that is already big enough), or `hitSlop` making up the
 * difference from an explicit size. NativeWind padding cannot count — the
 * className is never resolved in jest, and padding around a 20-point icon is
 * exactly how the settings gear came to be a 36-point target.
 */
export function touchTargetShortfall(node: ReactTestInstance): string | null {
  const style = styleOf(node);
  const slop = ((node.props as { hitSlop?: HitSlopish | number }).hitSlop ??
    {}) as HitSlopish | number;
  const slopOf = (a: "top" | "bottom" | "left" | "right"): number =>
    typeof slop === "number" ? slop : (slop[a] ?? 0);

  const height = numberOr(style.minHeight, numberOr(style.height, 0));
  const width = numberOr(style.minWidth, numberOr(style.width, 0));
  const effectiveHeight = height + slopOf("top") + slopOf("bottom");
  const effectiveWidth = width + slopOf("left") + slopOf("right");

  const short: string[] = [];
  if (effectiveHeight < MIN_TOUCH_TARGET) {
    short.push(`height ${effectiveHeight} < ${MIN_TOUCH_TARGET}`);
  }
  if (effectiveWidth < MIN_TOUCH_TARGET) {
    short.push(`width ${effectiveWidth} < ${MIN_TOUCH_TARGET}`);
  }
  return short.length > 0 ? short.join(", ") : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

/** Host nodes laid out as a ROW by an inline style. */
export function rowContainers(root: ReactTestInstance): ReactTestInstance[] {
  return root.findAll(
    (node) => isHost(node) && styleOf(node).flexDirection === "row",
  );
}

/**
 * The children of a row AS AUTHORED. React Native's `<View>` is a component, so
 * the children of the host View a row renders to are COMPOSITE instances — and
 * they are the ones carrying the `style` the screen wrote. Filtering to host
 * nodes here is how the first version of this check passed a row whose child had
 * no `flex` at all.
 */
export function rowChildren(row: ReactTestInstance): ReactTestInstance[] {
  return row.children.filter(
    (child): child is ReactTestInstance => typeof child !== "string",
  );
}

/** Can this child give up width — wrap — instead of pushing its siblings out? */
export function isShrinkable(node: ReactTestInstance): boolean {
  const style = styleOf(node);
  const flex = numberOr(style.flex, 0);
  const shrink = numberOr(style.flexShrink, 0);
  return flex >= 1 || shrink >= 1;
}

/** A node's path in the tree, for a failure message that names the element. */
export function describeNode(node: ReactTestInstance): string {
  const props = node.props as {
    testID?: string;
    accessibilityRole?: string;
    accessibilityLabel?: string;
  };
  const bits = [String(node.type)];
  if (props.testID) bits.push(`testID=${props.testID}`);
  if (props.accessibilityRole) bits.push(`role=${props.accessibilityRole}`);
  if (props.accessibilityLabel) bits.push(`label="${props.accessibilityLabel}"`);
  const words = spokenText(node);
  if (words) bits.push(`text="${words.slice(0, 40)}"`);
  return bits.join(" ");
}
