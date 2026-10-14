/**
 * ─── THE NATIVE COACH-MARK TOUR (NP-207) ──────────────────────────────────
 *
 * The spec (`expo/gap_analysis/NP-207-native-guided-tour.md`) and the decision
 * it carries out (NP-164, Jon Don, 2026-10-08: "there should be one simple
 * tour that bring you throught each main hub of our app ... but if someone
 * doesnt want to do a turtorial they should be able to"). `@redbtn/redtutorial`
 * is a DOM spotlight library with no React Native renderer (the web's own
 * `TutorialRoot.tsx`), so this is NOT a port of it — it is a from-scratch,
 * lightweight sequence of centered coach cards, one per hub, with its own
 * progress key and its own upfront decline.
 *
 * MOUNTED ONCE, inside `app/(app)/_layout.tsx`'s `OnboardingGuard` — the same
 * spot as `HealthSyncBridge` / `MindSessionWarmer` / `PushSyncBridge`, which is
 * why it is a sibling of the tab `<Stack>` rather than something a single hub
 * screen renders: it needs to navigate BETWEEN hubs as the member steps
 * through, and it must survive the member landing on any one of them first.
 *
 * NEVER BLOCKS. It starts in `"loading"` (renders null) and reads progress
 * from storage asynchronously; the `<Stack>` / tabs beneath it mount and paint
 * on the very same tick regardless of what that read resolves to or how long
 * it takes (NP-207: "No native screen or modal delays rendering or waits for
 * tour completion"). The daily check-in and program nudge do not even know
 * this component exists.
 *
 * SETTLES ONCE. "Nah, I'm good" upfront, a dismiss mid-step, or finishing the
 * last hub are all equally settled (`setNativeTourStatus`) and the tour will
 * not show itself again on its own. The only way back in is
 * `requestNativeTourReplay()` — Settings' "Take the app tour" button.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import { NATIVE_TOUR_HUBS } from "@/lib/tour/tourConfig";
import {
  getNativeTourProgress,
  hasSettledNativeTour,
  setNativeTourStatus,
} from "@/lib/tour/nativeTourProgress";
import { subscribeNativeTourReplayRequests } from "@/lib/tour/nativeTourRequest";

/** `tourConfig.ts` exports `NATIVE_TOUR_HUBS` as a readonly tuple, not a named type. */
type NativeTourHub = (typeof NATIVE_TOUR_HUBS)[number];

type Phase = "loading" | "prompt" | "touring" | "hidden";

export interface NativeTourOverlayProps {
  /** DI for tests. Defaults to every main hub, in the spec's order. */
  hubs?: readonly NativeTourHub[];
  /** DI for tests — defaults to the AsyncStorage-backed store. */
  storage?: AsyncStorageLike;
  /**
   * Test-only hook, fired once the initial async progress read resolves and
   * this settles into `"prompt"` or `"hidden"`. Production never passes it —
   * there is nothing for the app itself to do with "the tour finished
   * loading" that is not already expressed by the overlay rendering or not.
   */
  onLoaded?: (phase: "prompt" | "hidden") => void;
  testID?: string;
}

/**
 * `tourConfig.ts`'s `tabRoute` field spells out the full file-system path
 * (`/(app)/(tabs)/dashboard`) for documentation. The href expo-router actually
 * resolves drops the pathless `(app)` group entirely — every one of the
 * dozens of `router.push("/(tabs)/…")` call sites across this app agrees on
 * that (`dashboard/index.tsx`, `onboarding.tsx`, `ProfileScreen.tsx`, …), so
 * this is the literal href, not `hub.tabRoute`.
 */
function hrefForHub(hub: NativeTourHub): string {
  return `/(tabs)/${hub.id}`;
}

