import { render, fireEvent, within } from "@testing-library/react-native";
import { Calculator, X, AlertTriangle, Info } from "lucide-react-native";
import { MacroExplainSheet } from "@/components/nutrition/MacroExplainSheet";

describe("MacroExplainSheet", () => {
  const steps = [
    { label: "Resting burn (BMR)", detail: "Mifflin-St Jeor formula", value: "1,750 cal" },
    { label: "Activity", detail: "Moderately active multiplier", value: "2,400 cal" },
  ];

  it("renders title, headline, steps and note when visible", () => {
    const { getByTestId, getByText } = render(
      <MacroExplainSheet
        isOpen
        title="Where your calories come from"
        headline="2,150 cal / day"
        steps={steps}
        note={{ tone: "caution", text: "High protein intake warning" }}
        onClose={() => {}}
      />,
    );

    expect(getByTestId("macro-explain-sheet-title").props.children).toBe(
      "Where your calories come from",
    );
    expect(getByTestId("explain-headline").props.children).toBe("2,150 cal / day");
    expect(getByText("Resting burn (BMR)")).toBeTruthy();
    expect(getByText("1,750 cal")).toBeTruthy();
    expect(getByTestId("explain-note-caution")).toBeTruthy();
    expect(getByText("High protein intake warning")).toBeTruthy();
  });

  it("calls onClose when Got it is pressed", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <MacroExplainSheet
        isOpen
        title="Where your protein comes from"
        headline="160 g"
        steps={steps}
        onClose={onClose}
      />,
    );

    fireEvent.press(getByTestId("macro-explain-sheet-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // NP-247: web parity — a calculator icon beside the title, a close "X" of
  // its own, the step value plain-bold rather than monospace, and a tone
  // icon on the note (web's `webapp/components/nutrition/MacroExplainSheet.tsx`).
  it("(id: np247-08) the title row carries a calculator icon and its own close X", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <MacroExplainSheet
        isOpen
        title="Where your calories come from"
        headline="2,150 cal / day"
        steps={steps}
        onClose={onClose}
      />,
    );

    expect(getByTestId("macro-explain-sheet-title")).toBeTruthy();
    const container = getByTestId("macro-explain-sheet-container");
    expect(within(container).UNSAFE_getByType(Calculator)).toBeTruthy();
    expect(within(container).UNSAFE_getByType(X)).toBeTruthy();

    fireEvent.press(getByTestId("macro-explain-sheet-close-icon"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("(id: np247-09) a step's value is bold, not monospace", () => {
    const { getByText } = render(
      <MacroExplainSheet
        isOpen
        title="Where your calories come from"
        headline="2,150 cal / day"
        steps={steps}
        onClose={() => {}}
      />,
    );

    const value = getByText("1,750 cal");
    expect(value.props.className).toContain("font-bold");
    expect(value.props.className).not.toContain("font-mono");
  });

  it("(id: np247-10) the note carries a tone icon — caution triangle or info circle", () => {
    const { getByTestId, rerender } = render(
      <MacroExplainSheet
        isOpen
        title="Where your protein comes from"
        headline="160 g"
        steps={steps}
        note={{ tone: "caution", text: "High protein intake warning" }}
        onClose={() => {}}
      />,
    );
    expect(
      within(getByTestId("explain-note-caution")).UNSAFE_getByType(
        AlertTriangle,
      ),
    ).toBeTruthy();

    rerender(
      <MacroExplainSheet
        isOpen
        title="Where your protein comes from"
        headline="160 g"
        steps={steps}
        note={{ tone: "info", text: "A sensible protein target" }}
        onClose={() => {}}
      />,
    );
    expect(
      within(getByTestId("explain-note-info")).UNSAFE_getByType(Info),
    ).toBeTruthy();
  });
});
