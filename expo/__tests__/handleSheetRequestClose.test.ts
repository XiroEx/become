// NP-319 point 8: a Modal sheet's `onRequestClose` fires on Android's
// hardware back press — wiring it straight to `onClose` used to close the
// IME AND the sheet in the same press, discarding an in-progress edit.

import { Keyboard } from "react-native";
import { handleSheetRequestClose } from "@/lib/keyboard/handleSheetRequestClose";

describe("handleSheetRequestClose", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("dismisses the keyboard instead of closing the sheet while the IME is visible", () => {
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(true);
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const onClose = jest.fn();

    handleSheetRequestClose(onClose);

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the sheet when the keyboard is already hidden", () => {
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(false);
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const onClose = jest.fn();

    handleSheetRequestClose(onClose);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
