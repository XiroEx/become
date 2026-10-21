import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import GuidedFlow from "@/components/mind/system/GuidedFlow";

/**
 * Regression test for the mindset session progress bar: the fill segment
 * only ever set `width`/`backgroundColor` inline and never a height, so
 * inside a default column-flex parent (`View`'s default flexDirection) it
 * collapsed to 0 height and was invisible no matter what width or colour it
 * was given — it never appeared to move or show color. The fix pins the
 * fill to `h-full` so it stretches to the track's height.
 */
describe("GuidedFlow progress bar", () => {
  const steps = [
    { title: "Step 1" },
    { title: "Step 2" },
    { title: "Step 3" },
  ];
  const accent = "rgb(192, 132, 252)";

  it("renders every fill segment with a height class so it is actually visible", () => {
    const { getByTestId } = render(
      <GuidedFlow
        title="Test Flow"
        steps={steps}
        accentColor={accent}
        onComplete={jest.fn()}
        onExit={jest.fn()}
      />,
    );

    for (let i = 0; i < steps.length; i++) {
      const fill = getByTestId(`guided-flow-progress-${i}-fill`);
      // Without an explicit height class, an empty View defaults to 0
      // height inside the track's column-flex layout, which is exactly why
      // the fill was invisible regardless of its width/colour.
      expect(String(fill.props.className)).toContain("h-full");
    }
  });

  it("fills the current step halfway, in the tool's accent colour, and moves forward as steps advance", () => {
    const { getByTestId } = render(
      <GuidedFlow
        title="Test Flow"
        steps={steps}
        accentColor={accent}
        onComplete={jest.fn()}
        onExit={jest.fn()}
      />,
    );

    const flat = (testId: string) => {
      const el = getByTestId(testId);
      return Array.isArray(el.props.style)
        ? Object.assign({}, ...el.props.style)
        : el.props.style;
    };

    // Step 0 active: half-filled in accent colour, later steps empty.
    expect(flat("guided-flow-progress-0-fill").width).toBe("50%");
    expect(flat("guided-flow-progress-0-fill").backgroundColor).toBe(accent);
    expect(flat("guided-flow-progress-1-fill").width).toBe("0%");

    fireEvent.press(getByTestId("guided-flow-next"));

    // Advancing: step 0 is now complete (full, coloured), step 1 is the new half-filled active one.
    expect(flat("guided-flow-progress-0-fill").width).toBe("100%");
    expect(flat("guided-flow-progress-0-fill").backgroundColor).toBe(accent);
    expect(flat("guided-flow-progress-1-fill").width).toBe("50%");
    expect(flat("guided-flow-progress-1-fill").backgroundColor).toBe(accent);
    expect(flat("guided-flow-progress-2-fill").width).toBe("0%");
  });
});
