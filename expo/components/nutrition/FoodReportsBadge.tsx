import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Flag } from "lucide-react-native";
import { Text } from "@/components/Text";
import { loadMyReports } from "@/lib/nutrition/foodFlags";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * The unread food-report outcomes badge, natively (NP-174).
 *
 * The web's `TopNav.tsx`: a report that came back "no change" used to end
 * silently on our side; the member is the only one holding the packet, so
 * they need to know it landed. `GET /api/nutrition/flags/mine` carries
 * `unreadCount`, cleared by opening the reports list (`POST
 * /api/nutrition/flags/mine {}` — see `FoodReportsSheet`, which marks on
 * open).
 *
 * A badge is not worth an error state: a refused load renders nothing.
 */

export interface FoodReportsBadgeProps {
  /** Session JWT. Absent → no badge. */
  token?: string | null;
  /** Open the reports list. */
  onOpen: () => void;
  /** DI seam for tests. The app leaves it unset. */
  loadImpl?: typeof loadMyReports;
  /** Re-read when this changes (e.g. after filing a report). */
  refreshKey?: number | string;
  testID?: string;
}

export function FoodReportsBadge({
  token,
  onOpen,
  loadImpl = loadMyReports,
  refreshKey,
  testID = "food-reports-badge",
}: FoodReportsBadgeProps) {
  const { colors } = useThemeTokens();
  const [unread, setUnread] = useState(0);
  // The badge derives from the server, not from render: the token edge owns
  // the read, and a ref (never state) carries the in-flight guard.
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!token) {
      // No session — nothing to show, and no badge to clear.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from session outside React
      setUnread(0);
      return;
    }
    if (loadingRef.current) return;
    loadingRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await loadImpl({ jwt: token });
        if (!cancelled && res.status === "loaded") setUnread(res.unreadCount ?? 0);
      } catch {
        // A badge is not worth an error state.
      } finally {
        if (!cancelled) loadingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadImpl, token, refreshKey]);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0
          ? `Your food reports, ${unread} unread update${unread === 1 ? "" : "s"}`
          : "Your food reports"
      }
      onPress={onOpen}
      hitSlop={8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <Flag size={16} color={colors.foreground} />
      <Text className="text-xs font-semibold text-foreground">Reports</Text>
      {unread > 0 ? (
        <View
          testID={`${testID}-count`}
          accessibilityLabel={`${unread} unread`}
          style={{
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 5,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.destructive,
          }}
        >
          <Text
            className="text-[11px] font-bold"
            style={{ color: colors["primary-foreground"] }}
          >
            {unread > 99 ? "99+" : String(unread)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
