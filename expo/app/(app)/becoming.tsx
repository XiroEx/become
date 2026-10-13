// The Becoming — the page (NP-192, NP-204).
//
// Loads the journey (every week, scored and placed, from `/api/becoming/journey`
// through the same authenticated client as every other screen — NP-254) and
// hands it to the STAGE: the web's `JourneyCanvas`, natively
// (`components/becoming/journey/JourneyStage.tsx`). The stage mounts ONCE, on
// the settled journey — the fresh payload, or the same-week cache when the
// fetch fails — with its opening decided on that same journey; a cache from
// an earlier day of the week is never painted first, because its live card
// is a day behind and the fresh payload would change it under the opening
// (NP-348). The details sheet opens over the stage from a card's Details
// button and can fly the stage to a week from its Story screen. The screen
// also tells the stage when its push has actually ended (`useScreenShown`),
// so the opening plays on screen and not behind the slide (NP-347).

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
  sameDay,
  sameJourney,
  resolveIntroKind,
} from "@/lib/becoming/storage";
import type { WeekSnapshot, JourneyPayload } from "@/lib/becoming/types";
import type { IntroKind } from "@/lib/becoming/stage";
import { JourneyStage, type JourneyStageHandle } from "@/components/becoming/journey/JourneyStage";
import { BecomingDetails } from "@/components/becoming/BecomingDetails";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useScreenShown } from "@/lib/navigation/useScreenShown";

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
  // Is this screen actually in view yet? A native-stack push mounts it before
  // the slide, and on iOS the main thread can stay busy for seconds after
  // that; the stage's opening waits for this (and its own canvas) so the hold
  // and the fly are seen, not elapsed behind the transition (NP-347). Asked
  // here, at the screen's mount, so the navigator's `transitionEnd` is heard
  // even when the journey arrives after it.
  const shown = useScreenShown();

  // The journey the stage is mounted on, WITH the opening decided for it —
  // one state, so the two land in one commit and the stage mounts exactly
  // once, on exactly what it will show (NP-348). The opening is decided from
  // Reduce Motion, the deep link and what this member has seen
  // (`lib/becoming/storage.ts#resolveIntroKind`); the stage is never mounted
  // with a guess that the real answer would then cut short.
  const [journey, setJourney] = useState<{ data: JourneyPayload; introKind: IntroKind } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const stageRef = useRef<JourneyStageHandle>(null);

  // THE CACHE IS NOT THE JOURNEY (NP-348). The same-week cache
  // (`readBecomingCache`) was written on an earlier open — possibly an
  // earlier DAY — so the live card it holds can be a day behind ("day 3 of
  // 7" with Tuesday's highlights, on Wednesday), and painting it first meant
  // the stage mounted and started its opening on it, then the fresh payload
  // changed the focused card in place. So:
  //
  //   • a cache from an earlier day is never painted. It is the OFFLINE
  //     FALLBACK: the loading state shows, the fetch is awaited, and the
  //     cache is what the stage mounts on only if the fetch fails;
  //   • a cache from TODAY is painted before the fetch only when no opening
  //     will play on it — a second open this session, Reduce Motion — so
  //     there is nothing the fresh payload could run under; a payload that
  //     differs then refreshes the landed stage in place, as the web's does;
  //   • otherwise the stage waits and mounts once, on the settled journey,
  //     with its opening decided on that journey.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cached = await readBecomingCache(memberId);
      if (cancelled) return;

      // Today's cache, and the opening it would get. Decided here because
      // whether it may be painted depends on the answer.
      let decided: { todayKey: string; kind: IntroKind } | null = null;
      let painted: JourneyPayload | null = null;
      if (cached && sameDay(cached.todayKey)) {
        const kind = await resolveIntroKind({ todayKey: cached.todayKey, initialWeekKey });
        if (cancelled) return;
        decided = { todayKey: cached.todayKey, kind };
        if (kind === "none") {
          painted = cached;
          setJourney({ data: cached, introKind: kind });
        }
      }

      // Mount the stage on the settled journey — or, when today's cache is
      // already up, refresh it in place if the journey differs.
      const settle = async (next: JourneyPayload) => {
        if (painted) {
          if (!sameJourney(painted, next)) setJourney((j) => (j ? { ...j, data: next } : j));
          return;
        }
        const kind =
          decided && decided.todayKey === next.todayKey
            ? decided.kind
            : await resolveIntroKind({ todayKey: next.todayKey, initialWeekKey });
        if (cancelled) return;
        setJourney({ data: next, introKind: kind });
      };

      let fresh: JourneyPayload | null = null;
      let failure: unknown = null;
      try {
        const res = await apiFetch<BecomingJourneyResponse>(
          "/api/becoming/journey",
          BecomingJourneyResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        fresh = res as unknown as JourneyPayload;
      } catch (e) {
        failure = e;
      }
      if (cancelled) return;

      if (fresh) {
        await settle(fresh);
        if (cancelled) return;
        setError(null);
        await writeBecomingCache(memberId, fresh);
        await markBecomingSeen();
      } else if (cached) {
        // Offline, or the API is down: the same-week cache, a day behind at worst.
        await settle(cached);
      } else {
        setError(failure instanceof Error ? failure.message : "Failed to load journey");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [memberId, token, initialWeekKey]);

  const weeks: WeekSnapshot[] = useMemo(() => journey?.data.weeks ?? [], [journey]);

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

  // Nothing settled yet: the fetch is out (a cache from an earlier day waits
  // with it as the fallback), or it failed with nothing to fall back on.
  if (!journey && !error) return loadingView;

  if (!journey) {
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

  const { data, introKind } = journey;

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
        shown={shown}
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
