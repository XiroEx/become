import { Tabs } from "expo-router";
import {
  Brain,
  ClipboardList,
  Home,
  UserRound,
  UtensilsCrossed,
} from "lucide-react-native";
import { renderGlassTabBar } from "@/components/navigation/GlassTabBar";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface TabRouteConfig {
  /** The folder under `(tabs)` this button opens. */
  name: "programming" | "mind" | "dashboard" | "nutrition" | "profile";
  /** The label, which is the WEB's label — see the note below. */
  title: string;
}

/**
 * THE TAB BAR IS THE WEB'S TAB BAR.
 *
 * `webapp/components/BottomNav.tsx` is the source of truth for order, labels
 * and icons: Workout, Mind, Home, Nutrition, Community. Native shipped its own
 * set — Home, Programs, Mind, Nutrition, Chat — so the two clients disagreed
 * about what the app is called in four places out of five and about which
 * button sits under the thumb.
 *
 * FIVE BUTTONS, AND HOME IN THE MIDDLE (NP-351). Community is hidden on native
 * in v1 (and behind `FeatureGuard`'s "Coming soon" on the web), which left four
 * buttons and Home 3rd of 4 — so Home was never actually centred, which is what
 * Jon asked for on the 0.1.0 TestFlight build. **Profile** takes Community's
 * slot: it was already a screen in this tree, reachable from the dashboard's
 * avatar but `href: null` here, and promoting it to a real button puts Home
 * exactly in the middle of five. Swap slot 5 back to Community when community
 * ships on native.
 *
 * The other four keep the WEB's order (Workout, Mind, Home, Nutrition) rather
 * than re-sorting them around Home — the web file is the source of truth for
 * order, `__tests__/navigation-shell.test.tsx` reads it to prove it, and
 * centring Home does not require moving anything else.
 *
 * The `chat` and `calendar` folders are still in the tree and still reachable
 * by URL; they are listed below with `href: null` so they are not buttons.
 * NP-032 removes the chat routes behind `EXPO_PUBLIC_COMMUNITY_ENABLED` —
 * there is deliberately no second flag here.
 *
 * `programming` is the Workout tab: the label is the web's, the screen is
 * today's programs list until NP-071 ports the web's workout home. A route
 * rename would break every `/(tabs)/programming/…` href in the app, so the
 * folder keeps its name.
 */
export const TAB_ROUTES: TabRouteConfig[] = [
  { name: "programming", title: "Workout" },
  { name: "mind", title: "Mind" },
  { name: "dashboard", title: "Home" },
  { name: "nutrition", title: "Nutrition" },
  { name: "profile", title: "Profile" },
];

/**
 * The web's icons, one for one with `BottomNav.tsx`'s lucide imports —
 * `UserRound` for Profile, which is `UsersRound` (Community) minus the second
 * person, so slot 5 keeps the same drawing style when the two are swapped.
 */
const ICON_BY_ROUTE: Record<TabRouteConfig["name"], typeof Home> = {
  programming: ClipboardList,
  mind: Brain,
  dashboard: Home,
  nutrition: UtensilsCrossed,
  profile: UserRound,
};

/**
 * THE TAB BAR — five buttons, and nothing else.
 *
 * Every direct child of this folder is a screen of the TAB navigator, listed
 * here or not: a folder without its own `_layout.tsx` is flattened, so
 * `programming/[id]/workout/[idx]/live` used to be a tab button and the bar
 * carried twenty of them. Each tab now owns a Stack
 * (`components/navigation/TabStack.tsx`), which makes each folder exactly ONE
 * screen here and turns every detail route into a push inside its tab.
 *
 * `headerShown: false` for the same reason the stacks set it: the screens draw
 * their own headers inside a SafeAreaView.
 *
 * `__tests__/navigation-shell.test.tsx` renders this layout over the REAL app
 * directory and reads the bar that comes out, so it fails if the bar ever grows
 * a sixth button or reorders the five.
 *
 * `tabBar` is ours (NP-351): a floating, blurred, rounded capsule inset from
 * the screen edges — the web's pill — in place of bottom-tabs' opaque
 * edge-attached strip. It is absolutely positioned, so the scene fills the
 * whole screen and content scrolls UNDER the glass; the space a screen reserves
 * for it is `TAB_BAR_CONTENT_INSET` from `lib/navigation/tabBarInset.ts`. See
 * `components/navigation/GlassTabBar.tsx` for the material (Liquid Glass on
 * iOS 26+, `systemChromeMaterial` below it, a blurred translucent surface on
 * Android) and for why it is not `expo-router/unstable-native-tabs`.
 *
 * `initialRouteName="dashboard"` + `backBehavior="history"` (NP-315): without
 * an explicit initial route, this navigator's back history is seeded with its
 * FIRST declared screen — `programming` (Workout), per `TAB_ROUTES` above —
 * even though every member actually lands on Home (`dashboard`) first. System
 * back on Home then popped to Workout instead of exiting, and any screen
 * opened cross-tab from Home (History, Nutrition Goals) fell back to that same
 * phantom Workout entry instead of Home once its own stack ran out of local
 * history — `programming/history.tsx` and `nutrition/goals.tsx` both guard
 * their own back targets for this too (`router.canGoBack()` → Home).
 * `backBehavior="history"` is bottom-tabs' default; named here so a future
 * edit has to say out loud that it is changing it.
 */
export default function TabsLayout() {
  // The bar is a native navigator surface, so none of it can be a class: the
  // colours come from the theme and re-render when the system flips (NP-123).
  const { colors } = useThemeTokens();

  return (
    <Tabs
      initialRouteName="dashboard"
      backBehavior="history"
      tabBar={renderGlassTabBar}
      screenOptions={{
        headerShown: false,
        // THE NEUTRAL PRIMARY (NP-313): zinc-900 in light, white in dark — the
        // web's active tab is `text-black dark:text-white`, never red.
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors["muted-foreground"],
        // Icon-only, like the web (`aria-label`/`title` and no visible text).
        // `GlassTabBar` draws no label whatever this says; it is here so the
        // navigator's own options do not claim otherwise.
        tabBarShowLabel: false,
        // THE SCENE CONTAINER, which is not the screen and not the tab bar
        // (NP-340). bottom-tabs renders every tab into its own
        // `elements/Background`, whose colour comes from React Navigation's
        // theme — the LIGHT default until this card provided one — and then
        // into this `sceneStyle`. A tab switch therefore flashed near-white in
        // the frames between detaching one scene and attaching the next. The
        // theme is ours now (`lib/theme/navigationTheme.ts`); this says it a
        // second time, on the view the navigator hands us, so a tab switch
        // cannot show anything but the page colour.
        sceneStyle: { backgroundColor: colors.background },
        // A tab switch is a CUT, not a travel: bottom-tabs' default, named here
        // so a future edit has to say out loud that it is adding motion to the
        // one transition that should be instant.
        animation: "none",
      }}
    >
      {TAB_ROUTES.map(({ name, title }) => {
        const Icon = ICON_BY_ROUTE[name];
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title,
              // The web's `strokeWidth={active ? 2.4 : 2}` — the icon is drawn
              // heavier when its tab is the one you are on.
              tabBarIcon: ({ color, focused }) => (
                <Icon
                  color={color as string}
                  size={22}
                  strokeWidth={focused ? 2.4 : 2}
                />
              ),
            }}
          />
        );
      })}
      {/* Hidden routes — present in the (tabs) tree but not in the tab bar. */}
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
    </Tabs>
  );
}
