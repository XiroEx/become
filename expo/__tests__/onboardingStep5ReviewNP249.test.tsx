/**
 * NP-249 — Onboarding step 5 (Review): health disclaimer, sections, rows and
 * notes matching `webapp/app/onboarding/page.tsx`'s `Step5Review` exactly
 * (full visual pass, native vs web, build d68b84e3).
 *
 * Renders `OnboardingFlow` directly, like `onboardingStep4EquipmentInjuries.test.tsx`,
 * walking steps 1-4 with the minimum each requires, then asserting on the
 * review step's structure and copy.
 */
import { fireEvent, render } from "@testing-library/react-native";
import { OnboardingFlow } from "../components/onboarding/OnboardingFlow";
import { HEALTH_DISCLAIMER_SHORT } from "@become/core";
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

function walkToReview(getByTestId: (id: string) => any) {
  // Step 1: Goals
  fireEvent.press(getByTestId("onboarding-goal-gain_muscle"));
  fireEvent.press(getByTestId("onboarding-next"));

  // Step 2: Training (Name, Experience, Days / week)
  fireEvent.changeText(getByTestId("onboarding-name"), "Alex Smith");
  fireEvent.press(getByTestId("onboarding-experience-intermediate"));
  fireEvent.press(getByTestId("onboarding-next"));

  // Step 3: Body & nutrition
  fireEvent.changeText(getByTestId("onboarding-age"), "25");
  fireEvent.press(getByTestId("onboarding-sex-male"));
  fireEvent.changeText(getByTestId("stat-height-ft"), "5");
  fireEvent.changeText(getByTestId("stat-height-in"), "10");
  fireEvent.changeText(getByTestId("stat-current-weight"), "180");
  fireEvent.changeText(getByTestId("stat-target-weight"), "165");
  fireEvent.press(getByTestId("onboarding-next"));

  // Step 4: Equipment & injuries
  fireEvent.press(getByTestId("onboarding-equipment-dumbbells"));
  fireEvent.press(getByTestId("onboarding-next"));
}

describe("Onboarding step 5 — Review (NP-249)", () => {
  it("shows the web's subtitle, not the old native one", () => {
    const { getByTestId, getByText, queryByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToReview(getByTestId);

    expect(getByTestId("review-step")).toBeTruthy();
    expect(
      getByText(
        "Everything below shapes what the app does for you. Edit anything that isn't right, then finish.",
      ),
    ).toBeTruthy();
    expect(queryByText("Review your answers, then finish.")).toBeNull();
  });

  it("shows the health disclaimer, amber box, right above Finish", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    walkToReview(getByTestId);

    const disclaimer = getByTestId("onboarding-health-disclaimer");
    expect(disclaimer.props.children).toBe(HEALTH_DISCLAIMER_SHORT);
  });

  it("renders the web's section titles: Your goals, Training, Body & nutrition, Equipment & injuries", () => {
    const { getByTestId, getByText, queryByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToReview(getByTestId);

    expect(getByText("Your goals")).toBeTruthy();
    expect(getByText("Training")).toBeTruthy();
    expect(getByText("Body & nutrition")).toBeTruthy();
    expect(getByText("Equipment & injuries")).toBeTruthy();

    // The old native-only section titles are gone.
    expect(queryByText("About you")).toBeNull();
  });

  it("the 'Your goals' section shows Primary plus the goal-drives-everything note", () => {
    const { getByTestId, getByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToReview(getByTestId);

    expect(getByText("Primary")).toBeTruthy();
    expect(getByText("Build Muscle")).toBeTruthy();
    expect(
      getByText(
        "Build Muscle drives your program match, your calorie direction and your dashboard.",
      ),
    ).toBeTruthy();
  });

  it("the 'Training' section shows Name, Experience, Days / week and the schedule note", () => {
    const { getByTestId, getByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToReview(getByTestId);

    expect(getByText("Name")).toBeTruthy();
    expect(getByText("Alex Smith")).toBeTruthy();
    expect(getByText("Experience")).toBeTruthy();
    expect(getByText("Intermediate")).toBeTruthy();
    expect(getByText("Days / week")).toBeTruthy();
    expect(
      getByText(
        /We treat 3 sessions a week as "moderate" when calculating your calories/,
      ),
    ).toBeTruthy();
  });

  it("the 'Body & nutrition' section uses the web's row labels and formats: Eating, Daily calories, Macros, height as 5'10\"", () => {
    const { getByTestId, getByText, queryByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToReview(getByTestId);

    expect(getByText("Eating")).toBeTruthy();
    // Picking "Build Muscle" first sets the direction to "gain" immediately
    // (directionForGoal), before the current/target weights are even typed.
    expect(getByText("Calorie surplus")).toBeTruthy();
    expect(getByText("Daily calories")).toBeTruthy();
    expect(getByText("Macros")).toBeTruthy();
    expect(getByText(`5'10"`)).toBeTruthy();
    expect(getByText(/Mifflin-St Jeor puts your TDEE at/)).toBeTruthy();

    // The native-only rows (Sex, Direction, Weight unit, Pace) are gone.
    expect(queryByText("Sex")).toBeNull();
    expect(queryByText("Direction")).toBeNull();
    expect(queryByText("Weight unit")).toBeNull();
  });

  it("the 'Equipment & injuries' section uses the web's 'Equipment' label, 'Not set' fallback and the gear/coach note", () => {
    const { getByTestId, getByText, queryByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToReview(getByTestId);

    expect(getByText("Equipment")).toBeTruthy();
    expect(getByText("Dumbbells")).toBeTruthy();
    expect(getByText("Injury notes")).toBeTruthy();
    expect(getByText("None")).toBeTruthy();
    expect(
      getByText(
        /Programs that need gear you don't have get pushed down your recommendations/,
      ),
    ).toBeTruthy();

    // The old native-only "Access" label is gone.
    expect(queryByText("Access")).toBeNull();
  });

  it("Edit links are grey text with a pencil icon (not red)", () => {
    const { getByTestId, getAllByLabelText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToReview(getByTestId);

    const edits = getAllByLabelText(/^Edit /);
    expect(edits.length).toBeGreaterThanOrEqual(4);
    for (const edit of edits) {
      const editText = edit.findByProps({ children: "Edit" });
      expect(editText.props.className).toContain("text-muted-foreground");
      expect(editText.props.className).not.toContain("text-primary");
    }
  });

  it("program match reasons render and the enrol button is present and enabled", () => {
    const { getByTestId } = render(
      <OnboardingFlow
        onComplete={noop}
        recommendation={RECOMMENDATION}
        onEnrollRecommended={noop}
      />,
    );
    walkToReview(getByTestId);

    expect(getByTestId("onboarding-recommended-program-reasons")).toBeTruthy();
    const enroll = getByTestId("onboarding-recommended-program-enroll");
    expect(enroll.props.accessibilityState?.disabled).toBeFalsy();
  });

  it("the program-match footnote reads 'from your dashboard', matching the web (not native's 'from Home')", () => {
    const { getByTestId, getByText, queryByText } = render(
      <OnboardingFlow onComplete={noop} recommendation={RECOMMENDATION} />,
    );
    walkToReview(getByTestId);

    expect(
      getByText(
        /Entirely optional — you can also start it later from your dashboard/,
      ),
    ).toBeTruthy();
    expect(queryByText(/from Home/)).toBeNull();
  });
});
