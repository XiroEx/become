import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal as RNModal,
  Pressable,
  ScrollView,
  Share,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronUp,
  Flame,
  Share2,
  Sparkles,
  X,
} from "lucide-react-native";
import {
  BREATH_PROTOCOLS,
  CHAPTERS,
  SYSTEM_INFO,
  breathForState,
  realignOpening,
  type BreathProtocol,
  type MindSessionPlan,
  type MindState,
  type Move,
  type SessionAnswer,
  type SessionContext,
} from "@become/core";
import {
  apiFetch,
  MindJournalCreateResponseSchema,
  MindSessionCompleteResponseSchema,
  MindShareResponseSchema,
  type MindSessionCompleteResponse,
  type MindShareResponse,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { AssembleScene } from "@/components/mind/session/scenes/AssembleScene";
import { BreathScene } from "@/components/mind/session/scenes/BreathScene";
import { ChallengeScene } from "@/components/mind/session/scenes/ChallengeScene";
import { ChoiceScene } from "@/components/mind/session/scenes/ChoiceScene";
import { ComposeScene } from "@/components/mind/session/scenes/ComposeScene";
import { ContrastScene } from "@/components/mind/session/scenes/ContrastScene";
import { HoldToAffirmScene } from "@/components/mind/session/scenes/HoldToAffirmScene";
import { IdentityScene } from "@/components/mind/session/scenes/IdentityScene";
import { MissionScene } from "@/components/mind/session/scenes/MissionScene";
import { MirrorScene } from "@/components/mind/session/scenes/MirrorScene";
import { PatternScene } from "@/components/mind/session/scenes/PatternScene";
import { SocialScene } from "@/components/mind/session/scenes/SocialScene";
import { SpeakScene } from "@/components/mind/session/scenes/SpeakScene";
import { StateCheckScene } from "@/components/mind/session/scenes/StateCheckScene";
import { TypeScene } from "@/components/mind/session/scenes/TypeScene";
import { VisionScene } from "@/components/mind/session/scenes/VisionScene";
import { WinScene } from "@/components/mind/session/scenes/WinScene";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { announce } from "@/lib/a11y/announce";
import { modalAnimation, useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { onDarkForeground, resolveToken, tintToken } from "@/lib/theme/tokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";
import { reflectOnAnswers } from "@/lib/mind/reflect";
import {
  invalidateMindSession,
  warmMindSession,
} from "@/lib/mind/sessionCache";

/**
 * THE MIND SESSION PLAYER, natively (NP-098 / NP-101).
 *
 * A port of `webapp/components/mind/session/SessionPlayer.tsx`: a composed plan
 * is an ordered chain of MOVES, and this plays it one full-screen beat at a time
 * — intro → the moves, with back / next / exit → the payoff → levelup.
 *
 * Rules that travel with it:
 *  1. The check-in re-opens the session, and only the OPENING.
 *  2. The check-in IS the first answer ("How I checked in today").
 *  3. Answers keep the LATEST value per question (overwriting on back).
 *  4. A positive check-in skips forced breathing (altPositive replaces breath).
 *  5. Report the EFFECTIVE kinds shown (the locked-in alternative replaces breath).
 *  6. Never compute XP or chapters natively; show the server's numbers.
 *  7. Drop the cached AI plan and warm a fresh one on completion (NP-102).
 *
 * THE CHROME IS THE WEB'S FIXED DARK STAGE, NOT A THEMED SCREEN (NP-297). The
 * web's `SessionPlayer` is `fixed inset-0 bg-black text-white` — one immersive
 * surface that never follows `prefers-color-scheme`, on every stage (intro,
 * every move, payoff, level-up). Native used to draw this chrome from
 * `useThemeTokens()`, which is exactly what made a light-mode phone show a
 * light background with the `primary` token (brand red here) for the
 * progress bar and every button — the opposite of the web's black-and-white
 * immersive look, on top of a `SafeAreaView` whose insets don't resolve
 * correctly inside this file's bare `Modal` (see `useSafeAreaInsetsOrZero`
 * below), which is why the exit / back / progress row used to land under the
 * iOS status bar on every stage.
 *
 * The fix is the same shape as `MirrorScene` / `BarcodeScanner`'s always-dark
 * surfaces: literal Tailwind classes (`bg-black`, `text-white` — not hex, see
 * NP-123 / `noHexColorLiterals.test.ts`) carry the surface and the text, and
 * the few `PLAYER_*` constants below carry the handful of spots a React
 * Native API needs an actual colour VALUE rather than a class (a lucide
 * `color` prop, an `ActivityIndicator`, a gradient's stops) — resolved
 * against the DARK palette explicitly rather than the live system scheme,
 * because this screen does not have a light mode on either client.
 * `mind-violet` / `mind-green` are already flat (identical in both palettes —
 * the Mind home's own violet→green accent, NP-296), so the progress bar and
 * the seal/intro-tile gradients need no mode pin; `success` / `accent` DO
 * vary with the system, so they are pinned to `"dark"` to land on the web's
 * green-400 / amber-400 rather than whatever the phone happens to be set to.
 *
 * Scoped to what THIS file draws. The individual scenes (`StateCheckScene`,
 * `BreathScene`, …) are untouched — they are separately-shipped NP-098/123
 * surfaces that deliberately follow the system scheme, which is still correct
 * everywhere else they're used. The `move` stage here keeps its own explicit
 * `bg-background` behind whichever scene is playing so none of that legibility
 * work is undone; only the chrome this file owns (the top bar, the intro, the
 * payoff, the level-up) takes the web's fixed black.
 */
const PLAYER_WHITE = onDarkForeground;
const PLAYER_BLACK = resolveToken("mind-ink", "dark");
const PLAYER_GREEN = resolveToken("success", "dark");
const PLAYER_AMBER = resolveToken("accent", "dark");
const PLAYER_ORANGE = resolveToken("orange", "dark");
const PLAYER_MUTED = tintToken("foreground", "dark", 0.5);
const PLAYER_GRADIENT: [string, string] = [
  resolveToken("mind-violet", "dark"),
  resolveToken("mind-green", "dark"),
];

export type SessionStage = "intro" | "move" | "payoff" | "levelup";

export interface SessionCompletion {
  /**
   * The EFFECTIVE kinds the player actually showed, in order — so a locked-in
   * amplify is not reported as a breath. This is what `POST /api/mind/session`
   * takes (`{ tz, moves: [{ kind }] }`).
   */
  moves: { kind: string }[];
  /** Every answer the session collected, latest-per-question, in order. */
  answers: SessionAnswer[];
  /** The live check-in answer, or null when the member never named one. */
  liveState: MindState | null;
}

export interface LevelUpResult {
  chapter: number;
  newlyUnlocked: string[];
  currentChapter: { name?: string; theme?: string };
}

export interface SessionPlayerProps {
  plan: MindSessionPlan;
  /** Called when the member exits or finishes — the home refetches and closes. */
  onExit: () => void;
  /**
   * The context the plan was composed from. Supplying it is what lets the
   * session REALIGN to whatever the member reports on the live check-in; without
   * it the session is stuck on the state they felt last time.
   */
  sessionContext?: SessionContext;
  /** Dry run: scenes skip their own writes (no state log, no XP). */
  preview?: boolean;
  /** Seed the live state, so the breath protocol can be exercised directly. */
  initialLiveState?: MindState | null;
  /** Seam callback: the completion facts, with writes performed here (NP-101). */
  onComplete?: (completion: SessionCompletion) => void;
  /** Rendered as a full-screen modal; false closes it without unmounting. */
  visible?: boolean;
  testID?: string;
  /** Timezone offset in minutes west of UTC. Defaults to device local. */
  tz?: number;
  /** Explicit token override (falls back to useAuth when inside AuthProvider). */
  token?: string | null;
  /** Injection point for tests; the app leaves it unset (`useSafeAreaInsetsOrZero`). */
  insetsImpl?: () => { top: number; bottom: number; left: number; right: number };
}

/**
 * This `Modal` is bare (no navigator wraps it), so — exactly like
 * `BarcodeScanner`'s own `useSafeAreaInsetsOrZero` (NP-321) — it has to add
 * its own device insets rather than lean on a `SafeAreaView`, whose insets are
 * measured for the screen BEHIND this Modal's own native window. That gap is
 * what let the exit / back / progress row draw under the iOS status bar on
 * every stage.
 *
 * `useSafeAreaInsets` throws without a `SafeAreaProvider` above it in the
 * tree; the real app always has one (`app/_layout.tsx`), but this component's
 * tests don't wrap one. Falling back to zero insets there keeps this a no-op
 * in tests while fixing the real device.
 */
function useSafeAreaInsetsOrZero() {
  try {
    return useSafeAreaInsets();
  } catch {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

export const CHECK_IN_QUESTION = "How I checked in today";

export const MOVE_RECAP_LABEL: Record<string, string> = {
  "state-check": "Checked in honestly",
  breath: "Steadied your breathing",
  identity: "Affirmed who you are",
  win: "Banked a real win",
  challenge: "Faced the hard thing",
  mission: "Named your one move",
  vision: "Saw the future self",
  antisabotage: "Caught the pattern",
  social: "Pulled someone in",
  mirror: "Said it to your own face",
  choice: "Answered honestly",
  type: "Wrote it out word for word",
  speak: "Said it out loud",
  assemble: "Rebuilt the line",
  compose: "Made the words yours",
  acknowledge: "Told yourself the truth",
  interrogative: "Asked yourself straight",
  contrast: "Planned around the obstacle",
};

export const FEATURE_UNLOCK_LABEL: Record<string, string> = {
  coach: "Your coach is unlocked — talk it through any time.",
  becoming: "The Becoming is unlocked — your training log is live.",
};

export const PAYOFF_SEAL_MS = 1100;
export const PAYOFF_RECAP_STEP_MS = 500;
export const PAYOFF_RECAP_HOLD_MS = 400;
export const PAYOFF_SCORE_MS = 1000;

/**
 * Build the public, read-only viewer URL for a finished Mind session share.
 *
 * The viewer stays on the web (`/share/mind/[token]`, signed out, gated) — the
 * app only creates the link and hands it to the native share sheet. The
 * canonical domain is the same one every other native web link uses
 * (`WEBAPP_BASE_URL` in `@/lib/config`): the recipient opens the link in a
 * browser, where the web viewer prompts them to sign in to try the session.
 */
export function mindShareViewerUrl(
  share: Pick<MindShareResponse, "url">,
  baseUrl: string = WEBAPP_BASE_URL,
): string {
  return `${baseUrl.replace(/\/$/, "")}${share.url}`;
}

/**
 * Snapshot a finished session plan into a public, read-only share link
 * (`POST /api/mind/share { kind: 'session', title, plan }`, mirroring the web
 * payoff in `webapp/components/mind/session/SessionPlayer.tsx`), then open
 * React Native's `Share.share` with the web viewer URL. Never throws: a share
 * failure leaves the payoff exactly as it was.
 */
export async function shareMindSession(
  args: {
    title: string;
    plan: MindSessionPlan;
    token?: string | null;
  },
  deps: {
    postShare?: (body: unknown) => Promise<MindShareResponse>;
    openShareSheet?: (options: {
      message: string;
      title?: string;
    }) => Promise<unknown>;
    baseUrl?: string;
  } = {},
): Promise<MindShareResponse | null> {
  const postShare =
    deps.postShare ??
    ((body: unknown) =>
      apiFetch("/api/mind/share", MindShareResponseSchema, {
        baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
        getToken: () => args.token ?? undefined,
        method: "POST",
        body: body as Record<string, unknown>,
      }));
  const openShareSheet =
    deps.openShareSheet ?? ((options) => Share.share(options));

  let share: MindShareResponse;
  try {
    share = await postShare({
      kind: "session",
      title: args.title,
      plan: args.plan,
    });
  } catch {
    return null;
  }
  if (!share || typeof share.url !== "string" || share.url.length === 0) {
    return null;
  }
  const message = mindShareViewerUrl(share, deps.baseUrl ?? WEBAPP_BASE_URL);
  try {
    await openShareSheet({ message, title: "A Become session for you" });
  } catch {
    /* dismissed — the link was still created */
  }
  return share;
}

/** The effective move for a beat: the amplify alternative when locked in. */
export function effectiveMove(
  move: Move | undefined,
  liveState: MindState | null,
): Move | undefined {
  if (!move) return undefined;
  return move.altPositive && liveState === "locked_in" ? move.altPositive : move;
}

function useOptionalAuth(): { token: string | null } {
  try {
    return useAuth();
  } catch {
    return { token: null };
  }
}

export function SessionPlayer({
  plan: initialPlan,
  onExit,
  sessionContext,
  preview = false,
  initialLiveState = null,
  onComplete,
  visible = true,
  testID = "mind-session-player",
  tz,
  token: propToken,
  insetsImpl = useSafeAreaInsetsOrZero,
}: SessionPlayerProps) {
  const insets = insetsImpl();
  const reduceMotion = useReducedMotion();
  const auth = useOptionalAuth();
  const token = propToken !== undefined ? propToken : auth.token;

  const [stage, setStage] = useState<SessionStage>("intro");
  const [index, setIndex] = useState(0);
  const [liveState, setLiveState] = useState<MindState | null>(initialLiveState);
  // The plan can be REBUILT mid-session by the check-in, so it lives in state.
  const [plan, setPlan] = useState<MindSessionPlan>(initialPlan);
  const [realigned, setRealigned] = useState<string | null>(null);
  const [confirmingExit, setConfirmingExit] = useState(false);

  // Payoff state
  const [payoffPhase, setPayoffPhase] = useState(0);
  const [result, setResult] = useState<MindSessionCompleteResponse | null>(null);
  const [reflection, setReflection] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [levelUp, setLevelUp] = useState<LevelUpResult | null>(null);
  // Share state — the payoff's "Share this session" snapshots the finished
  // plan into a public, read-only web link (as the web payoff does), then
  // opens the native share sheet with it.
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);

  // The reflective answers given this session, deduped by question.
  const answersRef = useRef<SessionAnswer[]>([]);
  const liveStateRef = useRef<MindState | null>(initialLiveState);

  const total = plan.moves.length;
  const move = effectiveMove(plan.moves[index], liveState);

  // Recap items matching what was actually shown
  const recapItems = useMemo(
    () =>
      plan.moves
        .map((m) => effectiveMove(m, liveState) ?? m)
        .map((m) => MOVE_RECAP_LABEL[m.kind])
        .filter(Boolean),
    [plan.moves, liveState],
  );

  // Payoff animation progression
  useEffect(() => {
    if (stage !== "payoff") return;
    const recapMs =
      PAYOFF_RECAP_STEP_MS * recapItems.length + PAYOFF_RECAP_HOLD_MS;
    const t1 = setTimeout(() => setPayoffPhase(1), PAYOFF_SEAL_MS);
    const t2 = setTimeout(() => setPayoffPhase(2), PAYOFF_SEAL_MS + recapMs);
    const t3 = setTimeout(
      () => setPayoffPhase(3),
      PAYOFF_SEAL_MS + recapMs + PAYOFF_SCORE_MS,
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [stage, recapItems.length]);

  const skipPayoff = useCallback(() => setPayoffPhase(3), []);

  /**
   * The check-in just said how they actually feel. Rebuild the session around
   * THAT — the opening only (rule 1 above) — and record the answer (rule 2).
   */
  const onLiveState = useCallback(
    (state: MindState, feeling?: string) => {
      setLiveState(state);
      liveStateRef.current = state;
      const answers = answersRef.current;
      const answer: SessionAnswer = {
        q: CHECK_IN_QUESTION,
        a: feeling || state.replace("_", " "),
      };
      const at = answers.findIndex((x) => x.q === CHECK_IN_QUESTION);
      if (at >= 0) answers[at] = answer;
      else answers.unshift(answer);
      if (!sessionContext) return;
      const next = realignOpening(plan.openingId, state, sessionContext);
      if (!next) return;
      setPlan((prev) => {
        const opening = prev.moves[0];
        if (!opening) return prev;
        return {
          ...prev,
          moves: [opening, next.move, ...prev.moves.slice(2)],
          openingId: next.opening.id,
        };
      });
      setRealigned(next.opening.title);
      announce(`Rebuilt around how you just checked in. ${next.opening.title}`);
    },
    [plan.openingId, sessionContext],
  );

  const complete = useCallback(async () => {
    setStage("payoff");
    const state = liveStateRef.current;
    const effectiveMoves = plan.moves.map((m) => ({
      kind: (effectiveMove(m, state) ?? m).kind,
    }));
    const answers = [...answersRef.current];

    onComplete?.({
      moves: effectiveMoves,
      answers,
      liveState: state,
    });

    if (preview) {
      setResult({
        completions: 1,
        counted: false,
        trainingMode: false,
        xpAwarded: 0,
        levelXp: 0,
        level: 1,
        previousLevel: 1,
        leveledUp: false,
        levelProgress: { level: 1, pct: 0, intoLevel: 0, span: 100, xpToNext: 100 },
        chapter: 1,
        previousChapter: 1,
        chapterAdvanced: false,
        newlyUnlocked: [],
        unlockedSystems: [],
        currentChapter: CHAPTERS[0],
        mainSessionCount: 0,
        sessionsIntoChapter: { done: 0, needed: 10, toNext: 10 },
        nextMainSessionAt: Date.now(),
        xpBank: 0,
        streak: 0,
        featureUnlocks: [],
      });
      return;
    }

    const tzMinutes = tz ?? tzOffsetMinutes();

    // 1. Journal write (best effort)
    if (answers.length > 0) {
      const lines = answers.map((x) => ({ prompt: x.q, answer: x.a }));
      void apiFetch("/api/mind/journal", MindJournalCreateResponseSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        method: "POST",
        body: {
          system: "session",
          kind: "session",
          title: plan.intro.title,
          lines,
          ...(tzMinutes != null ? { tz: tzMinutes } : {}),
        },
      }).catch(() => {});

      // 2. Reflection through AI coach (hidden on failure)
      setReflecting(true);
      void Promise.resolve(reflectOnAnswers("Mind session", lines))
        .then((t) => setReflection(t && t.trim() ? t.trim() : null))
        .catch(() => setReflection(null))
        .finally(() => setReflecting(false));
    }

    // 3. Completion POST: XP, counters, chapter, streak
    try {
      const data = await apiFetch(
        "/api/mind/session",
        MindSessionCompleteResponseSchema,
        {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          method: "POST",
          body: {
            moves: effectiveMoves,
            ...(tzMinutes != null ? { tz: tzMinutes } : {}),
          },
        },
      );
      setResult(data);
    } catch {
      /* payoff still shows; XP is best-effort (as on web) */
    } finally {
      // 4. Drop cached AI plan and warm a fresh one (NP-102)
      void invalidateMindSession();
      void warmMindSession();
    }
  }, [plan.moves, plan.intro.title, preview, tz, token, onComplete]);

  const next = useCallback(
    (answer?: SessionAnswer) => {
      // Keep the LATEST value per question, so re-answering after a Back
      // overwrites instead of duplicating.
      if (answer?.a) {
        const answers = answersRef.current;
        const at = answers.findIndex((x) => x.q === answer.q);
        if (at >= 0) answers[at] = answer;
        else answers.push(answer);
      }
      if (index >= total - 1) void complete();
      else setIndex((i) => i + 1);
    },
    [index, total, complete],
  );

  // Step back one move (or back to the intro from the first move).
  const back = useCallback(() => {
    if (stage !== "move") return;
    if (index <= 0) {
      setStage("intro");
      return;
    }
    setIndex((i) => Math.max(0, i - 1));
  }, [stage, index]);

  const canGoBack = stage === "move";

  // Share the session just finished — snapshot the plan into a public,
  // read-only link (recipients open the web viewer signed out and sign in to
  // try it), then open the native share sheet with it. Lives on the payoff,
  // not the hub: you share a session after you've done it, as on the web.
  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const created = await shareMindSession({
        title: plan.intro.title,
        plan,
        token,
      });
      if (created) setShared(true);
    } finally {
      setSharing(false);
    }
  }, [sharing, plan, token]);

  const onHardwareBack = useCallback(() => {
    if (confirmingExit) {
      setConfirmingExit(false);
      return;
    }
    if (stage === "payoff" || stage === "levelup") {
      onExit();
      return;
    }
    if (canGoBack) {
      back();
      return;
    }
    setConfirmingExit(true);
  }, [confirmingExit, stage, canGoBack, back, onExit]);

  /** Resolve the breath protocol from the live check-in answer (`'auto'`). */
  const resolvedProtocol = useMemo<BreathProtocol | undefined>(() => {
    if (!move || move.kind !== "breath") return undefined;
    if (
      move.protocolId &&
      move.protocolId !== "auto" &&
      BREATH_PROTOCOLS[move.protocolId]
    ) {
      return BREATH_PROTOCOLS[move.protocolId];
    }
    return breathForState(liveState);
  }, [move, liveState]);

  const filledSegments =
    stage === "payoff" || stage === "levelup" ? total : stage === "move" ? index : 0;

  return (
    <RNModal
      testID={testID}
      visible={visible}
      animationType={modalAnimation("fade", reduceMotion)}
      onRequestClose={onHardwareBack}
    >
      <View
        testID={`${testID}-root`}
        className="flex-1 bg-black"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {/* Top bar: exit + back + progress segments — the web's fixed dark
            chrome, padded by the REAL device inset above rather than a
            `SafeAreaView` (see `useSafeAreaInsetsOrZero`). */}
        <View className="flex-row items-center gap-3 px-4 pt-3">
          <Pressable
            testID={`${testID}-exit`}
            accessibilityRole="button"
            accessibilityLabel="Exit session"
            onPress={() =>
              stage === "payoff" || stage === "levelup"
                ? onExit()
                : setConfirmingExit(true)
            }
            style={minTouchTarget}
            className="items-center justify-center rounded-full bg-white/10"
          >
            <X size={18} color={PLAYER_WHITE} />
          </Pressable>
          {canGoBack ? (
            <Pressable
              testID={`${testID}-back`}
              accessibilityRole="button"
              accessibilityLabel="Previous move"
              onPress={back}
              style={minTouchTarget}
              className="items-center justify-center rounded-full bg-white/10"
            >
              <ArrowLeft size={18} color={PLAYER_WHITE} />
            </Pressable>
          ) : null}
          <View className="flex-1 flex-row gap-1.5">
            {plan.moves.map((m, i) => (
              <View
                key={`${m.id}-${i}`}
                testID={`${testID}-progress-${i}`}
                accessible={false}
                importantForAccessibility="no"
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/15"
              >
                <LinearGradient
                  testID={`${testID}-progress-${i}-fill`}
                  colors={PLAYER_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    height: "100%",
                    borderRadius: 999,
                    width:
                      i < filledSegments
                        ? "100%"
                        : i === filledSegments && stage === "move"
                          ? "33%"
                          : 0,
                  }}
                />
              </View>
            ))}
          </View>
        </View>

        {/* Realignment notice — sits on the root's black, same as the top bar. */}
        {realigned && stage === "move" && index === 1 ? (
          <View
            testID={`${testID}-realigned`}
            accessibilityLiveRegion="polite"
            className="mx-4 mt-2.5 rounded-full bg-white/10 px-3 py-1.5"
          >
            <Text className="text-center text-xs font-semibold text-white/70">
              Rebuilt around how you just checked in · {realigned}
            </Text>
          </View>
        ) : null}

        {/* Stage. `move` gets its own themed `bg-background` so the scene it
            hosts (StateCheckScene, BreathScene, …) stays exactly as legible as
            it always was — those are separate, system-following surfaces
            (NP-098/123) that this card does not touch. Every other stage has
            no background of its own, so the root's forced black shows through,
            matching the web's fixed `bg-black` stage. */}
        <View
          testID={`${testID}-stage`}
          className={stage === "move" ? "flex-1 bg-background" : "flex-1"}
        >
          {stage === "intro" ? (
            <View
              testID={`${testID}-intro`}
              className="flex-1 items-center justify-center px-6"
            >
              <LinearGradient
                colors={PLAYER_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  height: 56,
                  width: 56,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Sparkles size={28} color={PLAYER_WHITE} />
              </LinearGradient>
              <Text
                testID={`${testID}-intro-title`}
                className="text-center text-3xl font-extrabold text-white"
              >
                {plan.intro.title}
              </Text>
              <Text className="mt-3 max-w-xs text-center text-white/60">
                {plan.intro.subtitle}
              </Text>
              <Text className="mt-6 text-xs uppercase tracking-widest text-white/40">
                {total} moves · ~3 min
              </Text>
              <Pressable
                testID={`${testID}-intro-begin`}
                accessibilityRole="button"
                accessibilityLabel="Begin"
                onPress={() => setStage("move")}
                style={minTouchTarget}
                className="mt-10 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4"
              >
                <Text className="text-base font-bold text-black">Begin</Text>
                <ArrowRight size={20} color={PLAYER_BLACK} />
              </Pressable>
            </View>
          ) : null}

          {stage === "move" && move ? (
            <View
              key={`move-${index}-${move.id}`}
              testID={`${testID}-move-${index}`}
              className="flex-1"
            >
              {move.kind === "state-check" ? (
                <StateCheckScene
                  move={move}
                  onState={onLiveState}
                  onDone={next}
                  preview={preview}
                />
              ) : move.kind === "breath" ? (
                <BreathScene
                  move={move}
                  protocol={resolvedProtocol}
                  onDone={next}
                  preview={preview}
                />
              ) : move.kind === "identity" ? (
                <IdentityScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "challenge" ? (
                <ChallengeScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "win" ? (
                <WinScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "mission" ? (
                <MissionScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "vision" ? (
                <VisionScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "antisabotage" ? (
                <PatternScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "social" ? (
                <SocialScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "choice" ||
                move.kind === "acknowledge" ||
                move.kind === "interrogative" ? (
                <ChoiceScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "type" ? (
                <TypeScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "assemble" ? (
                <AssembleScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "compose" ? (
                <ComposeScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "contrast" ? (
                <ContrastScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "speak" ? (
                <SpeakScene move={move} onDone={next} preview={preview} />
              ) : move.kind === "mirror" ? (
                <MirrorScene move={move} onDone={next} preview={preview} />
              ) : (
                <HoldToAffirmScene move={move} onDone={next} preview={preview} />
              )}
            </View>
          ) : null}

          {stage === "payoff" ? (
            <ScrollView
              testID={`${testID}-payoff`}
              contentContainerStyle={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 32,
                paddingHorizontal: 24,
                flexGrow: 1,
              }}
              className="flex-1 w-full"
            >
              <Pressable
                onPress={payoffPhase < 3 ? skipPayoff : undefined}
                className="w-full max-w-sm items-center justify-center"
              >
                {/* Seal checkmark */}
                <LinearGradient
                  colors={PLAYER_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    height: 80,
                    width: 80,
                    borderRadius: 40,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 20,
                  }}
                >
                  <Check size={40} color={PLAYER_WHITE} />
                </LinearGradient>

                {/* Title */}
                <Text
                  testID={`${testID}-payoff-title`}
                  className="text-center text-2xl font-extrabold text-white"
                >
                  {result?.leveledUp
                    ? "Level up."
                    : result?.trainingMode
                      ? "Another rep in."
                      : plan.doneText ?? "You showed up."}
                </Text>

                {/* Subtitle */}
                <Text
                  testID={`${testID}-payoff-subtitle`}
                  className="mt-2 text-center text-white/60"
                >
                  {result?.leveledUp
                    ? `You climbed to Level ${result.level}.`
                    : "That's how it's built — one rep at a time."}
                </Text>

                {/* Recap of beats */}
                {payoffPhase >= 1 ? (
                  <View
                    testID={`${testID}-payoff-recap`}
                    className="mt-5 w-full max-w-xs gap-1.5"
                  >
                    {recapItems.map((label, i) => (
                      <View
                        key={`${label}-${i}`}
                        testID={`${testID}-payoff-recap-${i}`}
                        className="flex-row items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2"
                      >
                        <Check size={14} color={PLAYER_GREEN} strokeWidth={3} />
                        <Text className="text-xs font-medium text-white/75">
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Adaptive reflection */}
                {payoffPhase >= 3 && (reflecting || reflection) ? (
                  <View
                    testID={
                      reflecting
                        ? `${testID}-payoff-reflecting`
                        : `${testID}-payoff-reflection`
                    }
                    className="mt-5 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    {reflecting ? (
                      <View className="flex-row items-center justify-center gap-2.5 py-2">
                        <ActivityIndicator size="small" color={PLAYER_MUTED} />
                        <Text className="text-sm text-white/50">
                          Reading what you said…
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                          Here&apos;s what I see
                        </Text>
                        <Text
                          testID={`${testID}-payoff-reflection-text`}
                          className="mt-1.5 text-sm leading-relaxed text-white/80"
                        >
                          {reflection}
                        </Text>
                      </>
                    )}
                  </View>
                ) : null}

                {/* XP pill */}
                {payoffPhase >= 2 && result && (result.xpAwarded ?? 0) > 0 ? (
                  <View
                    testID={`${testID}-payoff-xp`}
                    className="mt-4 rounded-full bg-white/10 px-4 py-1.5"
                  >
                    <Text className="text-sm font-bold text-green-300">
                      +{result.xpAwarded} XP
                    </Text>
                  </View>
                ) : null}

                {/* Level progress bar */}
                {payoffPhase >= 2 && result?.level != null ? (
                  <View
                    testID={`${testID}-payoff-level`}
                    className="mt-4 w-full max-w-xs"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text
                        testID={`${testID}-payoff-level-label`}
                        className={`text-xs font-semibold ${
                          result.leveledUp ? "text-violet-300" : "text-white/70"
                        }`}
                      >
                        Level {result.level}
                      </Text>
                      {result.levelProgress ? (
                        <Text
                          testID={`${testID}-payoff-level-xp-next`}
                          className="text-xs text-white/40"
                        >
                          {result.levelProgress.xpToNext} XP to next
                        </Text>
                      ) : null}
                    </View>
                    <View className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/15">
                      <LinearGradient
                        testID={`${testID}-payoff-level-bar`}
                        colors={PLAYER_GRADIENT}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{
                          height: "100%",
                          borderRadius: 999,
                          width: `${Math.min(
                            100,
                            Math.max(0, result.levelProgress?.pct ?? 0),
                          )}%`,
                        }}
                      />
                    </View>
                  </View>
                ) : null}

                {/* Cooldown note */}
                {payoffPhase >= 2 && result?.trainingMode ? (
                  <Text
                    testID={`${testID}-payoff-cooldown-note`}
                    className="mt-3 max-w-xs text-center text-xs text-white/40"
                  >
                    You&apos;re in cooldown — this rep leveled you up but didn&apos;t count toward your chapter.
                  </Text>
                ) : null}

                {/* Feature unlocks */}
                {payoffPhase >= 2 &&
                  (result?.featureUnlocks ?? []).map((f) => (
                    <View
                      key={f}
                      testID={`${testID}-payoff-feature-unlock-${f}`}
                      className="mt-3 flex-row items-center gap-1.5 rounded-full bg-amber-400/15 px-3.5 py-1.5"
                    >
                      <Sparkles size={14} color={PLAYER_AMBER} />
                      <Text className="text-xs font-semibold text-amber-300">
                        {FEATURE_UNLOCK_LABEL[f] ?? f}
                      </Text>
                    </View>
                  ))}

                {/* Streak */}
                {payoffPhase >= 2 &&
                  result &&
                  typeof result.streak === "number" &&
                  result.streak > 1 ? (
                    <View
                      testID={`${testID}-payoff-streak`}
                      className="mt-3 flex-row items-center gap-1.5"
                    >
                      <Flame size={16} color={PLAYER_ORANGE} />
                      <Text className="text-sm font-semibold text-orange-300">
                        {result.streak}-day streak
                      </Text>
                    </View>
                  ) : null}

                {/* Action buttons */}
                {payoffPhase < 3 ? null : result?.chapterAdvanced ? (
                  <View className="w-full items-center">
                    <Pressable
                      testID={`${testID}-payoff-chapter-unlock`}
                      accessibilityRole="button"
                      accessibilityLabel="New chapter unlocked"
                      onPress={() => {
                        if (result.currentChapter) {
                          setLevelUp({
                            chapter: result.chapter ?? 0,
                            newlyUnlocked: result.newlyUnlocked ?? [],
                            currentChapter: result.currentChapter,
                          });
                          setStage("levelup");
                        } else {
                          onExit();
                        }
                      }}
                      style={minTouchTarget}
                      className="mt-8 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-amber-400 py-4"
                    >
                      <ChevronUp size={20} color={PLAYER_BLACK} />
                      <Text className="text-base font-bold text-black">
                        New chapter unlocked
                      </Text>
                    </Pressable>
                    <Pressable
                      testID={`${testID}-payoff-later`}
                      accessibilityRole="button"
                      accessibilityLabel="Later"
                      onPress={onExit}
                      style={minTouchTarget}
                      className="mt-3 items-center justify-center py-2"
                    >
                      <Text className="text-sm font-medium text-white/50">
                        Later
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="w-full items-center">
                    <Pressable
                      testID={`${testID}-payoff-done`}
                      accessibilityRole="button"
                      accessibilityLabel="Done for now"
                      onPress={onExit}
                      style={minTouchTarget}
                      className="mt-8 w-full max-w-xs flex-row items-center justify-center rounded-2xl bg-white py-4"
                    >
                      <Text className="text-base font-bold text-black">
                        Done for now
                      </Text>
                    </Pressable>
                    {/* Share the session just finished (not one not yet started). */}
                    {preview ? null : (
                      <Pressable
                        testID={`${testID}-payoff-share`}
                        accessibilityRole="button"
                        accessibilityLabel="Share this session"
                        accessibilityState={{ disabled: sharing }}
                        disabled={sharing}
                        onPress={() => void handleShare()}
                        style={minTouchTarget}
                        className="mt-3 flex-row items-center justify-center gap-1.5 py-2"
                      >
                        <Share2 size={14} color={PLAYER_MUTED} />
                        <Text className="text-xs font-medium text-white/40">
                          {sharing
                            ? "Creating link…"
                            : shared
                              ? "Link ready — shared"
                              : "Share this session"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </Pressable>
            </ScrollView>
          ) : null}

          {stage === "levelup" && levelUp ? (
            <ScrollView
              testID={`${testID}-levelup`}
              contentContainerStyle={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 32,
                paddingHorizontal: 24,
                flexGrow: 1,
              }}
              className="flex-1 w-full"
            >
              <Text className="text-xs font-semibold uppercase tracking-widest text-amber-300">
                Chapter {levelUp.chapter} unlocked
              </Text>
              <Text
                testID={`${testID}-levelup-title`}
                className="mt-3 text-center text-3xl font-extrabold text-white"
              >
                {levelUp.currentChapter?.name ??
                  CHAPTERS[levelUp.chapter - 1]?.name}
              </Text>
              <Text
                testID={`${testID}-levelup-theme`}
                className="mt-2 text-center text-sm text-white/60 max-w-xs"
              >
                {levelUp.currentChapter?.theme ??
                  CHAPTERS[levelUp.chapter - 1]?.theme}
              </Text>

              {levelUp.newlyUnlocked.length > 0 ? (
                <View
                  testID={`${testID}-levelup-tools`}
                  className="mt-8 w-full max-w-xs"
                >
                  <Text className="mb-3 text-xs uppercase tracking-widest text-white/40 text-center">
                    New tools
                  </Text>
                  <View className="gap-2">
                    {levelUp.newlyUnlocked.map((id) => (
                      <View
                        key={id}
                        testID={`${testID}-levelup-tool-${id}`}
                        className="flex-row items-center gap-2 rounded-xl bg-white/10 px-4 py-3"
                      >
                        <Sparkles size={16} color={PLAYER_AMBER} />
                        <Text className="text-sm font-semibold text-white">
                          {SYSTEM_INFO[id]?.label ?? id}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <Pressable
                testID={`${testID}-levelup-enter`}
                accessibilityRole="button"
                accessibilityLabel="Enter"
                onPress={onExit}
                style={minTouchTarget}
                className="mt-10 w-full max-w-xs flex-row items-center justify-center rounded-2xl bg-white py-4"
              >
                <Text className="text-base font-bold text-black">Enter</Text>
              </Pressable>
            </ScrollView>
          ) : null}
        </View>

        {/* Leaving mid-session confirmation dialog — themed (not forced dark):
            a native-only safeguard the web doesn't have, so it keeps following
            the system scheme like every other dialog in the app. */}
        {confirmingExit ? (
          <View
            testID={`${testID}-exit-dialog`}
            accessibilityViewIsModal
            onAccessibilityEscape={() => setConfirmingExit(false)}
            className="absolute inset-0 items-center justify-center bg-background/95 px-6"
          >
            <View className="w-full max-w-xs rounded-2xl border border-border bg-card p-5">
              <Text
                accessibilityRole="header"
                className="text-lg font-bold text-foreground"
              >
                Leave the session?
              </Text>
              <Text className="mt-2 text-sm text-muted-foreground">
                {stage === "move"
                  ? `You are ${index + 1} of ${total} moves in. Leaving now drops what you have not finished.`
                  : "The session is composed and waiting. Leaving now drops it."}
              </Text>
              <Pressable
                testID={`${testID}-exit-confirm`}
                accessibilityRole="button"
                accessibilityLabel="Leave the session"
                onPress={onExit}
                style={minTouchTarget}
                className="mt-5 items-center justify-center rounded-2xl bg-destructive py-3.5"
              >
                <Text className="text-base font-bold text-destructive-foreground">
                  Leave
                </Text>
              </Pressable>
              <Pressable
                testID={`${testID}-exit-cancel`}
                accessibilityRole="button"
                accessibilityLabel="Stay in session"
                onPress={() => setConfirmingExit(false)}
                style={minTouchTarget}
                className="mt-2.5 items-center justify-center py-2"
              >
                <Text className="text-sm font-medium text-muted-foreground">
                  Stay
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </RNModal>
  );
}
