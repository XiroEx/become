import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { HelpCircle, LogOut, Settings, UserRound } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Avatar } from "@/components/Avatar";
import { BottomSheet } from "@/components/BottomSheet";
import { FoodReportsBadge } from "@/components/nutrition/FoodReportsBadge";
import { FoodReportsSheet } from "@/components/nutrition/FoodReportsSheet";
import { FeedbackSheet } from "@/components/settings/FeedbackSheet";
import { useAuth } from "@/lib/auth/useAuth";
import { loadMyReports } from "@/lib/nutrition/foodFlags";
import {
  requestNativeTourHub,
  requestNativeTourReplay,
  type NativeTourHubId,
} from "@/lib/tour/nativeTourRequest";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * THE page header: one top line on every native screen (2026-10-23).
 *
 * The page title sits on the left at 28pt bold (the web's larger title, not
 * the old `text-2xl` 24), with the optional subtitle as smaller muted text
 * directly under it. The member's avatar sits on the right and opens the
 * menu — Profile, Settings, Food reports (with the unread badge, like the
 * web's `TopNav.tsx`), Send feedback (the settings `FeedbackSheet` flow),
 * Help (the hub tour) and Log out. No bar background, no border, just the
 * line, as native has today.
 *
 * The menu is a bottom sheet rather than an anchored popover: an anchored
 * popover needs a measured anchor and a dismiss layer per screen, while the
 * sheet is the same gesture on every screen and the one VoiceOver already
 * confines (`Modal.accessibilityViewIsModal`).
 */

export interface PageHeaderProps {
  /** Page title, left, 28pt bold. */
  title: string;
  /** Smaller muted text directly under the title. */
  subtitle?: string;
  /**
   * The hub-tour key for this screen (`dashboard`, `mind`, `programming`,
   * `nutrition`, `profile` — the same keys the old per-screen help buttons
   * used). Absent → Help opens the upfront tour prompt
   * (`requestNativeTourReplay`), which takes no key.
   */
  helpKey?: NativeTourHubId;
  /** Rendered beside the title — e.g. the chat unread badge, the Mind streak. */
  titleAccessory?: ReactNode;
  /** Fallbacks when there is no session (provider-less unit tests). */
  userIcon?: string | null;
  userAvatarUrl?: string | null;
  userName?: string | null;
  testID?: string;
}

function displayNameOf(
  user: { name?: unknown; email?: unknown } | null,
  fallbackName: string | null | undefined,
): string | null {
  if (typeof user?.name === "string" && user.name.trim()) return user.name;
  if (typeof fallbackName === "string" && fallbackName.trim())
    return fallbackName;
  if (typeof user?.email === "string" && user.email.includes("@")) {
    return String(user.email.split("@")[0]);
  }
  return null;
}

/**
 * The session when there is one. `useAuth()` throws outside an
 * `<AuthProvider>` — deliberate, so a screen never reads a silent fallback —
 * but the header renders in provider-less unit tests too, where the avatar
 * simply falls back to the icon props and the unread badge stays empty.
 */
function useOptionalAuth(): ReturnType<typeof useAuth> | null {
  try {
    return useAuth();
  } catch {
    return null;
  }
}

export function PageHeader({
  title,
  subtitle,
  helpKey,
  titleAccessory,
  userIcon,
  userAvatarUrl,
  userName,
  testID = "page-header",
}: PageHeaderProps) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token, user, logout } = useOptionalAuth() ?? {
    token: null,
    user: null,
    logout: null,
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // Unread food-report outcomes for the red badge on the avatar (the web's
  // TopNav reads the same `/api/nutrition/flags/mine` `unreadCount`).
  const [unread, setUnread] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync badge from session outside React
      setUnread(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await loadMyReports({ jwt: token });
        if (!cancelled && res.status === "loaded") {
          setUnread(res.unreadCount ?? 0);
        }
      } catch {
        // A badge is not worth an error state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  const openMenu = useCallback(() => {
    // Re-read the badge on every open so the dot cannot go stale.
    setRefreshKey((k) => k + 1);
    setMenuOpen(true);
  }, []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const openReports = useCallback(() => {
    setMenuOpen(false);
    setReportsOpen(true);
  }, []);
  const closeReports = useCallback(() => {
    setReportsOpen(false);
    // Opening the list IS reading it (the sheet marks read on open), so the
    // avatar dot clears with it.
    setRefreshKey((k) => k + 1);
  }, []);

  const handleHelp = useCallback(() => {
    setMenuOpen(false);
    if (helpKey) requestNativeTourHub(helpKey);
    else requestNativeTourReplay();
  }, [helpKey]);

  const handleLogout = useCallback(() => {
    if (!logout || signingOut) return;
    setSigningOut(true);
    void (async () => {
      try {
        await logout();
        router.replace("/login");
      } finally {
        setSigningOut(false);
        setMenuOpen(false);
      }
    })();
  }, [logout, router, signingOut]);

  const icon =
    (typeof user?.profileIcon === "string" ? user.profileIcon : null) ??
    userIcon ??
    null;
  const imageUrl =
    (typeof user?.avatarUrl === "string" ? user.avatarUrl : null) ??
    userAvatarUrl ??
    null;
  const name = displayNameOf(user, userName);

  return (
    <View testID={testID}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <Text
              testID={`${testID}-title`}
              accessibilityRole="header"
              style={[{ fontSize: 28, lineHeight: 34 }, WRAPPABLE_TEXT]}
              className="text-foreground font-bold"
            >
              {title}
            </Text>
            {titleAccessory}
          </View>
          {subtitle ? (
            <Text
              testID={`${testID}-subtitle`}
              style={[WRAPPABLE_TEXT, { marginTop: 2 }]}
              className="text-muted-foreground text-sm"
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          testID={`${testID}-avatar-button`}
          accessibilityRole="button"
          accessibilityLabel={
            unread > 0
              ? `Your menu, ${unread} unread food report update${unread === 1 ? "" : "s"}`
              : "Your menu"
          }
          onPress={openMenu}
          style={[
            minTouchTarget,
            { alignItems: "center", justifyContent: "center" },
          ]}
        >
          <View>
            <Avatar icon={icon} imageUrl={imageUrl} size={36} />
            {unread > 0 ? (
              <View
                testID={`${testID}-reports-badge`}
                accessibilityLabel={`${unread} unread`}
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  paddingHorizontal: 4,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.brand,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    lineHeight: 12,
                    color: colors["brand-foreground"],
                  }}
                >
                  {unread > 9 ? "9+" : String(unread)}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>

      <BottomSheet
        visible={menuOpen}
        onClose={closeMenu}
        title={name ?? "Your menu"}
        testID={`${testID}-menu`}
      >
        {/* Profile — the member's identity card. */}
        <Pressable
          testID={`${testID}-profile-item`}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => {
            closeMenu();
            router.push("/(tabs)/profile" as never);
          }}
          style={[
            minTouchTarget,
            { flexDirection: "row", alignItems: "center", gap: 12 },
          ]}
        >
          <UserRound size={18} color={colors.foreground} />
          <Text className="text-foreground text-sm font-medium">Profile</Text>
        </Pressable>
        {/* Settings — account, units, reminders, billing, delete account. */}
        <Pressable
          testID={`${testID}-settings-item`}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => {
            closeMenu();
            router.push("/settings" as never);
          }}
          style={[
            minTouchTarget,
            { flexDirection: "row", alignItems: "center", gap: 12 },
          ]}
        >
          <Settings size={18} color={colors.foreground} />
          <Text className="text-foreground text-sm font-medium">Settings</Text>
        </Pressable>
        {/* Food reports — the member's flag outcomes, with the unread count
            on the item itself (the web's TopNav rule). */}
        <FoodReportsBadge
          variant="row"
          testID={`${testID}-food-reports-item`}
          token={token}
          refreshKey={refreshKey}
          onOpen={openReports}
        />
        {/* Send feedback — the settings sheet's own row and flow, not a copy. */}
        <FeedbackSheet token={token} testID={`${testID}-feedback`} />
        {/* Help — this screen's hub tour, or the upfront prompt when the
            screen has no hub key. */}
        <Pressable
          testID={`${testID}-help-item`}
          accessibilityRole="button"
          accessibilityLabel="Help"
          accessibilityHint="Replay the app tour for this screen"
          onPress={handleHelp}
          style={[
            minTouchTarget,
            { flexDirection: "row", alignItems: "center", gap: 12 },
          ]}
        >
          <HelpCircle size={18} color={colors.foreground} />
          <Text className="text-foreground text-sm font-medium">Help</Text>
        </Pressable>
        {/* Log out — the settings sign-out path (logout + /login).
            Hidden without a session (provider-less renders). */}
        {logout ? (
          <Pressable
            testID={`${testID}-logout-item`}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            onPress={handleLogout}
            disabled={signingOut}
            style={[
              minTouchTarget,
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                opacity: signingOut ? 0.5 : 1,
              },
            ]}
          >
            <LogOut size={18} color={colors.destructive} />
            <Text className="text-destructive text-sm font-medium">
              {signingOut ? "Signing out…" : "Log out"}
            </Text>
          </Pressable>
        ) : null}
      </BottomSheet>

      <FoodReportsSheet
        visible={reportsOpen}
        onClose={closeReports}
        token={token}
        testID={`${testID}-food-reports-sheet`}
      />
    </View>
  );
}
