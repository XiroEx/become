import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Lock } from "lucide-react-native";
import {
  apiFetch,
  MindIntroduceResponseSchema,
  MindJournalCreateResponseSchema,
  MindProgressResponseSchema,
} from "@become/api-client";
import { getUnlockedSystems, SYSTEM_INFO } from "@become/core";
import { Text } from "@/components/Text";
import GuidedFlow from "@/components/mind/system/GuidedFlow";
import { INTRO_FLOWS } from "@/lib/mind/introFlows";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";

type GateState = "loading" | "locked" | "intro" | "ready";

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
  const [state, setState] = useState<GateState>("loading");
  const [chapterNeeded, setChapterNeeded] = useState<number>(1);

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
          const sysInfo = SYSTEM_INFO[system];
          setChapterNeeded(sysInfo?.chapter ?? 1);
          setState("locked");
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

  if (state === "locked") {
    const sysInfo = SYSTEM_INFO[system];
    const label = sysInfo?.label ?? system;
    return (
      <View
        testID="mind-system-locked"
        className="flex-1 items-center justify-center p-8 gap-4"
      >
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Lock size={32} color={colors["muted-foreground"]} />
        </View>
        <Text className="text-xl font-bold text-foreground text-center">
          {label} is Locked
        </Text>
        <Text className="text-sm text-muted-foreground text-center max-w-xs">
          Unlocks in Chapter {chapterNeeded}. Keep putting in reps to open this
          tool.
        </Text>
        {onExit ? (
          <Pressable
            testID="mind-locked-back"
            accessibilityRole="button"
            onPress={onExit}
            className="mt-4 rounded-xl bg-muted px-6 py-3"
          >
            <Text className="text-sm font-semibold text-foreground">
              Back to Mind
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (state === "intro") {
    const flow = INTRO_FLOWS[system]!;
    const accentColor = colors.accent;

    const accentClass =
      system === "state-shift"
        ? "bg-cyan-500"
        : system === "self-image"
          ? "bg-violet-500"
          : system === "mission"
            ? "bg-blue-500"
            : "bg-primary";

    return (
      <View testID="mind-intro-gate-intro" className="flex-1">
        <GuidedFlow
          title={flow.title}
          steps={flow.steps}
          accentColor={accentColor}
          accentClass={accentClass}
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
