/**
 * NP-310 — Onboarding full visual pass (Android S23 Ultra, One UI 7, build
 * 24f4e34d): system back used to leave the wizard and drop every answer
 * instead of stepping back; the Lose Weight icon tile painted no background
 * at all; step 3's macro tiles were outlined instead of the web's flat
 * grey fill.
 *
 * Renders `OnboardingFlow` directly, like `onboardingStep1Chrome.test.tsx`.
 */
import { act, fireEvent, render } from "@testing-library/react-native";
import { OnboardingFlow } from "../components/onboarding/OnboardingFlow";
import type { BackHandlerLike } from "@/lib/android/backHandler";

const noop = () => {};

interface FakeBackHandler {
  backHandler: BackHandlerLike;
  fire: () => boolean | undefined;
  listeners: (() => boolean)[];
}

function makeFakeBackHandler(): FakeBackHandler {
  const listeners: (() => boolean)[] = [];
  const backHandler: BackHandlerLike = {
    addEventListener: (_type, handler) => {
      listeners.push(handler);
      return {
        remove: () => {
          const idx = listeners.indexOf(handler);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      };
    },
  };
  return {
    backHandler,
    listeners,
    fire: () => listeners.map((l) => l()).pop(),
  };
}

function walkToStep3(getByTestId: (id: string) => any) {
  fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
  fireEvent.press(getByTestId("onboarding-next"));
  fireEvent.changeText(getByTestId("onboarding-name"), "Jon");
  fireEvent.press(getByTestId("onboarding-next"));
}

describe("Onboarding Android hardware back (NP-310)", () => {
  it("(id: np310-01) steps back one step instead of leaving the wizard, keeping every answer", () => {
    const fake = makeFakeBackHandler();
    const { getByTestId, getByText } = render(
      <OnboardingFlow onComplete={noop} backHandler={fake.backHandler} />,
    );
    walkToStep3(getByTestId);
    expect(getByText("Step 3 of 5 · Body & nutrition")).toBeTruthy();

    let intercepted: boolean | undefined;
    act(() => {
      intercepted = fake.fire();
    });

    expect(intercepted).toBe(true);
    expect(getByText("Step 2 of 5 · About you")).toBeTruthy();
    // The name typed before stepping forward survived the round trip.
    expect(getByTestId("onboarding-name").props.value).toBe("Jon");

    // The goal picked on step 1 also survived — back to step 1 confirms it.
    act(() => {
      fake.fire();
    });
    expect(getByText("Step 1 of 5 · Goals")).toBeTruthy();
    expect(getByTestId("onboarding-goal-lose_weight").props.className).toContain(
      "bg-foreground",
    );
  });

  it("(id: np310-02) on step 1 does not intercept — the OS default (leaving onboarding) is allowed to run", () => {
    const fake = makeFakeBackHandler();
    const { getByText } = render(
      <OnboardingFlow onComplete={noop} backHandler={fake.backHandler} />,
    );
    expect(getByText("Step 1 of 5 · Goals")).toBeTruthy();

    const intercepted = fake.fire();

    expect(intercepted).toBe(false);
    // Still step 1 — nothing to render changed on this side, the caller
    // (expo-router) is the one that actually leaves.
    expect(getByText("Step 1 of 5 · Goals")).toBeTruthy();
  });

  it("(id: np310-03) does not subscribe when no backHandler is injected (web / test default)", () => {
    const { getByText } = render(<OnboardingFlow onComplete={noop} />);
    // Renders fine with no injected BackHandler — the hook is a no-op.
    expect(getByText("Step 1 of 5 · Goals")).toBeTruthy();
  });
});

describe("Onboarding step 1 — Lose Weight tile background (NP-310)", () => {
  it("(id: np310-04) paints an inline background wash instead of the dropped 'bg-orange-100' class", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    const tile = getByTestId("onboarding-goal-lose_weight-tile");

    // tailwind.config.js overrides `orange` with one flat colour, so the old
    // `bg-orange-100 dark:bg-orange-900/30` classes do not exist and must be
    // gone from the className entirely.
    expect(tile.props.className).not.toContain("orange");

    // The fix: an inline style resolves a translucent wash of the (flat)
    // `orange` token, so the tile is never unfilled.
    expect(tile.props.style).toEqual(
      expect.objectContaining({ backgroundColor: expect.stringContaining("rgba(249, 115, 22") }),
    );
  });

  it("(id: np310-05) the other four goal tiles keep their working tailwind shade classes untouched", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    expect(getByTestId("onboarding-goal-gain_muscle-tile").props.className).toContain(
      "bg-blue-100",
    );
    expect(getByTestId("onboarding-goal-maintain-tile").props.className).toContain(
      "bg-violet-100",
    );
    expect(
      getByTestId("onboarding-goal-improve_performance-tile").props.className,
    ).toContain("bg-yellow-100");
    expect(
      getByTestId("onboarding-goal-general_health-tile").props.className,
    ).toContain("bg-emerald-100");
  });

  it("(id: np310-06) once selected, the tile falls back to the shared inverted wash like every other goal", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
    const tile = getByTestId("onboarding-goal-lose_weight-tile");
    expect(tile.props.className).toContain("bg-background/20");
    expect(tile.props.style).toBeUndefined();
  });
});

describe("Onboarding step 3 — macro tiles are grey-filled, not outlined (NP-310)", () => {
  function walkToTargets(getByTestId: (id: string) => any) {
    walkToStep3(getByTestId);
    fireEvent.press(getByTestId("onboarding-sex-male"));
    fireEvent.changeText(getByTestId("onboarding-age"), "30");
    fireEvent.changeText(getByTestId("stat-height-ft"), "5");
    fireEvent.changeText(getByTestId("stat-height-in"), "10");
    fireEvent.changeText(getByTestId("stat-current-weight"), "185");
  }

  it("(id: np310-07) protein/carbs/fats tiles carry the web's flat grey fill and no border", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    walkToTargets(getByTestId);

    for (const key of ["protein", "carbs", "fats"]) {
      const tile = getByTestId(`explain-${key}`);
      expect(tile.props.className).toContain("bg-muted");
      expect(tile.props.className).not.toMatch(/\bborder\b/);
      expect(tile.props.className).not.toContain("bg-card");
    }
  });
});
