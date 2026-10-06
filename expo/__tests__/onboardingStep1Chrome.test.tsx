/**
 * NP-245 — Onboarding step 1 (Goals) and wizard chrome: goal icons, live
 * program recommendation, progress bar, step label, Back/Next styling.
 *
 * Renders `OnboardingFlow` directly (it takes the recommendation as a prop),
 * so these assert the chrome without going through the route's network
 * plumbing — `onboardingReviewEnrol.test.tsx` and `onboarding-route.test.tsx`
 * already cover the end-to-end wiring.
 */
import { fireEvent, render } from "@testing-library/react-native";
import { OnboardingFlow } from "../components/onboarding/OnboardingFlow";
import type { ProgramRecommendation } from "@become/api-client";

const noop = () => {};

const RECOMMENDATION: ProgramRecommendation = {
  program_id: "prog-1",
  name: "Muscle Builder",
  description: "Build muscle",
  goal: "gain_muscle",
  target_user: "Intermediate",
  training_days_per_week: 4,
  duration_weeks: 8,
  tags: [],
  coverImage: null,
  score: 9.5,
  reasons: ["Matches your goal", "Fits your equipment"],
};

function walkToStep2(getByTestId: (id: string) => any) {
  fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
  fireEvent.press(getByTestId("onboarding-next"));
}

describe("Onboarding wizard chrome (NP-245)", () => {
  it("(id: np245-01) shows a thin progress bar that fills per step and advances its accessibility value", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    const bar = getByTestId("onboarding-progress-bar");
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 5, now: 1 });

    walkToStep2(getByTestId);

    expect(getByTestId("onboarding-progress-bar").props.accessibilityValue).toEqual({
      min: 0,
      max: 5,
      now: 2,
    });
  });

  it("(id: np245-02) the step label is a centred eyebrow naming the step, not a bare counter", () => {
    const { getByTestId, getByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    expect(getByText("Step 1 of 5 · Goals")).toBeTruthy();
    expect(
      getByTestId("onboarding-step-indicator").props.className,
    ).toContain("uppercase");

    walkToStep2(getByTestId);
    expect(getByText("Step 2 of 5 · About you")).toBeTruthy();
  });

  it("(id: np245-03) a selected goal card inverts (black fill / background text), unselected cards carry their coloured icon tile", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    const card = getByTestId("onboarding-goal-lose_weight");
    expect(card.props.className).toContain("border-border");
    expect(card.props.className).not.toContain("bg-foreground");

    fireEvent.press(card);

    const selectedCard = getByTestId("onboarding-goal-lose_weight");
    expect(selectedCard.props.className).toContain("border-foreground");
    expect(selectedCard.props.className).toContain("bg-foreground");
    expect(getByTestId("primary-goal-badge")).toBeTruthy();
  });

  it("(id: np245-04) picking a goal renders the live program recommendation card on step 1 (reused from the review step)", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <OnboardingFlow onComplete={noop} recommendationLoading />,
    );
    // No goal picked yet: no card, no skeleton — nothing fetched to show.
    expect(queryByTestId("onboarding-step1-recommended-program")).toBeNull();

    fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
    // Loading, no recommendation yet: the skeleton shows.
    expect(
      getByTestId("onboarding-step1-recommendation-loading"),
    ).toBeTruthy();

    rerender(
      <OnboardingFlow
        onComplete={noop}
        recommendation={RECOMMENDATION}
        recommendationLoading={false}
      />,
    );
    expect(getByTestId("onboarding-step1-recommended-program")).toBeTruthy();
    expect(
      getByTestId("onboarding-step1-recommended-program-name").props
        .children,
    ).toBe("Muscle Builder");
    // Step 1 is a preview, never an enrolment CTA (the web only offers that
    // on Review).
    expect(
      queryByTestId("onboarding-step1-recommended-program-enroll"),
    ).toBeNull();
  });

  it("(id: np245-05) Back is always visible, disabled only on step 1; Next is a black-fill button, Finish on the last step", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    expect(getByTestId("onboarding-back").props.accessibilityState).toEqual({
      disabled: true,
    });
    expect(getByTestId("onboarding-next").props.className).toContain(
      "bg-foreground",
    );

    walkToStep2(getByTestId);
    expect(getByTestId("onboarding-back").props.accessibilityState).toEqual({
      disabled: false,
    });
  });

  it("(id: np245-06) the inverted selected treatment also applies to sex, experience and equipment options", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    walkToStep2(getByTestId);

    fireEvent.press(getByTestId("onboarding-sex-male"));
    expect(getByTestId("onboarding-sex-male").props.className).toContain(
      "bg-foreground",
    );
    fireEvent.press(getByTestId("onboarding-experience-beginner"));
    expect(
      getByTestId("onboarding-experience-beginner").props.className,
    ).toContain("bg-foreground");
  });
});
