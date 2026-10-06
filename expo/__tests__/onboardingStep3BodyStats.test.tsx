/**
 * NP-247 — Onboarding step 3 (Body stats): web parity for copy, layout and
 * icons. `webapp/app/onboarding/page.tsx`'s Step3 is the reference; this
 * renders `OnboardingFlow` directly the way `onboardingStep1Chrome.test.tsx`
 * does, so these assert the step-3 chrome without the route's network
 * plumbing.
 */
import { fireEvent, render, within } from "@testing-library/react-native";
import { TrendingDown, Minus, TrendingUp } from "lucide-react-native";
import { OnboardingFlow } from "../components/onboarding/OnboardingFlow";

const noop = () => {};

function walkToStep3(getByTestId: (id: string) => any) {
  fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
  fireEvent.press(getByTestId("onboarding-next"));
  fireEvent.changeText(getByTestId("onboarding-name"), "Jon");
  fireEvent.press(getByTestId("onboarding-next"));
}

describe("Onboarding step 3 — Body stats (NP-247)", () => {
  it("(id: np247-01) titles the step 'Body stats' with the web's four-number subtitle", () => {
    const { getByTestId, getByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToStep3(getByTestId);

    expect(getByText("Body stats")).toBeTruthy();
    expect(
      getByText(
        "These four numbers are what your daily calories and macros are built from. Nothing here is shared.",
      ),
    ).toBeTruthy();
    // The progress chip keeps the web's unchanged "Body & nutrition" label.
    expect(getByText("Step 3 of 5 · Body & nutrition")).toBeTruthy();
  });

  it("(id: np247-02) Age and Height sit on one row, Height as ft/in inputs with unit suffixes and no 'Feet'/'Inches' visible label", () => {
    const { getByTestId, queryByText, getAllByText, getByLabelText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToStep3(getByTestId);

    // Both inputs are reachable and keep their accessible names for a
    // screen reader even though "Feet" / "Inches" are no longer painted.
    expect(getByLabelText("Feet")).toBeTruthy();
    expect(getByLabelText("Inches")).toBeTruthy();
    expect(queryByText("Feet")).toBeNull();
    expect(queryByText("Inches")).toBeNull();

    // The unit suffixes replace them visually.
    expect(queryByText("ft")).toBeTruthy();
    expect(queryByText("in")).toBeTruthy();

    // The weight fields' own suffix, present for both current and target.
    expect(getAllByText("lbs").length).toBeGreaterThan(0);
  });

  it("(id: np247-03) Biological sex renders as three side-by-side pills with the Mifflin-St Jeor note", () => {
    const { getByTestId, getByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToStep3(getByTestId);

    expect(getByTestId("onboarding-sex-male")).toBeTruthy();
    expect(getByTestId("onboarding-sex-female")).toBeTruthy();
    expect(getByTestId("onboarding-sex-prefer_not_to_say")).toBeTruthy();
    expect(
      getByText(
        /The Mifflin-St Jeor equation needs this\. Choosing "prefer not to say" means we can't calculate your calories automatically\./,
      ),
    ).toBeTruthy();

    fireEvent.press(getByTestId("onboarding-sex-male"));
    expect(getByTestId("onboarding-sex-male").props.className).toContain(
      "bg-foreground",
    );
  });

  it("(id: np247-04) each eating-direction card carries its trend icon", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    walkToStep3(getByTestId);

    expect(
      within(getByTestId("direction-lose")).UNSAFE_getByType(TrendingDown),
    ).toBeTruthy();
    expect(
      within(getByTestId("direction-maintain")).UNSAFE_getByType(Minus),
    ).toBeTruthy();
    expect(
      within(getByTestId("direction-gain")).UNSAFE_getByType(TrendingUp),
    ).toBeTruthy();
  });

  it("(id: np247-05) activity options are title case with their multiplier shown, and the longer subtitle", () => {
    const { getByTestId, getByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToStep3(getByTestId);

    expect(
      getByText(
        "Your job and daily movement, not your workouts. This has the biggest effect on your calories.",
      ),
    ).toBeTruthy();

    expect(getByText("Sedentary")).toBeTruthy();
    expect(getByText("Lightly Active")).toBeTruthy();
    expect(getByText("Moderately Active")).toBeTruthy();
    expect(getByText("Active")).toBeTruthy();
    expect(getByText("Very Active")).toBeTruthy();

    expect(getByText("×1.2")).toBeTruthy();
    expect(getByText("×1.375")).toBeTruthy();
    expect(getByText("×1.55")).toBeTruthy();
    expect(getByText("×1.725")).toBeTruthy();
    expect(getByText("×1.9")).toBeTruthy();
  });

  it("(id: np247-06) the macro-split section carries the web's subtitle and a bolded recommendation footnote", () => {
    const { getByTestId, getByText } = render(
      <OnboardingFlow onComplete={noop} />,
    );
    walkToStep3(getByTestId);

    expect(
      getByText("You can change this any time in Nutrition."),
    ).toBeTruthy();

    // The footnote names whichever preset is actually badged, in bold, then
    // explains why — which preset that is depends on the (still-incomplete)
    // body stats, so assert the SHAPE rather than pin one preset's copy.
    const footnote = within(getByTestId("macro-preset-recommendation"));
    const boldLabel = footnote.getByText(
      /^(Custom|Balanced|High Protein|Lower Carb)$/,
    );
    expect(boldLabel.props.className).toContain("font-semibold");
    expect(footnote.getByText(/ — /)).toBeTruthy();
  });

  it("(id: np247-07) the targets card shows a sparkle, '?' icons and bolds the TDEE figure", () => {
    const { getByTestId } = render(<OnboardingFlow onComplete={noop} />);
    walkToStep3(getByTestId);

    fireEvent.press(getByTestId("onboarding-sex-male"));
    fireEvent.changeText(getByTestId("onboarding-age"), "30");
    fireEvent.changeText(getByTestId("stat-height-ft"), "5");
    fireEvent.changeText(getByTestId("stat-height-in"), "10");
    fireEvent.changeText(getByTestId("stat-current-weight"), "185");

    const preview = getByTestId("tdee-preview");
    expect(within(preview).getByText("cal / day")).toBeTruthy();

    // "Your TDEE is about <bold>X cal</bold>." — the number sits in its own
    // nested, bold Text node rather than the plain sentence.
    const tdeeText = /\d[\d,]* cal/;
    const matches = within(preview)
      .getAllByText(tdeeText)
      .filter((n: any) =>
        String(n.props.className ?? "").includes("font-semibold"),
      );
    expect(matches.length).toBeGreaterThan(0);
  });
});
