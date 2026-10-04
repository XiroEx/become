// NP-225 — QUICK SESSIONS 2/5: THE NAMING PROMPT.
//
// Native port of `webapp/components/workout/QuickSessionNamePrompt.tsx`:
// the input starts empty for default product copy, Confirm stays disabled
// until a real name is typed, Skip (and close) finish under the web's
// fallback name, and a rejected save keeps the prompt open with its error.
//
// The three acceptance ids, each asserted on its own below.

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QuickSessionNamePrompt } from "@/components/workout/QuickSessionNamePrompt";
import { fallbackQuickSessionName } from "@become/core";

const TEST_ID = "quick-session-name-prompt";

describe("(id: e5cecfd3) Skip saves under the web's fallback name for the given day", () => {
  it("calls onSkip with the fallback name for 2026-09-29", async () => {
    const fallback = fallbackQuickSessionName("2026-09-29");
    expect(fallback).toBe("9/29/26 workout");

    const onSkip = jest.fn().mockResolvedValue(undefined);
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    const { getByTestId } = render(
      <QuickSessionNamePrompt
        initialName="Quick Session"
        confirmLabel="Save workout"
        fallbackName={fallback}
        onConfirm={onConfirm}
        onSkip={onSkip}
        onCancel={onCancel}
      />,
    );

    // The web's skip copy: Skip, save as "<fallbackName>".
    expect(getByTestId(`${TEST_ID}-skip`).props.accessibilityLabel).toBe(
      `Skip, save as \u201c${fallback}\u201d`,
    );

    fireEvent.press(getByTestId(`${TEST_ID}-skip`));

    await waitFor(() => {
      expect(onSkip).toHaveBeenCalledTimes(1);
    });
    expect(onSkip).toHaveBeenCalledWith("9/29/26 workout");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("offers no skip path when onSkip/fallbackName are absent", () => {
    const { queryByTestId } = render(
      <QuickSessionNamePrompt
        initialName="Quick Session"
        confirmLabel="Save workout"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(queryByTestId(`${TEST_ID}-skip`)).toBeNull();
    expect(queryByTestId(`${TEST_ID}-close`)).toBeNull();
  });
});

describe("(id: e5cecfd4) A default title starts empty and cannot be confirmed", () => {
  it("renders an empty input and keeps Confirm disabled until a real name is typed", () => {
    const { getByTestId } = render(
      <QuickSessionNamePrompt
        initialName="Quick Session"
        confirmLabel="Save workout"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    const input = getByTestId(`${TEST_ID}-input`);
    expect(input.props.value).toBe("");

    const confirm = getByTestId(`${TEST_ID}-confirm`);
    expect(confirm.props.accessibilityState?.disabled).toBe(true);

    // Typing default copy back in still cannot be confirmed.
    fireEvent.changeText(input, "Quick Session");
    expect(getByTestId(`${TEST_ID}-confirm`).props.accessibilityState?.disabled).toBe(
      true,
    );
    fireEvent.press(getByTestId(`${TEST_ID}-confirm`));

    // A real name enables Confirm.
    fireEvent.changeText(input, "Thursday Push");
    expect(getByTestId(`${TEST_ID}-input`).props.value).toBe("Thursday Push");
    expect(
      getByTestId(`${TEST_ID}-confirm`).props.accessibilityState?.disabled,
    ).toBe(false);
  });

  it("trims a meaningful initial name instead of clearing it", () => {
    const { getByTestId } = render(
      <QuickSessionNamePrompt
        initialName="  Thursday Push  "
        confirmLabel="Save workout"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(getByTestId(`${TEST_ID}-input`).props.value).toBe("Thursday Push");
    expect(
      getByTestId(`${TEST_ID}-confirm`).props.accessibilityState?.disabled,
    ).toBe(false);
  });
});

describe("(id: e5cecfd5) A failed save keeps the prompt open with its error", () => {
  it("leaves the prompt open with the error when onConfirm rejects", async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error("No connection"));
    const { getByTestId, queryByTestId } = render(
      <QuickSessionNamePrompt
        initialName="Quick Session"
        confirmLabel="Save workout"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    fireEvent.changeText(getByTestId(`${TEST_ID}-input`), "Thursday Push");
    fireEvent.press(getByTestId(`${TEST_ID}-confirm`));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith("Thursday Push");
    });

    // The prompt stays open: the input and the card are still here, and the
    // rejection surfaces as the error.
    await waitFor(() => {
      expect(getByTestId(`${TEST_ID}-error`).props.children).toBe(
        "No connection",
      );
    });
    expect(getByTestId(`${TEST_ID}-input`)).toBeTruthy();
    expect(getByTestId(`${TEST_ID}-card`)).toBeTruthy();
    expect(queryByTestId(`${TEST_ID}-error`)).toBeTruthy();
  });
});
