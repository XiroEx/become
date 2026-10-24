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

/**
 * THE WEB'S CAPSULE, MEASURED (`webapp/components/BottomNav.tsx`).
 *
 * The `<ul>` is `gap-2 px-3 py-1.5` around `h-12 w-14` items with a 1px
 * `border`, and Tailwind is border-box, so it is content-sized: five 56pt
 * buttons, four 8pt gaps, 12pt of side padding and 6pt of top and bottom
 * padding, plus the border. It is NOT stretched to the screen edges.
 */
export const TAB_BAR_ITEM_WIDTH = 56;
export const TAB_BAR_ITEM_HEIGHT = 48;
export const TAB_BAR_ITEM_GAP = 8;
export const TAB_BAR_PADDING_X = 12;
export const TAB_BAR_PADDING_Y = 6;
export const TAB_BAR_BORDER_WIDTH = 1;

/**
 * The capsule's own height, in points: 48 + 2 × 6 + 2 × 1 = 62, the web's.
 * (It was 56 before the capsule took the web's numbers.)
 */
export const TAB_BAR_HEIGHT =
  TAB_BAR_ITEM_HEIGHT + TAB_BAR_PADDING_Y * 2 + TAB_BAR_BORDER_WIDTH * 2;

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
 *
 * `useSafeAreaInsets` throws without a `SafeAreaProvider` above it in the
 * tree; the real app always has one (`app/_layout.tsx`), but the many
 * existing screen tests mount a tab screen bare (`BottomSheet`'s own
 * `useSafeAreaInsetsOrZero`, NP-321, is the precedent). Falling back to zero
 * there keeps every one of those a no-op while fixing the real device.
 */
function useSafeAreaInsetsOrZero() {
  try {
    return useSafeAreaInsets();
  } catch {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

export function useTabBarScreenInset(): number {
  const insets = useSafeAreaInsetsOrZero();
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
