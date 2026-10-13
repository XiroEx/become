import { useCallback } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type {
  BottomTabBarProps,
  BottomTabNavigationOptions,
} from "expo-router/tabs";
import { MIN_TOUCH_TARGET } from "@/lib/a11y/touchTarget";
import { usePressed } from "@/lib/a11y/usePressed";
import { lightHaptic } from "@/lib/feedback/haptics";
import {
  TAB_BAR_HEIGHT,
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
 */

/**
 * The web's `h-[22px] w-[22px]` icons. The stroke WEIGHT is the icon's own
 * business: the navigator's `tabBarIcon` gets `focused` and draws the web's
 * `strokeWidth={active ? 2.4 : 2}` itself (`app/(app)/(tabs)/_layout.tsx`), so
 * this file never names a lucide component.
 */
const ICON_SIZE = 22;

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
  focused: boolean;
  /** The web's `aria-label`/`title`: "Workout", "Home", … */
  label: string;
  /** "Home, tab, 3 of 7" — what a screen reader announces. */
  accessibilityLabel: string;
  icon: BottomTabNavigationOptions["tabBarIcon"];
  activeColor: ColorValue;
  inactiveColor: ColorValue;
  activePillColor: string;
  testID: string;
  onPress: () => void;
  onLongPress: () => void;
}

function GlassTabButton({
  focused,
  label,
  accessibilityLabel,
  icon,
  activeColor,
  inactiveColor,
  activePillColor,
  testID,
  onPress,
  onLongPress,
}: GlassTabButtonProps) {
  // The web's `whileTap={{ scale: 0.85 }}`, as opacity. NP-314: never a `style`
  // callback — on RN 0.86.3 a Pressable with a function `style` renders with
  // none of it applied on Android.
  const { pressed, onPressIn, onPressOut } = usePressed();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.item, { opacity: pressed ? 0.6 : 1 }]}
    >
      {focused ? (
        <View
          testID={`glass-tab-active-pill-${label}`}
          style={[styles.activePill, { backgroundColor: activePillColor }]}
          pointerEvents="none"
        />
      ) : null}
      {icon?.({
        focused,
        color: focused ? activeColor : inactiveColor,
        size: ICON_SIZE,
      })}
    </Pressable>
  );
}

export function GlassTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  const { colors, isDark, tint } = useThemeTokens();
  const liquidGlass = hasLiquidGlass();

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

  return (
    <View
      testID="glass-tab-bar"
      style={[styles.container, { bottom: tabBarBottomOffset(insets.bottom) }]}
      // The bar is absolute and floats over the scene, so everything that is
      // not the capsule itself has to stay tappable.
      pointerEvents="box-none"
    >
      <View
        testID="glass-tab-bar-pill"
        style={[
          styles.pill,
          {
            // The web's `border-zinc-200/70 dark:border-white/10`: in dark mode
            // the hairline is a wash of the FOREGROUND, because the `border`
            // token (zinc-800) is invisible against a dark glass.
            borderColor: isDark ? tint("foreground", 0.1) : tint("border", 0.7),
            // The web's `bg-white/80 dark:bg-zinc-900/80`, a little more
            // transparent so the blur it sits under is still visible — and
            // NONE of it under Liquid Glass, which refracts what is behind it
            // and would be flattened by a wash.
            backgroundColor: tint("card", liquidGlass ? 0 : 0.6),
          },
        ]}
      >
        <GlassSurface isDark={isDark} liquidGlass={liquidGlass} />
        <View role="tablist" style={styles.row}>
          {state.routes.map((route, index) => {
            const descriptor = descriptors[route.key];
            if (!descriptor) return null;
            const { options } = descriptor;
            if (isHiddenFromBar(options)) return null;

            const focused = index === state.index;
            const label = options.title ?? route.name;
            return (
              <GlassTabButton
                key={route.key}
                focused={focused}
                label={label}
                // The name the navigator used to compose for us, kept to the
                // letter (`BottomTabBar.js`: `${label}, tab, ${index + 1} of
                // ${routes.length}`) — hidden routes included in the total,
                // because they are screens of this navigator even though they
                // are not buttons. Set on Android too, where react-navigation
                // leaves it undefined and leans on the visible label: these
                // buttons have no visible label to lean on.
                accessibilityLabel={`${label}, tab, ${index + 1} of ${state.routes.length}`}
                icon={options.tabBarIcon}
                activeColor={options.tabBarActiveTintColor ?? colors.primary}
                inactiveColor={
                  options.tabBarInactiveTintColor ?? colors["muted-foreground"]
                }
                // The web's active pill: `bg-zinc-900/10 dark:bg-white/15`.
                activePillColor={tint("foreground", isDark ? 0.15 : 0.1)}
                testID={options.tabBarButtonTestID ?? `glass-tab-${route.name}`}
                onPress={() => emitPress(route.key, route.name, focused)}
                onLongPress={() =>
                  navigation.emit({ type: "tabLongPress", target: route.key })
                }
              />
            );
          })}
        </View>
      </View>
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
    alignItems: "stretch",
  },
  pill: {
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    // Clips the material to the capsule. The elevation/shadow below is drawn
    // from the layer's outline, so it is not clipped with it.
    overflow: "hidden",
    // The web's `shadow-lg shadow-black/10 dark:shadow-black/40`. No
    // `shadowColor`: React Native's default is already black, and a literal
    // would be a colour value outside `lib/theme/tokens.ts` (NP-123).
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  item: {
    flex: 1,
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: MIN_TOUCH_TARGET / 2,
  },
  activePill: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: MIN_TOUCH_TARGET / 2,
  },
});
