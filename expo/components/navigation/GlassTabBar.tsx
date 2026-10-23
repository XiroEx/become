import { memo, useCallback, useEffect, useRef } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type {
  BottomTabBarProps,
  BottomTabNavigationOptions,
} from "expo-router/tabs";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { MIN_TOUCH_TARGET } from "@/lib/a11y/touchTarget";
import { usePressed } from "@/lib/a11y/usePressed";
import { Text } from "@/components/Text";
import { lightHaptic } from "@/lib/feedback/haptics";
import { isImmersiveNavigationState } from "@/lib/navigation/immersiveRoutes";
import { subscribeTabBarCondensed } from "@/lib/navigation/tabBarCondense";
import {
  TAB_BAR_BORDER_WIDTH,
  TAB_BAR_HEIGHT,
  TAB_BAR_ITEM_GAP,
  TAB_BAR_ITEM_HEIGHT,
  TAB_BAR_ITEM_WIDTH,
  TAB_BAR_PADDING_X,
  TAB_BAR_PADDING_Y,
  TAB_BAR_SIDE_INSET,
  tabBarBottomOffset,
} from "@/lib/navigation/tabBarInset";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * THE LIQUID-GLASS BOTTOM BAR (NP-351).
 *
 * Jon and George on the 0.1.0 TestFlight build: "that bottom bar is so shit,
 * Home needs to be in the middle" / "where's our glass bottom nav bar?". What
 * shipped was bottom-tabs' default strip — edge-attached, fully opaque, a
 * hairline on top — while the web has had a detached frosted capsule since
 * `webapp/components/BottomNav.tsx`:
 *
 *   `fixed inset-x-0 flex justify-center`, `bottom: calc(env(safe-area-inset-
 *   bottom, 0px) + 10px)`, and inside it a `rounded-full border
 *   border-zinc-200/70 bg-white/80 backdrop-blur-xl shadow-lg
 *   dark:border-white/10 dark:bg-zinc-900/80` pill of icon-only buttons, the
 *   active one wearing `bg-zinc-900/10 dark:bg-white/15`.
 *
 * This is that pill, natively, and the glass is the platform's own material
 * rather than a painted approximation:
 *
 *   • iOS 26+ — `GlassView` from `expo-glass-effect`, which is a real
 *     `UIVisualEffectView` carrying `UIGlassEffect`: Apple's Liquid Glass,
 *     with its specular edge and its live refraction of what scrolls under it.
 *     `isLiquidGlassAvailable()` is the OS check.
 *   • Older iOS — `BlurView` with `tint="systemChromeMaterial"`, the system
 *     chrome material that adapts to light and dark on its own.
 *   • Android — the same `BlurView` with `experimentalBlurMethod="dimezisBlurView"`
 *     (there is no system chrome material), over a translucent `card` wash so
 *     a device where that blur does not land still reads as a translucent
 *     floating surface with elevation rather than a transparent hole.
 *
 * WHY NOT `expo-router/unstable-native-tabs`. `NativeTabs` renders a real
 * `UITabBar` and therefore gets Liquid Glass for free — but a `UITabBar` is
 * edge-attached and full-width, it draws SF Symbols rather than the web's
 * lucide icons, and on Android it is a Material 3 bottom bar. It cannot be the
 * web's detached pill on either platform, and the pill is what was asked for
 * ("match the web pill: floating, rounded-full, blurred/translucent, safe-area
 * inset at the bottom"). `GlassView` gives us the same iOS 26 material inside
 * a shape we control, so this stays one bar on both platforms. If v2 decides
 * the native tab bar is worth losing the pill for, `NativeTabs` is the swap.
 *
 * WHAT IT KEEPS, because a custom `tabBar` is a chance to lose all of it:
 *   • the navigator — this is still the JS `Tabs` navigator, so every tab keeps
 *     its own `TabStack` and every detail route is still a push inside its tab;
 *   • `tabPress`, emitted exactly as bottom-tabs' own bar emits it
 *     (`canPreventDefault`), so react-navigation's `useScrollToTop` still
 *     scrolls a focused tab to the top when its button is pressed again, and a
 *     screen can still `preventDefault()` a tab change;
 *   • the VoiceOver name the navigator used to compose — "Home, tab, 3 of 7" —
 *     which is now set on every platform rather than iOS only, because an
 *     icon-only button has no text for a screen reader to fall back to;
 *   • a light haptic on every press (NP-098's `lightHaptic`), which the default
 *     bar never had.
 *
 * THE WEB'S CAPSULE AND ITS MOTION:
 *   • the capsule is content-sized and centred with the web's numbers
 *     (`lib/navigation/tabBarInset.ts`): `gap-2 px-3 py-1.5`, `h-12 w-14`
 *     buttons, a 1px border, `bg-white/80 dark:bg-zinc-900/80`, and the shadow
 *     at the web's `black/10` / `dark:black/40`;
 *   • the active pill is ONE absolutely positioned view that slides between
 *     tabs the way framer's `layoutId="bottom-nav-active-pill"` does:
 *     translateX + width as shared values, `withSpring` at the web's own
 *     `stiffness: 500, damping: 35`, on the UI thread. Item positions are
 *     measured with `onLayout`; a tab change writes two shared values and
 *     re-renders only the two items whose `focused` flipped (items are memoised);
 *   • Reduce Motion jumps the pill instead of springing it;
 *   • the capsule condenses to 0.88 while a tab root scrolls and grows back
 *     200ms after, over 300ms ease-out from centre-bottom — the web's
 *     `condensed` state, and its only "hide/show"
 *     (`lib/navigation/tabBarCondense.ts` carries the signal);
 *   • `options.tabBarBadge` draws the web's green count badge.
 */

/**
 * The web's `h-[22px] w-[22px]` icons. The stroke WEIGHT is the icon's own
 * business: the navigator's `tabBarIcon` gets `focused` and draws the web's
 * `strokeWidth={active ? 2.4 : 2}` itself (`app/(app)/(tabs)/_layout.tsx`), so
 * this file never names a lucide component.
 */
const ICON_SIZE = 22;

/**
 * The web's active-pill transition, verbatim:
 * `{ type: 'spring', stiffness: 500, damping: 35 }`. Mass is 1 on both
 * engines, so the same numbers are the same curve — a touch under critical
 * damping, settling in about a quarter of a second.
 */
const PILL_SPRING = { stiffness: 500, damping: 35, mass: 1 } as const;

/** The web's `scale-[0.88]` while scrolling, over `duration-300 ease-out`. */
const CONDENSED_SCALE = 0.88;
const CONDENSE_MS = 300;
// Optional-chained: several shell tests mock reanimated with only the hooks they
// need, and a module-level `Easing.bezier` call would crash the whole tab bar
// at import there. Without it `withTiming` falls back to its default curve.
const EASE_OUT = Easing?.bezier?.(0, 0, 0.58, 1);

/** The web's badge: `h-4 min-w-[16px]`, `right-1 top-0.5`, `text-[10px]`. */
const BADGE_SIZE = 16;

interface ItemLayout {
  x: number;
  width: number;
}

/**
 * Is this screen in the tree but not on the bar? `href: null` is expo-router's
 * way of saying so, and what it actually does with it is set
 * `tabBarItemStyle: { display: "none" }` plus a `tabBarButton` that returns
 * null (`expo-router/build/layouts/TabsClient.js`). The default bar renders the
 * hidden button and lets the style collapse it; we skip it instead, and read
 * the same flag the navigator already set so `href: null` stays the one way to
 * hide a route.
 */
function isHiddenFromBar(options: BottomTabNavigationOptions): boolean {
  const style = StyleSheet.flatten(
    options.tabBarItemStyle as StyleProp<ViewStyle>,
  );
  return style?.display === "none";
}

/**
 * Does this build have Apple's Liquid Glass? `expo-glass-effect` memoises the
 * native read itself, so this does not cache on top of it — and it is wrapped
 * because the failure is catastrophic rather than cosmetic: on any platform
 * without the module `isLiquidGlassAvailable()` is a JS stub that answers
 * `false`, but a build somehow missing `ExpoGlassEffect` would throw out of
 * `requireNativeModule` and take the tab bar — the app's only navigation —
 * down with it.
 */
function hasLiquidGlass(): boolean {
  try {
    return Platform.OS === "ios" && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

interface GlassSurfaceProps {
  isDark: boolean;
  liquidGlass: boolean;
}

/**
 * The capsule's MATERIAL, and nothing else: the translucent wash the web paints
 * (`bg-white/80 dark:bg-zinc-900/80`) is on the capsule itself rather than
 * here, for two reasons. Android's `elevation` draws no shadow at all for a
 * view with a transparent background, and its blur reads whatever is behind the
 * BlurView — the capsule's own wash included — so one wash, on the parent,
 * serves both.
 */
function GlassSurface({ isDark, liquidGlass }: GlassSurfaceProps) {
  if (liquidGlass) {
    return (
      <GlassView
        testID="glass-tab-bar-surface"
        glassEffectStyle="regular"
        // The app's resolved scheme, not the window's: a subtree can force one
        // (`ForcedThemeMode`, NP-341) and the glass must not disagree with the
        // tokens the icons above it are drawn from.
        colorScheme={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    );
  }
  return (
    <BlurView
      testID="glass-tab-bar-surface"
      // The web's `backdrop-blur-xl`. iOS reads `tint` as a UIBlurEffect
      // style — `systemChromeMaterial` is the one UIKit uses for bars and it
      // follows light/dark itself; Android has no such material, so it is told
      // which one we are in.
      tint={Platform.OS === "ios" ? "systemChromeMaterial" : isDark ? "dark" : "light"}
      intensity={Platform.OS === "ios" ? 60 : 24}
      // Android's blur is opt-in and still experimental (RenderEffect below
      // API 31 cannot blur a view hierarchy at all), which is exactly why the
      // translucent wash underneath is not decoration.
      experimentalBlurMethod={
        Platform.OS === "android" ? "dimezisBlurView" : "none"
      }
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

interface GlassTabButtonProps {
  routeKey: string;
  routeName: string;
  focused: boolean;
  /** The web's `aria-label`/`title`: "Workout", "Home", … */
  label: string;
  /** "Home, tab, 3 of 7" — what a screen reader announces. */
  accessibilityLabel: string;
  icon: BottomTabNavigationOptions["tabBarIcon"];
  activeColor: ColorValue;
  inactiveColor: ColorValue;
  badge: number;
  badgeColor: string;
  badgeTextColor: string;
  testID: string;
  onPressTab: (key: string, name: string, focused: boolean) => void;
  onLongPressTab: (key: string) => void;
  onLayoutTab: (key: string, event: LayoutChangeEvent) => void;
}

/**
 * Memoised: every prop is a primitive or a reference that is stable across a
 * tab change, so switching tabs re-renders the item that lost focus and the
 * one that gained it, and none of the others.
 */
const GlassTabButton = memo(function GlassTabButton({
  routeKey,
  routeName,
  focused,
  label,
  accessibilityLabel,
  icon,
  activeColor,
  inactiveColor,
  badge,
  badgeColor,
  badgeTextColor,
  testID,
  onPressTab,
  onLongPressTab,
  onLayoutTab,
}: GlassTabButtonProps) {
  // The web's `whileTap={{ scale: 0.85 }}`, as opacity. NP-314: never a `style`
  // callback — on RN 0.86.3 a Pressable with a function `style` renders with
  // none of it applied on Android.
  const { pressed, onPressIn, onPressOut } = usePressed();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={
        badge > 0 ? `${accessibilityLabel}, ${badge} new` : accessibilityLabel
      }
      testID={testID}
      onPress={() => onPressTab(routeKey, routeName, focused)}
      onLongPress={() => onLongPressTab(routeKey)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onLayout={(event) => onLayoutTab(routeKey, event)}
      style={[styles.item, { opacity: pressed ? 0.6 : 1 }]}
    >
      {icon?.({
        focused,
        color: focused ? activeColor : inactiveColor,
        size: ICON_SIZE,
      })}
      {badge > 0 ? (
        <View
          testID={`glass-tab-badge-${label}`}
          style={[styles.badge, { backgroundColor: badgeColor }]}
          pointerEvents="none"
        >
          <Text style={[styles.badgeText, { color: badgeTextColor }]}>
            {badge > 99 ? "99+" : String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

/** `options.tabBarBadge` as a count; non-numeric or non-positive means none. */
function badgeCount(value: BottomTabNavigationOptions["tabBarBadge"]): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function GlassTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  const { colors, isDark, tint } = useThemeTokens();
  const liquidGlass = hasLiquidGlass();
  const reducedMotion = useReducedMotion();

  const emitPress = useCallback(
    (key: string, name: string, focused: boolean) => {
      // One light tap, then the navigator's own event — in that order, so the
      // phone answers the finger even when a screen prevents the change.
      lightHaptic();
      const event = navigation.emit({
        type: "tabPress",
        target: key,
        canPreventDefault: true,
      });
      // Identical to bottom-tabs' own bar: a press on the FOCUSED tab never
      // navigates, it only emits — that is what makes `useScrollToTop` (and a
      // re-press scrolling the tab to the top) work.
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(name);
      }
    },
    [navigation],
  );

  const emitLongPress = useCallback(
    (key: string) => navigation.emit({ type: "tabLongPress", target: key }),
    [navigation],
  );

  // THE SLIDING PILL. Three shared values and one ref of measurements; nothing
  // here is React state, so a tab change never re-renders for animation.
  const pillX = useSharedValue(0);
  const pillWidth = useSharedValue(TAB_BAR_ITEM_WIDTH);
  const pillShown = useSharedValue(0);
  const layouts = useRef<Record<string, ItemLayout>>({});
  const placed = useRef(false);

  const focusedRoute = state.routes[state.index];
  const focusedDescriptor = focusedRoute
    ? descriptors[focusedRoute.key]
    : undefined;
  // A focused route that is not a button (`chat`, `calendar`) has no pill.
  const focusedKey =
    focusedRoute && focusedDescriptor && !isHiddenFromBar(focusedDescriptor.options)
      ? focusedRoute.key
      : null;
  const focusedKeyRef = useRef<string | null>(null);

  const placePill = useCallback(
    (key: string | null, animate: boolean) => {
      if (key === null) {
        pillShown.set(0);
        placed.current = false;
        return;
      }
      const target = layouts.current[key];
      if (!target) return;
      pillShown.set(1);
      if (!animate || !placed.current) {
        // First placement (nothing to slide FROM) and Reduce Motion: a jump.
        pillX.set(target.x);
        pillWidth.set(target.width);
        placed.current = true;
        return;
      }
      pillX.set(withSpring(target.x, PILL_SPRING));
      pillWidth.set(withSpring(target.width, PILL_SPRING));
    },
    [pillShown, pillWidth, pillX],
  );

  useEffect(() => {
    focusedKeyRef.current = focusedKey;
    placePill(focusedKey, !reducedMotion);
  }, [focusedKey, reducedMotion, placePill]);

  const onLayoutTab = useCallback(
    (key: string, event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      const previous = layouts.current[key];
      if (previous && previous.x === x && previous.width === width) return;
      layouts.current[key] = { x, width };
      // A measurement is not a tab change: snap, never spring (the first
      // layout pass, a rotation, a Dynamic Type change).
      if (key === focusedKeyRef.current) placePill(key, false);
    },
    [placePill],
  );

  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillShown.value,
    width: pillWidth.value,
    transform: [{ translateX: pillX.value }],
  }));

  // THE WEB'S `condensed` STATE: 0 → 1 while a tab root scrolls. Driven by a
  // subscription, not by props, so a scroll event never re-renders the bar.
  const condense = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      condense.set(0);
      return undefined;
    }
    return subscribeTabBarCondensed((condensed) => {
      condense.set(
        withTiming(condensed ? 1 : 0, { duration: CONDENSE_MS, easing: EASE_OUT }),
      );
    });
  }, [condense, reducedMotion]);

  const condenseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - CONDENSED_SCALE) * condense.value }],
  }));

  /**
   * THE LIVE WORKOUT TAKES OVER THE WHOLE SCREEN (NP-381).
   *
   * The web's Live view is `fixed inset-0 z-100`: it covers the floating
   * BottomNav pill, because a set is logged with one thumb and the
   * `Complete Set →` button is where that thumb lands. Natively the live
   * screen is a push inside the Workout tab, so this capsule floated over
   * its CTA. Nothing imperative and nothing in the screen itself: the bar
   * reads the state the navigator already hands it and answers with no bar
   * while the deepest focused route is one of `IMMERSIVE_WORKOUT_ROUTES`
   * (`lib/navigation/immersiveRoutes.ts`), which is the same list `TabStack`
   * exempts from the reserved bottom band. Every hook above runs first, so
   * this is a render result and not a conditional hook.
   */
  if (isImmersiveNavigationState(state)) return null;

  return (
    <View
      testID="glass-tab-bar"
      style={[styles.container, { bottom: tabBarBottomOffset(insets.bottom) }]}
      // The bar is absolute and floats over the scene, so everything that is
      // not the capsule itself has to stay tappable.
      pointerEvents="box-none"
    >
      <Animated.View
        testID="glass-tab-bar-condense"
        style={[styles.condense, condenseStyle]}
        pointerEvents="box-none"
      >
        <View
          testID="glass-tab-bar-pill"
          style={[
            styles.pill,
            {
              // The web's `border-zinc-200/70 dark:border-white/10`: in dark
              // mode the hairline is a wash of the FOREGROUND, because the
              // `border` token (zinc-800) is invisible against a dark glass.
              borderColor: isDark ? tint("foreground", 0.1) : tint("border", 0.7),
              // The web's `bg-white/80 dark:bg-zinc-900/80` — and NONE of it
              // under Liquid Glass, which refracts what is behind it and would
              // be flattened by a wash.
              backgroundColor: tint("card", liquidGlass ? 0 : 0.8),
              // The web's `shadow-black/10 dark:shadow-black/40`.
              shadowOpacity: isDark ? 0.4 : 0.1,
            },
          ]}
        >
          <GlassSurface isDark={isDark} liquidGlass={liquidGlass} />
          <View role="tablist" style={styles.row}>
            <Animated.View
              testID="glass-tab-active-pill"
              // The web's `bg-zinc-900/10 dark:bg-white/15`, one view for the
              // whole bar.
              style={[
                styles.activePill,
                { backgroundColor: tint("foreground", isDark ? 0.15 : 0.1) },
                pillStyle,
              ]}
              pointerEvents="none"
            />
            {state.routes.map((route, index) => {
              const descriptor = descriptors[route.key];
              if (!descriptor) return null;
              const { options } = descriptor;
              if (isHiddenFromBar(options)) return null;

              const label = options.title ?? route.name;
              return (
                <GlassTabButton
                  key={route.key}
                  routeKey={route.key}
                  routeName={route.name}
                  focused={index === state.index}
                  label={label}
                  // The name the navigator used to compose for us, kept to the
                  // letter (`BottomTabBar.js`: `${label}, tab, ${index + 1} of
                  // ${routes.length}`) — hidden routes included in the total,
                  // because they are screens of this navigator even though
                  // they are not buttons. Set on Android too, where
                  // react-navigation leaves it undefined and leans on the
                  // visible label: these buttons have no visible label.
                  accessibilityLabel={`${label}, tab, ${index + 1} of ${state.routes.length}`}
                  icon={options.tabBarIcon}
                  activeColor={options.tabBarActiveTintColor ?? colors.primary}
                  inactiveColor={
                    options.tabBarInactiveTintColor ?? colors["muted-foreground"]
                  }
                  badge={badgeCount(options.tabBarBadge)}
                  // The web's `bg-green-500 text-white`; `mind-green` is
                  // green-500 in both modes and `brand-foreground` is white in
                  // both, so neither flips the way `primary` does.
                  badgeColor={colors["mind-green"]}
                  badgeTextColor={colors["brand-foreground"]}
                  testID={options.tabBarButtonTestID ?? `glass-tab-${route.name}`}
                  onPressTab={emitPress}
                  onLongPressTab={emitLongPress}
                  onLayoutTab={onLayoutTab}
                />
              );
            })}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * The `tabBar` prop, as a module-level function. It has to return an ELEMENT
 * and not be the component itself: `BottomTabView` CALLS `tabBar(props)` inside
 * a context consumer's render, so a component used directly there would be
 * running its hooks outside any component of its own.
 */
export function renderGlassTabBar(props: BottomTabBarProps) {
  return <GlassTabBar {...props} />;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: TAB_BAR_SIDE_INSET,
    right: TAB_BAR_SIDE_INSET,
    // The web's `flex justify-center`: the capsule is content-sized and
    // centred, not stretched to the edges.
    alignItems: "center",
  },
  condense: {
    maxWidth: "100%",
    // The web's `transformOrigin: 'center bottom'`.
    transformOrigin: "50% 100%",
  },
  pill: {
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    borderWidth: TAB_BAR_BORDER_WIDTH,
    // Clips the material to the capsule. The elevation/shadow below is drawn
    // from the layer's outline, so it is not clipped with it.
    overflow: "hidden",
    // The web's `shadow-lg`. No `shadowColor`: React Native's default is
    // already black, and a literal would be a colour value outside
    // `lib/theme/tokens.ts` (NP-123). The per-scheme opacity is set inline.
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 10,
    elevation: 8,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: TAB_BAR_PADDING_X,
    paddingVertical: TAB_BAR_PADDING_Y,
    gap: TAB_BAR_ITEM_GAP,
  },
  item: {
    // `h-12 w-14`. It may give a little on a phone too narrow for 338pt, but
    // never below the touch target.
    width: TAB_BAR_ITEM_WIDTH,
    flexShrink: 1,
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    height: TAB_BAR_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: TAB_BAR_ITEM_HEIGHT / 2,
  },
  activePill: {
    position: "absolute",
    left: 0,
    top: TAB_BAR_PADDING_Y,
    height: TAB_BAR_ITEM_HEIGHT,
    borderRadius: TAB_BAR_ITEM_HEIGHT / 2,
  },
  badge: {
    position: "absolute",
    right: 4,
    top: 2,
    minWidth: BADGE_SIZE,
    minHeight: BADGE_SIZE,
    paddingHorizontal: 4,
    borderRadius: BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
  },
});
