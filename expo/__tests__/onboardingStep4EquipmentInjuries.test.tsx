/**
 * NP-248 — Onboarding step 4 (Equipment & injuries): web title/copy, the
 * "Equipment access" chip layout, the Injury notes field, and Next enabled
 * with nothing picked — mirroring `webapp/app/onboarding/page.tsx`'s `Step4`
 * exactly (full visual pass, native vs web, build d68b84e3).
 *
 * Renders `OnboardingFlow` directly, like `onboardingStep1Chrome.test.tsx`,
 * and walks steps 1-3 with the minimum each requires to reach step 4.
 */
import { fireEvent, render } from "@testing-library/react-native";
import { OnboardingFlow } from "../components/onboarding/OnboardingFlow";

const noop = () => {};

function walkToStep4(getByTestId: (id: string) => any) {
  // Step 1: Goals
  fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
  fireEvent.press(getByTestId("onboarding-next"));

  // Step 2: About you
  fireEvent.changeText(getByTestId("onboarding-name"), "Alex");
  fireEvent.press(getByTestId("onboarding-next"));

  // Step 3: Body & nutrition
  fireEvent.changeText(getByTestId("onboarding-age"), "25");
  fireEvent.press(getByTestId("onboarding-sex-male"));
  fireEvent.changeText(getByTestId("stat-height-ft"), "5");
  fireEvent.changeText(getByTestId("stat-height-in"), "10");
  fireEvent.changeText(getByTestId("stat-current-weight"), "180");
  fireEvent.press(getByTestId("onboarding-next"));
}

describe("Onboarding step 4 — Equipment & injuries (NP-248)", () => {
  it("shows the web's title and copy, not the old native ones", () => {
    const { getByTestId, getByText, queryByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToStep4(getByTestId);

    expect(getByText("Equipment & injuries")).toBeTruthy();
    expect(
      getByText(
        "We won't recommend a barbell program to someone training in a living room. Tell us what you actually have.",
      ),
    ).toBeTruthy();

    // The old native title/copy are gone.
    expect(queryByText("What equipment do you have?")).toBeNull();
    expect(
      queryByText(
        "Tell us what you have access to so we can recommend the right exercises.",
      ),
    ).toBeNull();
  });

  it("shows an 'Equipment access' label above wrapping pill chips for None, Dumbbells, Barbell, Cables, Full Gym", () => {
    const { getByTestId, getByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToStep4(getByTestId);

    expect(getByText("Equipment access")).toBeTruthy();

    const chips = getByTestId("onboarding-equipment-chips");
    expect(chips.props.style).toEqual(
      expect.objectContaining({ flexDirection: "row", flexWrap: "wrap" }),
    );

    for (const value of ["none", "dumbbells", "barbell", "cables", "full_gym"]) {
      const chip = getByTestId(`onboarding-equipment-${value}`);
      expect(chip.props.accessibilityRole).toBe("checkbox");
    }
  });

  it("lets Next through with no equipment option chosen, like web", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    walkToStep4(getByTestId);

    // Nothing picked yet.
    expect(
      getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(false);

    // Advances straight to the review step.
    fireEvent.press(getByTestId("onboarding-next"));
    expect(getByTestId("review-step")).toBeTruthy();
  });

  it("has an Injury notes textarea, saved as injuryNotes and sent with the profile", async () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(<OnboardingFlow onComplete={onComplete} />);
    walkToStep4(getByTestId);

    const injuryNotes = getByTestId("onboarding-injury-notes");
    expect(injuryNotes.props.placeholder).toBe(
      "Any injuries or areas to avoid? (optional)",
    );

    fireEvent.changeText(injuryNotes, "Left knee — no deep lunges");
    fireEvent.press(getByTestId("onboarding-equipment-dumbbells"));
    fireEvent.press(getByTestId("onboarding-next"));

    // Step 5: Review shows the injury note back.
    expect(getByTestId("review-step")).toBeTruthy();
    expect(getByTestId("onboarding-next")).toBeTruthy();

    fireEvent.press(getByTestId("onboarding-next"));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          injuryNotes: "Left knee — no deep lunges",
          equipmentAccess: ["dumbbells"],
        }),
      }),
    );
  });

  it("shows 'None' on the review step when no injury notes were entered", () => {
    const { getByTestId, getByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToStep4(getByTestId);
    // Pick an equipment option so "None" on the review step can only be the
    // injury-notes row, not the equipment-access row too.
    fireEvent.press(getByTestId("onboarding-equipment-barbell"));
    fireEvent.press(getByTestId("onboarding-next"));

    expect(getByTestId("review-step")).toBeTruthy();
    expect(getByText("None")).toBeTruthy();
  });
});
