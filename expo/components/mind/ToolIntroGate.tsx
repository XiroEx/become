import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import {
  apiFetch,
  MindIntroduceResponseSchema,
  MindJournalCreateResponseSchema,
  MindProgressResponseSchema,
} from "@become/api-client";
import { getUnlockedSystems, SYSTEM_INFO } from "@become/core";
import { Text } from "@/components/Text";
import GuidedFlow from "@/components/mind/system/GuidedFlow";
import { mindAccentColor } from "@/lib/mind/accents";
import { INTRO_FLOWS } from "@/lib/mind/introFlows";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";

// NP-299: no "locked" state here — on purpose. The web's equivalent
// (`webapp/components/mind/ToolIntroGate.tsx`) has no locked UI either: it
// just `router.replace('/dashboard/mind')`s and never renders. Native used to
// show a dedicated "<Tool> is Locked / Unlocks in Chapter N / Back to Mind"
// screen instead of bouncing back like every other locked-tool deep link.
type GateState = "loading" | "intro" | "ready";

export default function ToolIntroGate({
  system,
  children,
  onExit,
}: {
  system: string;
  children: ReactNode;
  onExit?: () => void;
}) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await apiFetch(
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
        if (!cancelled) setState("ready"); // fail open, never brick
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
  }, [system, token]);

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

  if (state === "intro") {
    const flow = INTRO_FLOWS[system]!;

    return (
      <View testID="mind-intro-gate-intro" className="flex-1">
        <GuidedFlow
          title={flow.title}
          steps={flow.steps}
          accentColor={mindAccentColor(system)}
          doneText="Enter"
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
