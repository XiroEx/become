/**
 * THE FLOATING GLASS BAR'S GEOMETRY, IN ONE PLACE (NP-351).
 *
 * The bar is no longer an edge-attached strip that the navigator reserves
 * layout space for: `components/navigation/GlassTabBar.tsx` renders it
 * ABSOLUTELY, as a detached capsule floating over the scene, so content
 * scrolls UNDER it and the blur has something to blur. Nothing is reserved
 * for it, which means every screen inside `(tabs)` has to reserve the space
 * itself — and a number typed into five different `contentContainerStyle`s is
 * five chances to leave the last row of a list under the bar.
 *
 * So the numbers live here, once, and the bar and the screens read the same
 * ones. The web's bar is the reference
 * (`webapp/components/BottomNav.tsx`: `bottom: calc(env(safe-area-inset-bottom)
 * + 10px)`, a `rounded-full` pill with `px-3 py-1.5` around 48pt buttons).
 */
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The capsule's own height, in points. 56 clears the 44pt touch target. */
export const TAB_BAR_HEIGHT = 56;

/**
 * The gap between the bottom safe area and the capsule — the web's
 * `calc(env(safe-area-inset-bottom, 0px) + 10px)`.
 */
export const TAB_BAR_GAP = 10;

/** How far the capsule is inset from the left and right screen edges. */
export const TAB_BAR_SIDE_INSET = 16;

/**
 * The smallest bottom offset the capsule ever takes. A phone with no home
 * indicator (and an Android device on three-button navigation) reports
 * `insets.bottom === 0`, and a pill sitting 10pt off the glass looks dropped.
 */
export const TAB_BAR_MIN_BOTTOM = 8;

/** Breathing room between the last pixel of content and the capsule. */
export const TAB_BAR_CONTENT_GAP = 12;

/** The capsule's `bottom` offset for a given bottom safe-area inset. */
export function tabBarBottomOffset(safeAreaBottom: number): number {
  return Math.max(safeAreaBottom, TAB_BAR_MIN_BOTTOM) + TAB_BAR_GAP;
}

/**
 * The capsule's whole footprint measured from the bottom of the SCREEN, which
 * is what a view that is not already safe-area inset has to clear.
 */
export function tabBarScreenInset(safeAreaBottom: number): number {
  return (
    tabBarBottomOffset(safeAreaBottom) + TAB_BAR_HEIGHT + TAB_BAR_CONTENT_GAP
  );
}

/**
 * `tabBarScreenInset` for the phone this is running on. Used by `TabStack` as
 * the bottom padding of every PUSHED screen's container (`contentStyle`): those
 * screens are the long tail — a program's detail, Nutrition Goals, the recipe
 * editor — and they are not getting a hand-typed number each. The tab ROOTS
 * opt out of it and pad their own scroll content with `TAB_BAR_CONTENT_INSET`
 * instead, so the five screens the bar actually lives on have content passing
 * under the glass.
 */
export function useTabBarScreenInset(): number {
  const insets = useSafeAreaInsets();
  return tabBarScreenInset(insets.bottom);
}

/**
 * WHAT A TAB SCREEN RESERVES AT THE BOTTOM OF ITS SCROLL CONTENT.
 *
 * Deliberately a CONSTANT and not a hook on `useSafeAreaInsets()`: every tab
 * root already sits inside `<SafeAreaView edges={["top", "bottom"]}>`, so the
 * scroll view's own bottom edge is already the top of the safe area, and the
 * only thing left to clear is the capsule plus its gap. Computed from the
 * worst case (`TAB_BAR_MIN_BOTTOM`, a device with no home indicator) so the
 * one number is always enough rather than sometimes 8 points short.
 */
export const TAB_BAR_CONTENT_INSET =
  TAB_BAR_MIN_BOTTOM + TAB_BAR_GAP + TAB_BAR_HEIGHT + TAB_BAR_CONTENT_GAP;
