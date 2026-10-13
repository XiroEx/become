/**
 * Jest mock for @react-native-community/datetimepicker.
 *
 * A node_modules mock in `__mocks__/` next to `node_modules` is applied
 * AUTOMATICALLY — no `jest.mock()` call. The real component renders native
 * UI (an Android system dialog, an iOS inline spinner) the test renderer
 * cannot mount, so this stand-in is a single pressable surface at the
 * caller's `testID`. Pressing it fires `onChange` with a fixed 09:45 pick,
 * the same shape (`{ type: "set" }`, a `Date`) the real Android dialog hands
 * back when the user taps OK — enough for
 * `__tests__/mealScheduleEditor.test.tsx` to prove the round trip (tap the
 * clock -> dialog "opens" -> pick a time -> the field shows it, autosaved)
 * without needing the native picker UI.
 */
const React = require("react");
const { Pressable } = require("react-native");

const MOCK_PICKED_DATE = new Date(2024, 0, 1, 9, 45, 0, 0);

function DateTimePicker({ testID, onChange }) {
  return React.createElement(Pressable, {
    testID,
    accessibilityLabel: "mock-time-picker",
    onPress: () => onChange?.({ type: "set" }, MOCK_PICKED_DATE),
  });
}

module.exports = DateTimePicker;
module.exports.default = DateTimePicker;
module.exports.MOCK_PICKED_DATE = MOCK_PICKED_DATE;
module.exports.DateTimePickerAndroid = {
  open: ({ onChange }) => onChange?.({ type: "set" }, MOCK_PICKED_DATE),
  dismiss: () => Promise.resolve(false),
};