export function NativeTourOverlay({
  hubs = NATIVE_TOUR_HUBS,
  storage,
  onLoaded,
  testID = "native-tour",
}: NativeTourOverlayProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [stepIndex, setStepIndex] = useState(0);
  // Guards the initial async load against StrictMode's double-invoke.
  const loadStarted = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    void (async () => {
      const progress = await getNativeTourProgress(storage);
      const next = hasSettledNativeTour(progress) ? "hidden" : "prompt";
      setPhase(next);
      onLoadedRef.current?.(next);
    })();
    // storage is a stable DI seam, not a reactive dependency — it has no
    // reason to change identity across the life of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settings/Help's "ask again" escape hatch — the tour's one re-prompt path.
  useEffect(() => {
    return subscribeNativeTourReplayRequests(() => {
      setStepIndex(0);
      setPhase("prompt");
    });
  }, []);

  // Each step change (and entering "touring" at step 0) switches to that
  // hub's tab so the member actually sees what the coach card is about.
  // `replace`, not `push`: the member did not navigate — the tour did. A
  // push per step would stack one history entry per hub visited (four extra
  // entries behind a member who walks all five hubs to Profile, more on
  // every Back-and-forward), and settling only writes progress without
  // unwinding them, so the next back gesture would walk backwards through
  // the tour instead of leaving the hub. Replacing keeps the back stack
  // exactly as the member left it.
  useEffect(() => {
    if (phase !== "touring") return;
    const hub = hubs[stepIndex];
    if (!hub) return;
    router.replace(hrefForHub(hub) as never);
  }, [phase, stepIndex, hubs, router]);

  const settle = useCallback(
    (status: "completed" | "declined" | "dismissed") => {
      setPhase("hidden");
      void setNativeTourStatus(status, storage);
    },
    [storage],
  );

  const onWalkThrough = useCallback(() => {
    setStepIndex(0);
    setPhase("touring");
  }, []);

  const onDecline = useCallback(() => settle("declined"), [settle]);
  const onDismiss = useCallback(() => settle("dismissed"), [settle]);

  const onNext = useCallback(() => {
    setStepIndex((current) => {
      if (current >= hubs.length - 1) {
        settle("completed");
        return current;
      }
      return current + 1;
    });
  }, [hubs.length, settle]);

  const onBack = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  if (phase === "loading" || phase === "hidden") return null;

  if (phase === "prompt") {
    return (
      <Modal
        visible
        onClose={onDecline}
        title="See your way around?"
        testID={`${testID}-prompt`}
        accessibilityLabel="Take the app tour"
      >
        <Text
          testID={`${testID}-prompt-body`}
          className="text-muted-foreground text-sm leading-5 mb-4"
        >
          A quick walk through Dashboard, Training, Nutrition, Mind and
          Profile — just the basics, less than a minute.
        </Text>
        <View style={{ gap: 8 }}>
          <Button
            testID={`${testID}-prompt-walkthrough`}
            onPress={onWalkThrough}
          >
            Walk me through
          </Button>
          <Button
            testID={`${testID}-prompt-decline`}
            variant="ghost"
            onPress={onDecline}
          >
            Nah, I&apos;m good
          </Button>
        </View>
      </Modal>
    );
  }

  const hub = hubs[stepIndex];
  if (!hub) return null;
  const isLast = stepIndex === hubs.length - 1;

  return (
    <Modal
      visible
      onClose={onDismiss}
      title={hub.title}
      testID={`${testID}-step`}
      accessibilityLabel={`${hub.title}, step ${stepIndex + 1} of ${hubs.length}`}
    >
      <Text
        testID={`${testID}-step-count`}
        className="text-muted-foreground text-xs mb-2"
      >
        {`Step ${stepIndex + 1} of ${hubs.length}`}
      </Text>
      <Text
        testID={`${testID}-step-body`}
        className="text-foreground text-sm leading-5 mb-4"
      >
        {hub.description}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {stepIndex > 0 ? (
          <Button testID={`${testID}-step-back`} variant="secondary" onPress={onBack}>
            Back
          </Button>
        ) : null}
        <View style={{ flex: 1 }} />
        <Button testID={`${testID}-step-skip`} variant="ghost" onPress={onDismiss}>
          Skip
        </Button>
        <Button testID={`${testID}-step-next`} onPress={onNext}>
          {isLast ? "Done" : "Next"}
        </Button>
      </View>
    </Modal>
  );
}

export default NativeTourOverlay;
