import { useEffect, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import { Button } from "@/components/Button";

/**
 * Is the soft keyboard up right now?
 *
 * The keyboard lives outside React (it is an OS event), so it arrives
 * through a subscription. iOS gets the `will` events so the accessory
 * appears with the keyboard rather than after it; Android only ever fires
 * the `did` pair.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export interface KeyboardDoneBarProps {
  /**
   * Override the keyboard check. The default is {@link useKeyboardVisible};
   * a test passes `true` because jest has no soft keyboard to raise.
   */
  visible?: boolean;
  /** Defaults to dismissing the keyboard, which is the whole point of it. */
  onDone?: () => void;
  testID?: string;
}

/**
 * THE DONE KEY THE NUMBER PAD DOES NOT HAVE (NP-288).
 *
 * `keyboardType="number-pad"` / `"decimal-pad"` has no return key on either
 * platform, so a member who typed their reps had no way to put the keyboard
 * away — and on a phone the pad covers the step's own buttons, including
 * `Complete Set →`. This is the accessory row the web never needs: one
 * `Done` that dismisses the keyboard, rendered only while the keyboard is
 * actually up, directly above the step's action row (which a
 * `KeyboardAvoidingView` has by then lifted clear of the pad).
 */
export function KeyboardDoneBar({
  visible,
  onDone,
  testID = "keyboard-done",
}: KeyboardDoneBarProps) {
  const keyboardUp = useKeyboardVisible();
  const show = visible ?? keyboardUp;
  if (!show) return null;
  return (
    <View
      testID={`${testID}-bar`}
      style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 8 }}
    >
      <Button
        testID={testID}
        variant="secondary"
        size="sm"
        accessibilityLabel="Done editing"
        accessibilityHint="Closes the number pad"
        onPress={() => (onDone ? onDone() : Keyboard.dismiss())}
      >
        Done
      </Button>
    </View>
  );
}
