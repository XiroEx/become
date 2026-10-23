// The Becoming door's highlighted state: after a new weekly report the web
// paints the card as a violet gradient (`bg-gradient-to-br from-violet-600
// to-violet-500` with white ink, `doorClassName` in
// `webapp/components/dashboard/BecomingDoor.tsx`), and the calm card is the
// plain token surface. Native used to paint the unread state as flat
// per-mode `hsl()` fills — no gradient at all, and `hsl()` literals the
// no-literal ban never allowed to return.
//
// Covers `expo/components/dashboard/BecomingDoor.tsx`: the unread card draws
// an expo-linear-gradient with the two web-matching stops (violet-600 →
// violet-500, theme tokens, no colour literals) and white ink; the calm card
// draws no gradient and keeps the token surface.

import * as React from "react";
import { StyleSheet } from "react-native";
import { render, act, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import {
  becomingStageTokens,
  lightTokens,
} from "@/lib/theme/tokens";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const rgb = (triplet: string) => `rgb(${triplet})`;

/** The unread flag resolves from AsyncStorage after mount — flush it. */
function renderDoor(): ReturnType<typeof render> {
  return render(<BecomingDoor goals={null} mind={null} />);
}

describe("BecomingDoor unread gradient (web parity)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("calm card: no gradient, token surface", async () => {
    const { queryByTestId, getByTestId } = renderDoor();
    // Let the post-mount storage read land (it resolves unread=false here).
    await act(async () => {});
    expect(queryByTestId("becoming-door-gradient")).toBeNull();
    expect(getByTestId("becoming-door")).toBeTruthy();
  });

  it("unread card: violet-600 → violet-500 gradient with white ink", async () => {
    // A member with history who has not opened this week's door: exactly the
    // web's `readUnread` (seen before, not seen this week).
    await AsyncStorage.setItem("becoming.everSeen", "1");
    const { getByTestId, getByText, findByTestId } = renderDoor();

    const gradient = await findByTestId("becoming-door-gradient");
    expect(gradient.props.colors).toEqual([
      rgb(becomingStageTokens.doorVioletFrom),
      rgb(lightTokens["mind-violet"]),
    ]);
    // `bg-gradient-to-br`: top-left → bottom-right.
    expect(gradient.props.start).toEqual({ x: 0, y: 0 });
    expect(gradient.props.end).toEqual({ x: 1, y: 1 });

    // White ink on the gradient, as the web's `text-white*` classes.
    const titleStyle = StyleSheet.flatten(
      getByText("Then → now → next, across all three").props.style,
    );
    expect(titleStyle.color).toBe(rgb(becomingStageTokens.ink));
    expect(getByTestId("becoming-door")).toBeTruthy();
  });

  it("opening the door clears the highlight", async () => {
    await AsyncStorage.setItem("becoming.everSeen", "1");
    const { getByTestId, queryByTestId, findByTestId } = renderDoor();
    await findByTestId("becoming-door-gradient");

    await act(async () => {
      fireEvent.press(getByTestId("becoming-door"));
    });
    expect(queryByTestId("becoming-door-gradient")).toBeNull();
  });
});
