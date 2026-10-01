import { render, fireEvent } from "@testing-library/react-native";
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
});
