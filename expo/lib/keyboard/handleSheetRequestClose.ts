import { Keyboard } from "react-native";

/**
 * NP-319 point 8: Android's hardware back button fires a `Modal`'s
 * `onRequestClose` — inside a sheet with the IME up, wiring that straight to
 * `onClose` closed the keyboard AND the sheet on the same press, discarding
 * whatever the member was mid-typing (Find a food, Edit item). Expected
 * Android behaviour is the one every other app gives: the first back press
 * only dismisses the keyboard; the sheet itself closes on the next press.
 */
export function handleSheetRequestClose(onClose: () => void): void {
  if (Keyboard.isVisible()) {
    Keyboard.dismiss();
    return;
  }
  onClose();
}
