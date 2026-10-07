import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, BackHandler, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  apiFetch,
  MindIntroduceResponseSchema,
  MindJournalCreateResponseSchema,
  MindProgressResponseSchema,
  type MindProgressResponse,
} from "@become/api-client";
import { getUnlockedSystems, SYSTEM_INFO } from "@become/core";
import { Text } from "@/components/Text";
import GuidedFlow from "@/components/mind/system/GuidedFlow";
import { useAndroidBackHandler, type BackHandlerLike } from "@/lib/android/backHandler";
import { mindAccentColor } from "@/lib/mind/accents";
import { INTRO_FLOWS } from "@/lib/mind/introFlows";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";

// NP-299: no "locked" state here — on purpose. The web's equivalent
// (`webapp/components/mind/ToolIntroGate.tsx`) has no locked UI either: it
// just `router.replace('/dashboard/mind')`s and never renders.
// NP-336: error state for failed progress call instead of fail-open.
type GateState = "loading" | "intro" | "ready" | "error";

export default function ToolIntroGate({
  system,
  children,
  onExit,
  backHandler = BackHandler,
}: {
  system: string;
  children: ReactNode;
  onExit?: () => void;
  /** DI hook for tests — injects BackHandler for Android system back handling (NP-336). */
  backHandler?: BackHandlerLike;
}) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<GateState>("loading");
  const [retryCount, setRetryCount] = useState(0);

  // NP-336: system back inside a tool intro closes the intro flow back to the dashboard
  useAndroidBackHandler({
    enabled: state === "intro",
    onBack: () => {
      setState("ready");
      return true;
    },
    backHandler,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await apiFetch<MindProgressResponse>(
          "/api/mind/progress",
          MindProgressResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        if (cancelled) return;

        const chapter = p.chapter ?? 1;
        const unlocked: string[] =
          p.unlockedSystems ?? getUnlockedSystems(chapter);

        if (!unlocked.includes(system)) {
          // NP-299: bounce to the Mind hub like web's
          // `router.replace('/dashboard/mind')` — never a dedicated locked
          // page. State stays "loading" so the skeleton keeps showing for the
          // instant it takes the navigation to land, same as web leaving its
          // GateState at "loading" after the replace.
          router.replace("/(tabs)/mind" as any);
          return;
        }

        const introduced: string[] = p.introducedSystems ?? [];
        if (introduced.includes(system) || !INTRO_FLOWS[system]) {
          setState("ready");
        } else {
          setState("intro");
        }
      } catch {
        // NP-336: never open a locked tool on a failed progress call (error + retry)
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // `router` is deliberately excluded: `useRouter()` returns a fresh object
    // every render in this codebase's test doubles (and isn't guaranteed
    // referentially stable from real expo-router either), so including it
    // would re-run this fetch — and jump a mid-intro user back to "loading"
    // — on every render instead of once per `system`/`token` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system, token, retryCount]);

  if (state === "loading") {
    return (
      <View
        testID="mind-intro-gate-loading"
        className="flex-1 items-center justify-center p-8 gap-4"
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-sm text-muted-foreground">Loading…</Text>
      </View>
    );
  }

  if (state === "error") {
    return (
      <View
        testID="mind-intro-gate-error"
        className="flex-1 items-center justify-center p-8 gap-4"
      >
        <Text className="text-base font-semibold text-foreground text-center">
          Could not verify access
        </Text>
        <Text className="text-sm text-muted-foreground text-center">
          Check your connection and try again.
        </Text>
        <Pressable
          testID="mind-intro-gate-retry"
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => {
            setState("loading");
            setRetryCount((c) => c + 1);
          }}
          className="rounded-xl px-4 py-2.5 items-center justify-center bg-primary"
        >
          <Text className="text-sm font-bold text-white">Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (state === "intro") {
    const flow = INTRO_FLOWS[system]!;

    return (
      <View testID="mind-intro-gate-intro" className="flex-1">
        <GuidedFlow
          title={flow.title}
          steps={flow.steps}
          accentColor={mindAccentColor(system)}
          doneText="Enter"
          backHandler={backHandler}
          onComplete={(answers) => {
            void apiFetch(
              "/api/mind/progress/introduce",
              MindIntroduceResponseSchema,
              {
                method: "POST",
                baseUrl: WEBAPP_BASE_URL,
                getToken: () => token ?? undefined,
                body: { system },
                tz: tzOffsetMinutes(),
              },
            ).catch(() => {});

            if (answers.length > 0) {
              const label = SYSTEM_INFO[system]?.label ?? system;
              void apiFetch(
                "/api/mind/journal",
                MindJournalCreateResponseSchema,
                {
                  method: "POST",
                  baseUrl: WEBAPP_BASE_URL,
                  getToken: () => token ?? undefined,
                  body: {
                    system,
                    kind: "intro",
                    title: `${label} unlocked`,
                    lines: answers.map((a) => ({
                      prompt: a.prompt,
                      answer: a.answer,
                    })),
                  },
                  tz: tzOffsetMinutes(),
                },
              ).catch(() => {});
            }

            setState("ready");
          }}
          onExit={onExit ?? (() => setState("ready"))}
        />
      </View>
    );
  }

  return <>{children}</>;
}
