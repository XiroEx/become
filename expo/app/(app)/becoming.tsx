// The Becoming — the page (NP-192, NP-204).
//
// Loads the journey (every week, scored and placed, from `/api/becoming/journey`
// through the same authenticated client as every other screen — NP-254), paints
// it from the same-week cache first, and hands it to the STAGE: the web's
// `JourneyCanvas`, natively (`components/becoming/journey/JourneyStage.tsx`).
// The details sheet opens over the stage from a card's Details button and can
// fly the stage to a week from its Story screen.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Text } from "@/components/Text";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  resolveIntroKind,
} from "@/lib/becoming/storage";
import type { WeekSnapshot, JourneyPayload } from "@/lib/becoming/types";
import type { IntroKind } from "@/lib/becoming/stage";
import { JourneyStage, type JourneyStageHandle } from "@/components/becoming/journey/JourneyStage";
import { BecomingDetails } from "@/components/becoming/BecomingDetails";
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

  const { colors, isDark } = useThemeTokens();

  const [data, setData] = useState<JourneyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Which opening the stage plays. Decided ONCE, when the journey is first on
  // hand, from Reduce Motion, the deep link and what this member has seen —
  // `lib/becoming/storage.ts#resolveIntroKind`. Null until then: the stage is
  // not mounted with a guess that the real answer would then cut short.
  const [introKind, setIntroKind] = useState<IntroKind | null>(null);
  const stageRef = useRef<JourneyStageHandle>(null);

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

  const todayKey = data?.todayKey ?? null;
  useEffect(() => {
    if (!todayKey || introKind) return;
    let cancelled = false;
    void resolveIntroKind({ todayKey, initialWeekKey }).then((kind) => {
      if (!cancelled) setIntroKind(kind);
    });
    return () => {
      cancelled = true;
    };
  }, [todayKey, initialWeekKey, introKind]);

  const weeks: WeekSnapshot[] = useMemo(() => data?.weeks ?? [], [data?.weeks]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/(tabs)/mind" as never);
    }
  }, [router]);

  const handleNavigate = useCallback(
    (url: string) => {
      const target = resolveWebPath(url);
      if (target.kind === "native") {
        router.push(target.href as never);
      }
    },
    [router],
  );

  const openDetails = useCallback(() => setDetailsOpen(true), []);

  // The details Story screen asks for a week: close the sheet, fly the stage.
  const jumpToWeek = (weekKey: string) => {
    const idx = weeks.findIndex((w) => w.weekKey === weekKey);
    if (idx < 0) return;
    setDetailsOpen(false);
    setTimeout(() => stageRef.current?.focusOn(idx), 100);
  };

  const loadingView = (
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

  if (loading && !data) return loadingView;

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

  if (!data || weeks.length === 0) {
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

  // The opening is still being decided (a storage read and the Reduce Motion
  // answer — a tick, in practice).
  if (!introKind) return loadingView;

  return (
    <View style={styles.root} testID="becoming-screen">
      {/* The stage is a night sky in both colour schemes, like the web's. */}
      <StatusBar style="light" />
      <JourneyStage
        ref={stageRef}
        data={data}
        introKind={introKind}
        onClose={handleBack}
        onDetails={openDetails}
        onNavigate={handleNavigate}
        initialWeekKey={initialWeekKey}
        inert={detailsOpen}
      />

      {/* Details Sheet */}
      <BecomingDetails
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        weeks={weeks}
        weighIns={data.weights}
        todayKey={data.todayKey}
        unit={data.unit}
        identity={data.identity}
        chapter={data.chapter}
        becomingScore={data.becomingScore}
        token={token}
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
