import { act, fireEvent, render } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import {
  BREATH_PROTOCOLS,
  breathForState,
  type MindSessionPlan,
  type MindState,
  type Move,
} from "@become/core";
import {
  BREATH_DONE_HOLD_MS,
  BreathScene,
  kindOf,
  secs,
} from "@/components/mind/session/scenes/BreathScene";
import { SessionPlayer } from "@/components/mind/session/SessionPlayer";

/**
 * THE BREATH SCENE'S TIMING IS THE WEB'S PROTOCOL (NP-098).
 *
 * Nothing about a protocol is written down in this file either: the phases, the
 * durations and the round counts are read out of `BREATH_PROTOCOLS` /
 * `breathForState` in `@become/core` — the vendored copy of
 * `webapp/lib/mind/moves.ts`, which `webapp/tests/unit/mindDrift.test.ts` holds
 * byte-for-byte to the web source. So these tests fail if the native scene stops
 * following the protocol, and the drift test fails if the protocol stops being
 * the web's.
 */

const BREATH_MOVE: Move = {
  id: "breath",
  kind: "breath",
  title: "Bring it down first",
  subtitle: "Follow the circle. Nothing else to do.",
  protocolId: "auto",
  xp: 5,
};

/** Every check-in answer, and the protocol the web picks for it. */
const STATES: MindState[] = ["stressed", "distracted", "low_energy", "locked_in"];

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    if (ms > 0) jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe("BreathScene (NP-098)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (Haptics.impactAsync as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("the web maps the four check-in answers onto four protocols", () => {
    expect(breathForState("stressed").id).toBe("sigh");
    expect(breathForState("distracted").id).toBe("box");
    expect(breathForState("low_energy").id).toBe("energize");
    expect(breathForState("locked_in").id).toBe("coherence");
    expect(breathForState(null).id).toBe("sigh");
  });

  // ── Acceptance e015c8e0 ──────────────────────────────────────────────────
  it.each(STATES)(
    "(id: e015c8e0) checked in as %s, the ready card lists the web protocol's own phases and counts",
    (state) => {
      const p = breathForState(state);
      const { getByTestId } = render(
        <BreathScene move={BREATH_MOVE} protocol={p} onDone={jest.fn()} />,
      );

      expect(getByTestId("mind-breath-name")).toHaveTextContent(p.name);
      expect(getByTestId("mind-breath-rounds")).toHaveTextContent(
        `${p.rounds} rounds`,
      );
      p.phases.forEach((ph, i) => {
        expect(getByTestId(`mind-breath-phase-pill-${i}`)).toHaveTextContent(
          `${ph.label} · ${secs(ph.durationMs)}`,
        );
      });
    },
  );

  // ── Acceptance e015c8e0 ──────────────────────────────────────────────────
  it("(id: e015c8e0) the phases, the counts and the countdown run in the protocol's own time", async () => {
    const p = breathForState("stressed");
    // The web's Physiological Sigh, spelled out so a silent change to the
    // protocol is visible in this diff as well as in the loop below.
    expect(p.name).toBe("Physiological Sigh");
    expect(p.rounds).toBe(3);
    expect(p.phases.map((ph) => [ph.label, ph.durationMs])).toEqual([
      ["Inhale", 2200],
      ["Inhale again", 1000],
      ["Exhale", 6000],
    ]);

    const onDone = jest.fn();
    const haptic = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <BreathScene
        move={BREATH_MOVE}
        protocol={p}
        onDone={onDone}
        haptic={haptic}
      />,
    );

    fireEvent.press(getByTestId("mind-breath-start"));
    await flush();

    for (let round = 1; round <= p.rounds; round += 1) {
      for (const ph of p.phases) {
        expect(getByTestId("mind-breath-round")).toHaveTextContent(
          `Round ${round} of ${p.rounds}`,
        );
        expect(getByTestId("mind-breath-phase")).toHaveTextContent(ph.label);
        expect(getByTestId("mind-breath-countdown")).toHaveTextContent(
          String(Math.ceil(ph.durationMs / 1000)),
        );
        // Half way through, the phase has NOT moved on.
        await flush(Math.floor(ph.durationMs / 2));
        expect(getByTestId("mind-breath-phase")).toHaveTextContent(ph.label);
        await flush(ph.durationMs - Math.floor(ph.durationMs / 2));
      }
    }

    // Three rounds done → the completion beat, then the hand-back.
    expect(getByTestId("mind-breath-done")).toBeTruthy();
    expect(queryByTestId("mind-breath-countdown")).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    await flush(BREATH_DONE_HOLD_MS);
    expect(onDone).toHaveBeenCalledTimes(1);

    // One light tap per phase change — nine phases played, nine taps.
    expect(haptic).toHaveBeenCalledTimes(p.phases.length * p.rounds);
  });

  it("the tap is a LIGHT impact, through expo-haptics", async () => {
    const p = BREATH_PROTOCOLS.box!;
    const { getByTestId } = render(
      <BreathScene move={BREATH_MOVE} protocol={p} onDone={jest.fn()} />,
    );
    fireEvent.press(getByTestId("mind-breath-start"));
    await flush();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Light,
    );
    await flush(p.phases[0]!.durationMs);
    expect((Haptics.impactAsync as unknown as jest.Mock).mock.calls).toHaveLength(2);
  });

  it("pausing stops the clock and the phase, and resuming restarts the phase", async () => {
    const p = BREATH_PROTOCOLS["478"]!;
    const { getByTestId } = render(
      <BreathScene move={BREATH_MOVE} protocol={p} onDone={jest.fn()} />,
    );
    fireEvent.press(getByTestId("mind-breath-start"));
    await flush(1000);
    fireEvent.press(getByTestId("mind-breath-pause"));
    expect(getByTestId("mind-breath-phase")).toHaveTextContent("Paused");

    // Far longer than the whole protocol: a paused pacer does not move.
    await flush(60_000);
    expect(getByTestId("mind-breath-phase")).toHaveTextContent("Paused");

    fireEvent.press(getByTestId("mind-breath-pause"));
    expect(getByTestId("mind-breath-phase")).toHaveTextContent(
      p.phases[0]!.label,
    );
    expect(getByTestId("mind-breath-countdown")).toHaveTextContent(
      String(Math.ceil(p.phases[0]!.durationMs / 1000)),
    );
  });

  it("a preview is one round and comes back to the ready card", async () => {
    const p = BREATH_PROTOCOLS.coherence!;
    const onDone = jest.fn();
    const { getByTestId } = render(
      <BreathScene move={BREATH_MOVE} protocol={p} onDone={onDone} />,
    );
    fireEvent.press(getByTestId("mind-breath-preview"));
    await flush();
    expect(getByTestId("mind-breath-round")).toHaveTextContent("Preview");

    // One phase at a time: each advance re-arms the next phase's timer, which
    // React only does once the render it caused has been flushed.
    for (const ph of p.phases) {
      await flush(ph.durationMs);
    }
    expect(getByTestId("mind-breath-ready")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("skipping hands straight back to the player", () => {
    const onDone = jest.fn();
    const { getByTestId } = render(
      <BreathScene
        move={BREATH_MOVE}
        protocol={BREATH_PROTOCOLS.sigh!}
        onDone={onDone}
      />,
    );
    fireEvent.press(getByTestId("mind-breath-skip"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("reads inhale / exhale / hold off the protocol's own labels", () => {
    expect(kindOf("Inhale")).toBe("in");
    expect(kindOf("Inhale again")).toBe("in");
    expect(kindOf("Exhale")).toBe("out");
    expect(kindOf("Hold")).toBe("hold");
    expect(secs(5500)).toBe("5.5s");
    expect(secs(4000)).toBe("4s");
  });
});

describe("the protocol the PLAYER resolves from the check-in (NP-098)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const plan: MindSessionPlan = {
    intro: { title: "Settle first", subtitle: "Take the edge off." },
    moves: [BREATH_MOVE],
    rewardXp: 15,
  };

  // ── Acceptance e015c8e0 ──────────────────────────────────────────────────
  it.each(STATES)(
    "(id: e015c8e0) a %s check-in plays the protocol the web picks for it",
    async (state) => {
      const { getByTestId } = render(
        <SessionPlayer plan={plan} initialLiveState={state} onExit={jest.fn()} />,
      );
      fireEvent.press(getByTestId("mind-session-player-intro-begin"));
      await flush();
      const p = breathForState(state);
      expect(getByTestId("mind-breath-name")).toHaveTextContent(p.name);
      expect(getByTestId("mind-breath-rounds")).toHaveTextContent(
        `${p.rounds} rounds`,
      );
      expect(getByTestId("mind-breath-phase-pill-0")).toHaveTextContent(
        `${p.phases[0]!.label} · ${secs(p.phases[0]!.durationMs)}`,
      );
    },
  );

  it("an explicit protocolId wins over the check-in, as on the web", async () => {
    const fixed: Move = { ...BREATH_MOVE, protocolId: "478" };
    const { getByTestId } = render(
      <SessionPlayer
        plan={{ ...plan, moves: [fixed] }}
        initialLiveState="stressed"
        onExit={jest.fn()}
      />,
    );
    fireEvent.press(getByTestId("mind-session-player-intro-begin"));
    await flush();
    expect(getByTestId("mind-breath-name")).toHaveTextContent(
      BREATH_PROTOCOLS["478"]!.name,
    );
  });
});
