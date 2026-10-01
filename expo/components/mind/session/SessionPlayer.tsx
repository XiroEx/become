import { useCallback, useMemo, useRef, useState } from "react";
import { Modal as RNModal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react-native";
import {
  BREATH_PROTOCOLS,
  breathForState,
  realignOpening,
  type BreathProtocol,
  type MindSessionPlan,
  type MindState,
  type Move,
  type SessionAnswer,
  type SessionContext,
} from "@become/core";
import { Text } from "@/components/Text";
import { BreathScene } from "@/components/mind/session/scenes/BreathScene";
import { HoldToAffirmScene } from "@/components/mind/session/scenes/HoldToAffirmScene";
import { StateCheckScene } from "@/components/mind/session/scenes/StateCheckScene";
import { announce } from "@/lib/a11y/announce";
import { modalAnimation, useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * THE MIND SESSION PLAYER, natively (NP-098).
 *
 * A port of `webapp/components/mind/session/SessionPlayer.tsx`: a composed plan
 * is an ordered chain of MOVES, and this plays it one full-screen beat at a time
 * — intro → the moves, with back / next / exit → the payoff. The scenes are
 * dumb (`scenes/types.ts`, the web's `SceneProps`); everything that sequences,
 * adapts or remembers lives here, which is the same split the web has.
 *
 * The four rules that travel with it, each of them behaviour the web has and a
 * native session would otherwise lose:
 *
 *  1. **The check-in re-opens the session, and only the OPENING.** The plan was
 *     composed before it was played (the AI plan is cached for hours), so it was
 *     built for whatever they felt LAST time. `realignOpening` swaps move 2 — the
 *     regulate beat — for the one today's answer calls for, and the path body
 *     survives untouched, along with every word the composer personalised into
 *     it. No `sessionContext`, no realignment: the session simply plays as
 *     composed.
 *  2. **The check-in IS the first answer** ("How I checked in today"), recorded
 *     ahead of everything else. The state/path split moved the guaranteed
 *     answer-producing beat out of the session, so a breath opening plus a
 *     non-typing body used to leave the close with nothing to read.
 *  3. **Answers keep the LATEST value per question**, so re-answering after a
 *     Back overwrites rather than duplicating.
 *  4. **A positive check-in skips the forced breathing.** A move carrying
 *     `altPositive` is swapped for it while the live state is `locked_in` — the
 *     amplify alternative — and the swap is what the player reports, so a
 *     locked-in session is never recorded as having breathed.
 *
 * WHAT IS NOT HERE YET, on purpose: the payoff is the shortest honest close
 * (NP-101 owns the recap, the XP, the streak, the journal write and the AI
 * reflection — this file performs NO completion write, and `onComplete` is the
 * seam it will hang off). The content scenes are NP-103, speech is NP-099 and the
 * mirror is NP-100; until each lands, its kind plays as the web's hold-to-affirm,
 * so every plan recorded on the web plays through to the end rather than
 * stranding the member on a beat with no scene.
 */

export type SessionStage = "intro" | "move" | "payoff";

export interface SessionCompletion {
  /**
   * The EFFECTIVE kinds the player actually showed, in order — so a locked-in
   * amplify is not reported as a breath. This is what `POST /api/mind/session`
   * takes (`{ tz, moves: [{ kind }] }`) when NP-101 wires it up.
   */
  moves: { kind: string }[];
  /** Every answer the session collected, latest-per-question, in order. */
  answers: SessionAnswer[];
  /** The live check-in answer, or null when the member never named one. */
  liveState: MindState | null;
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
  /** NP-101's seam: the completion facts, with no write performed here. */
  onComplete?: (completion: SessionCompletion) => void;
  /** Rendered as a full-screen modal; false closes it without unmounting. */
  visible?: boolean;
  testID?: string;
}

/** The effective move for a beat: the amplify alternative when locked in. */
export function effectiveMove(
  move: Move | undefined,
  liveState: MindState | null,
): Move | undefined {
  if (!move) return undefined;
  return move.altPositive && liveState === "locked_in" ? move.altPositive : move;
}

/** The question the check-in answer is filed under. The web's exact words. */
export const CHECK_IN_QUESTION = "How I checked in today";

export function SessionPlayer({
  plan: initialPlan,
  onExit,
  sessionContext,
  preview = false,
  initialLiveState = null,
  onComplete,
  visible = true,
  testID = "mind-session-player",
}: SessionPlayerProps) {
  const { colors } = useThemeTokens();
  const reduceMotion = useReducedMotion();

  const [stage, setStage] = useState<SessionStage>("intro");
  const [index, setIndex] = useState(0);
  const [liveState, setLiveState] = useState<MindState | null>(initialLiveState);
  // The plan can be REBUILT mid-session by the check-in, so it lives in state.
  const [plan, setPlan] = useState<MindSessionPlan>(initialPlan);
  const [realigned, setRealigned] = useState<string | null>(null);
  const [confirmingExit, setConfirmingExit] = useState(false);

  // The reflective answers given this session, deduped by question. NP-101
  // persists them to MindJournal so the next session can build on them.
  const answersRef = useRef<SessionAnswer[]>([]);
  // The same value as `liveState`, readable at CALL time. A scene may report the
  // state and advance in the same tick (the check-in's "Welcome back" does
  // exactly that), and a session whose last move is the check-in would otherwise
  // be completed with the state it had BEFORE the member answered.
  const liveStateRef = useRef<MindState | null>(initialLiveState);

  const total = plan.moves.length;
  const move = effectiveMove(plan.moves[index], liveState);

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

  const complete = useCallback(() => {
    setStage("payoff");
    const state = liveStateRef.current;
    onComplete?.({
      // The EFFECTIVE kinds, so a locked-in amplify is never reported as breath.
      moves: plan.moves.map((m) => ({
        kind: (effectiveMove(m, state) ?? m).kind,
      })),
      answers: [...answersRef.current],
      liveState: state,
    });
  }, [plan.moves, onComplete]);

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
      if (index >= total - 1) complete();
      else setIndex((i) => i + 1);
    },
    [index, total, complete],
  );

  // Step back one move (or back to the intro from the first move). The scene is
  // keyed by its position, so going back RE-MOUNTS it fresh: the member can redo
  // a beat instead of being locked forward.
  const back = useCallback(() => {
    if (stage !== "move") return;
    if (index <= 0) {
      setStage("intro");
      return;
    }
    setIndex((i) => Math.max(0, i - 1));
  }, [stage, index]);

  const canGoBack = stage === "move";

  /**
   * The Android hardware back button. A visible React Native Modal consumes the
   * press itself and delivers it here as `onRequestClose`, which is why there is
   * no `BackHandler` subscription: a listener underneath would fire as well and
   * the session would jump back two beats.
   *
   * It never closes the session silently — that is the one thing a back press
   * must not do, because a half-played session is work the member cannot get
   * back. It cancels the confirmation, then steps back a move, and only asks to
   * leave when there is nowhere left to step.
   */
  const onHardwareBack = useCallback(() => {
    if (confirmingExit) {
      setConfirmingExit(false);
      return;
    }
    if (stage === "payoff") {
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

  const filledSegments = stage === "payoff" ? total : stage === "move" ? index : 0;

  return (
    <RNModal
      testID={testID}
      visible={visible}
      animationType={modalAnimation("fade", reduceMotion)}
      onRequestClose={onHardwareBack}
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        {/* Top bar: exit + back + progress segments */}
        <View className="flex-row items-center gap-3 px-4 pt-3">
          <Pressable
            testID={`${testID}-exit`}
            accessibilityRole="button"
            accessibilityLabel="Exit session"
            // Nothing is at stake once the session is finished, so the payoff's
            // X is just a close. Anywhere else it asks.
            onPress={() => (stage === "payoff" ? onExit() : setConfirmingExit(true))}
            style={minTouchTarget}
            className="items-center justify-center rounded-full bg-muted"
          >
            <X size={18} color={colors.foreground} />
          </Pressable>
          {canGoBack ? (
            <Pressable
              testID={`${testID}-back`}
              accessibilityRole="button"
              accessibilityLabel="Previous move"
              onPress={back}
              style={minTouchTarget}
              className="items-center justify-center rounded-full bg-muted"
            >
              <ArrowLeft size={18} color={colors.foreground} />
            </Pressable>
          ) : null}
          <View className="flex-1 flex-row gap-1.5">
            {plan.moves.map((m, i) => (
              <View
                key={`${m.id}-${i}`}
                testID={`${testID}-progress-${i}`}
                accessible={false}
                importantForAccessibility="no"
                className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <View
                  className="h-full rounded-full bg-primary"
                  style={{
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

        {/* The check-in changed the session, so say so. Being told "we rebuilt
            this around what you just said" is the whole point of asking. */}
        {realigned && stage === "move" && index === 1 ? (
          <View
            testID={`${testID}-realigned`}
            accessibilityLiveRegion="polite"
            className="mx-4 mt-2.5 rounded-full bg-muted px-3 py-1.5"
          >
            <Text className="text-center text-xs font-semibold text-muted-foreground">
              Rebuilt around how you just checked in · {realigned}
            </Text>
          </View>
        ) : null}

        {/* Stage */}
        <View className="flex-1">
          {stage === "intro" ? (
            <View
              testID={`${testID}-intro`}
              className="flex-1 items-center justify-center px-6"
            >
              <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-primary">
                <Sparkles size={28} color={colors["primary-foreground"]} />
              </View>
              <Text
                testID={`${testID}-intro-title`}
                className="text-center text-3xl font-extrabold text-foreground"
              >
                {plan.intro.title}
              </Text>
              <Text className="mt-3 max-w-xs text-center text-muted-foreground">
                {plan.intro.subtitle}
              </Text>
              <Text className="mt-6 text-xs uppercase tracking-widest text-muted-foreground">
                {total} moves · ~3 min
              </Text>
              <Pressable
                testID={`${testID}-intro-begin`}
                accessibilityRole="button"
                accessibilityLabel="Begin"
                onPress={() => setStage("move")}
                style={minTouchTarget}
                className="mt-10 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4"
              >
                <Text className="text-base font-bold text-primary-foreground">
                  Begin
                </Text>
                <ArrowRight size={20} color={colors["primary-foreground"]} />
              </Pressable>
            </View>
          ) : null}

          {stage === "move" && move ? (
            // Keyed by POSITION as well as id, so stepping back re-mounts the
            // previous scene fresh rather than restoring the state it ended in.
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
              ) : (
                // Not ported yet (NP-103 / NP-099 / NP-100): the web's
                // hold-to-affirm, so the chain always plays to the end.
                <HoldToAffirmScene move={move} onDone={next} preview={preview} />
              )}
            </View>
          ) : null}

          {stage === "payoff" ? (
            // The SHORT close. NP-101 replaces this with the web's full payoff —
            // the recap of the beats, XP, the level bar, the streak, the chapter
            // unlock and the AI reflection — and with the writes that earn them.
            <View
              testID={`${testID}-payoff`}
              className="flex-1 items-center justify-center px-6"
            >
              <View className="mb-5 h-20 w-20 items-center justify-center rounded-full bg-primary">
                <Check size={40} color={colors["primary-foreground"]} />
              </View>
              <Text
                testID={`${testID}-payoff-title`}
                className="text-center text-2xl font-extrabold text-foreground"
              >
                {plan.doneText ?? "You showed up."}
              </Text>
              <Text className="mt-2 text-center text-muted-foreground">
                That&apos;s how it&apos;s built — one rep at a time.
              </Text>
              <Pressable
                testID={`${testID}-payoff-done`}
                accessibilityRole="button"
                accessibilityLabel="Done for now"
                onPress={onExit}
                style={minTouchTarget}
                className="mt-10 w-full max-w-xs flex-row items-center justify-center rounded-2xl bg-primary py-4"
              >
                <Text className="text-base font-bold text-primary-foreground">
                  Done for now
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Leaving mid-session throws the session away, so it is asked about
            rather than done. An overlay and not a nested RN Modal: two modals on
            Android fight over the back press, which is the gesture this dialog
            exists to answer. */}
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
                accessibilityLabel="Keep going"
                onPress={() => setConfirmingExit(false)}
                style={minTouchTarget}
                className="mt-2 items-center justify-center rounded-2xl py-3"
              >
                <Text className="text-base font-semibold text-foreground">
                  Keep going
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </RNModal>
  );
}

export default SessionPlayer;
