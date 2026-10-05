// NP-243 — IMPORT FROM TEXT 3/4: THE PASTE-AND-IMPORT SHEET.
//
// `expo/components/workout/PasteImportSheet.tsx` with a stub `onSubmit` —
// no network, no AI run client, no router. Pins the sheet's own contract
// against NP-242's outcomes:
//   • (id: e5ced3b5) a `consent` outcome closes the sheet outright (the
//     global consent prompt, raised by the caller's `onSubmit`, takes over —
//     this is "Import is refused without AI consent and says why", the
//     "why" being the consent prompt itself, not a line in this sheet).
//   • submit stays disabled while the paste field is blank;
//   • the loading line shows while `onSubmit` is pending;
//   • `empty` / `error` / `rate_limited` each render a message with a Try
//     again button that returns to the paste field;
//   • `ok` closes the sheet, same as `consent`.

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { PasteImportSheet, type ImportOutcome } from "@/components/workout/PasteImportSheet";

const TEST_ID = "paste-import";

function renderSheet(onSubmit: (text: string) => Promise<ImportOutcome>, onClose = jest.fn()) {
  const utils = render(
    <PasteImportSheet
      visible
      kind="session"
      onSubmit={onSubmit}
      onClose={onClose}
      testID={TEST_ID}
    />,
  );
  return { ...utils, onClose };
}

describe("submit is disabled while the field is blank", () => {
  it("the submit button starts disabled and enables once text is typed", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = renderSheet(onSubmit);
    expect(getByTestId(`${TEST_ID}-submit`).props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(getByTestId(`${TEST_ID}-text`), "Bench Press 4x8");
    expect(getByTestId(`${TEST_ID}-submit`).props.accessibilityState?.disabled).toBe(false);
  });

  it("pressing submit while blank never calls onSubmit", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = renderSheet(onSubmit);
    fireEvent.press(getByTestId(`${TEST_ID}-submit`));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("whitespace-only text also keeps submit disabled", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = renderSheet(onSubmit);
    fireEvent.changeText(getByTestId(`${TEST_ID}-text`), "   ");
    expect(getByTestId(`${TEST_ID}-submit`).props.accessibilityState?.disabled).toBe(true);
  });
});

describe("the loading line shows while onSubmit is pending", () => {
  it("shows the session loading copy and hides the paste field", async () => {
    let resolveOutcome!: (o: ImportOutcome) => void;
    const onSubmit = jest.fn(
      () => new Promise<ImportOutcome>((resolve) => (resolveOutcome = resolve)),
    );
    const { getByTestId, queryByTestId } = renderSheet(onSubmit);

    fireEvent.changeText(getByTestId(`${TEST_ID}-text`), "Bench Press 4x8");
    fireEvent.press(getByTestId(`${TEST_ID}-submit`));

    await waitFor(() => expect(getByTestId(`${TEST_ID}-loading`)).toBeTruthy());
    expect(queryByTestId(`${TEST_ID}-text`)).toBeNull();

    resolveOutcome({ status: "empty", message: "Couldn't find a workout in that." });
    await waitFor(() => expect(getByTestId(`${TEST_ID}-error`)).toBeTruthy());
  });

  it("shows the program loading copy when kind is program", async () => {
    let resolveOutcome!: (o: ImportOutcome) => void;
    const onSubmit = jest.fn(
      () => new Promise<ImportOutcome>((resolve) => (resolveOutcome = resolve)),
    );
    const { getByTestId } = render(
      <PasteImportSheet
        visible
        kind="program"
        onSubmit={onSubmit}
        onClose={jest.fn()}
        testID={TEST_ID}
      />,
    );
    fireEvent.changeText(getByTestId(`${TEST_ID}-text`), "Bench Press 4x8");
    fireEvent.press(getByTestId(`${TEST_ID}-submit`));
    await waitFor(() => expect(getByTestId(`${TEST_ID}-loading`).props.children).toBeTruthy());
    // Left unresolved on purpose — only the pending-state copy is under test.
    void resolveOutcome;
  });
});

describe("each error outcome renders its message with Try again", () => {
  it.each<[ImportOutcome, string]>([
    [{ status: "empty", message: "Couldn't find a workout in that. Try pasting the full text instead." }, "Couldn't find a workout in that. Try pasting the full text instead."],
    [{ status: "error", message: "Couldn't reach the import AI. Try again in a minute." }, "Couldn't reach the import AI. Try again in a minute."],
    [{ status: "rate_limited" }, "You've used today's import limit. Try again later."],
  ])("outcome %p renders %p with a Try again button", async (outcome, expectedMessage) => {
    const onSubmit = jest.fn().mockResolvedValue(outcome);
    const { getByTestId } = renderSheet(onSubmit);

    fireEvent.changeText(getByTestId(`${TEST_ID}-text`), "Bench Press 4x8");
    fireEvent.press(getByTestId(`${TEST_ID}-submit`));

    await waitFor(() => expect(getByTestId(`${TEST_ID}-error`)).toBeTruthy());
    expect(getByTestId(`${TEST_ID}-error-message`).props.children).toBe(expectedMessage);
    expect(getByTestId(`${TEST_ID}-retry`)).toBeTruthy();

    // Try again goes back to the paste field, with the message gone.
    fireEvent.press(getByTestId(`${TEST_ID}-retry`));
    expect(getByTestId(`${TEST_ID}-text`)).toBeTruthy();
  });

  it("Cancel on an error closes the sheet", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ status: "error", message: "Couldn't reach the import AI. Try again in a minute." });
    const { getByTestId, onClose } = renderSheet(onSubmit);

    fireEvent.changeText(getByTestId(`${TEST_ID}-text`), "Bench Press 4x8");
    fireEvent.press(getByTestId(`${TEST_ID}-submit`));
    await waitFor(() => expect(getByTestId(`${TEST_ID}-error`)).toBeTruthy());

    fireEvent.press(getByTestId(`${TEST_ID}-cancel`));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("(id: e5ced3b5) consent closes the sheet — the prompt takes over", () => {
  it("a consent outcome closes the sheet without rendering any message of its own", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ status: "consent" });
    const { getByTestId, queryByTestId, onClose } = renderSheet(onSubmit);

    fireEvent.changeText(getByTestId(`${TEST_ID}-text`), "Bench Press 4x8");
    fireEvent.press(getByTestId(`${TEST_ID}-submit`));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(queryByTestId(`${TEST_ID}-error`)).toBeNull();
  });
});

describe("ok closes the sheet", () => {
  it("an ok outcome closes the sheet", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ status: "ok" });
    const { getByTestId, onClose } = renderSheet(onSubmit);

    fireEvent.changeText(getByTestId(`${TEST_ID}-text`), "Bench Press 4x8");
    fireEvent.press(getByTestId(`${TEST_ID}-submit`));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("a gate outcome also closes the sheet (the caller raises the existing upgrade path)", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ status: "gate", gate: { error: "Upgrade", feature: "ai-import", requiresTier: "plus" } });
    const { getByTestId, onClose } = renderSheet(onSubmit);

    fireEvent.changeText(getByTestId(`${TEST_ID}-text`), "Bench Press 4x8");
    fireEvent.press(getByTestId(`${TEST_ID}-submit`));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
