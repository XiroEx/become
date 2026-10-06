import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Text } from "@/components/Text";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, BookOpen } from "lucide-react-native";
import {
  apiFetch,
  BecomingJourneyResponseSchema,
  type BecomingJourneyResponse,
} from "@become/api-client";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { resolveWebPath } from "@/lib/navigation/webPathToRoute";
import {
  readBecomingCache,
  writeBecomingCache,
  markBecomingSeen,
  sameWeek,
} from "@/lib/becoming/storage";
import { journeySignals } from "@/lib/becoming/signals";
import type { WeekSnapshot, JourneyPayload } from "@/lib/becoming/types";
import { WeekCard, HorizonCard } from "@/components/becoming/WeekCard";
import { BecomingDetails } from "@/components/becoming/BecomingDetails";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export default function BecomingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const search = useLocalSearchParams<{ week?: string }>();
  const initialWeekKey = search.week ?? null;
  const { user, token } = useAuth();
  const memberId =
    typeof user?.id === "string"
      ? user.id
      : typeof (user as { _id?: string })?._id === "string"
        ? (user as { _id?: string })._id!
        : null;

  const { colors, tint, isDark } = useThemeTokens();

  const [data, setData] = useState<JourneyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const flatListRef = useRef<FlatList<WeekSnapshot>>(null);

  // 1. Instant paint from same-week cache (<2s on mid-range phone for 1 year of history)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cached = await readBecomingCache(memberId);
      if (!cancelled && cached && cached.weeks?.length && sameWeek(cached.todayKey)) {
        setData(cached);
        setLoading(false);
      }

      try {
        const fresh = await apiFetch<BecomingJourneyResponse>(
          "/api/becoming/journey",
          BecomingJourneyResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        if (!cancelled) {
          const journey = fresh as unknown as JourneyPayload;
          setData(journey);
          setError(null);
          setLoading(false);
          await writeBecomingCache(memberId, journey);
          await markBecomingSeen();
        }
      } catch (e) {
        if (!cancelled) {
          // If we had no cache, display the error
          if (!cached || !cached.weeks?.length) {
            setError(e instanceof Error ? e.message : "Failed to load journey");
          }
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [memberId, token]);

  const weeks: WeekSnapshot[] = useMemo(() => data?.weeks ?? [], [data?.weeks]);

  // Compute signals
  const signals = useMemo(
    () =>
      journeySignals(weeks, {
        unit: data?.unit,
        direction: data?.target?.direction,
      }),
    [weeks, data?.unit, data?.target?.direction],
  );

  // Determine which week to focus / open on
  const thisWeekIndex = useMemo(() => {
    if (weeks.length === 0) return 0;
    if (initialWeekKey) {
      const idx = weeks.findIndex((w: WeekSnapshot) => w.weekKey === initialWeekKey);
      if (idx >= 0) return idx;
    }
    const currentIdx = weeks.findIndex((w: WeekSnapshot) => w.isCurrent);
    if (currentIdx >= 0) return currentIdx;
    return weeks.length - 1;
  }, [weeks, initialWeekKey]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/(tabs)/dashboard" as never);
    }
  };

  const handleNavigate = (url: string) => {
    const target = resolveWebPath(url);
    if (target.kind === "native") {
      router.push(target.href as never);
    }
  };

  const jumpToWeek = (weekKey: string) => {
    const idx = weeks.findIndex((w) => w.weekKey === weekKey);
    if (idx >= 0) {
      setDetailsOpen(false);
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.1,
        });
      }, 100);
    }
  };

  if (loading && !data) {
    return (
      <View
        style={[
          styles.centerContainer,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
        testID="journey-loading"
      >
        <Text style={[styles.kicker, { color: colors["muted-foreground"] }]}>The Becoming</Text>
        <ActivityIndicator
          size="large"
          color={isDark ? "hsl(258, 90%, 75%)" : "hsl(258, 90%, 55%)"}
          style={{ marginTop: 24 }}
        />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View
        style={[
          styles.centerContainer,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>Couldn&apos;t load your Becoming</Text>
        <Text style={[styles.errorSub, { color: colors["muted-foreground"] }]}>{error}</Text>
        <Pressable
          style={[styles.backPill, { backgroundColor: colors.foreground }]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[styles.backPillText, { color: colors.background }]}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (weeks.length === 0) {
    return (
      <View
        style={[
          styles.centerContainer,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <Text style={[styles.kicker, { color: colors["muted-foreground"] }]}>The Becoming</Text>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Who am I becoming?</Text>
        <Text style={[styles.emptyBody, { color: colors["muted-foreground"] }]}>
          Your first week writes the first card. Log a meal, finish a workout or open a Mind
          session and come back on Sunday.
        </Text>
        <Pressable
          style={[styles.backPill, { backgroundColor: colors.foreground }]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[styles.backPillText, { color: colors.background }]}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 8),
        },
      ]}
    >
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          style={[minTouchTarget, styles.backBtn, { backgroundColor: tint("muted", 0.5) }]}
          onPress={handleBack}
          accessibilityLabel="Back to dashboard"
          accessibilityRole="button"
        >
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerKicker, { color: colors.foreground }]}>The Becoming</Text>
          <Text style={[styles.headerSub, { color: colors["muted-foreground"] }]}>Then → now → next</Text>
        </View>
        <Pressable
          style={[
            minTouchTarget,
            styles.headerDetailsBtn,
            {
              backgroundColor: isDark
                ? "hsla(258, 80%, 70%, 0.18)"
                : "hsla(258, 80%, 50%, 0.1)",
            },
          ]}
          onPress={() => setDetailsOpen(true)}
          accessibilityLabel="Open details"
          accessibilityRole="button"
          testID="header-details-btn"
        >
          <BookOpen
            size={16}
            color={isDark ? "hsl(258, 90%, 80%)" : "hsl(258, 90%, 45%)"}
          />
          <Text
            style={[
              styles.headerDetailsText,
              { color: isDark ? "hsl(258, 90%, 80%)" : "hsl(258, 90%, 45%)" },
            ]}
          >
            Details
          </Text>
        </Pressable>
      </View>

      {/* Windowed vertical list of week cards opening on this week */}
      <FlatList
        ref={flatListRef}
        data={weeks}
        keyExtractor={(item) => item.weekKey}
        renderItem={({ item, index }) => (
          <WeekCard
            week={item}
            signals={signals[index] ?? { active: [], highlights: [], nudge: null, hasDeltas: false }}
            totalWeeks={weeks.length}
            identity={data?.identity ?? null}
            next={item.isCurrent ? (data?.next ?? null) : null}
            onDetails={() => setDetailsOpen(true)}
            onNavigate={handleNavigate}
          />
        )}
        ListFooterComponent={
          <HorizonCard
            identity={data?.identity ?? null}
            trend={
              weeks[weeks.length - 1]?.step === "up"
                ? "up"
                : weeks[weeks.length - 1]?.step === "down"
                  ? "down"
                  : "flat"
            }
            next={data?.next ?? null}
            active={signals[signals.length - 1]?.active ?? ["training", "fuel", "mind"]}
            onNavigate={handleNavigate}
          />
        }
        initialScrollIndex={thisWeekIndex}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: info.index,
              animated: false,
            });
          }, 100);
        }}
        windowSize={5}
        maxToRenderPerBatch={3}
        initialNumToRender={3}
        removeClippedSubviews={true}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 16 },
        ]}
      />

      {/* Details Sheet */}
      <BecomingDetails
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        weeks={weeks}
        weighIns={data?.weights}
        todayKey={data?.todayKey}
        unit={data?.unit}
        identity={data?.identity}
        chapter={data?.chapter}
        becomingScore={data?.becomingScore}
        onJumpToWeek={jumpToWeek}
        onNavigate={handleNavigate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    alignItems: "center",
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 10,
  },
  headerDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  headerDetailsText: {
    fontSize: 12,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  errorSub: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
  },
  emptyTitle: {
    fontSize: 26,
    fontWeight: "900",
    marginTop: 8,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
  },
  backPill: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  backPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
