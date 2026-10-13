// NP-319 — Android has no built-in "scroll the focused TextInput into view"
// the way iOS's ScrollView does, and with targetSdk 35 edge-to-edge,
// `windowSoftInputMode=adjustResize` no longer shrinks the window to make
// room either. This is the generalised form of NP-309's hand-rolled fix on
// the login screen.

import { act, renderHook } from "@testing-library/react-native";
import { Dimensions, Keyboard, Platform } from "react-native";
import { useScrollFocusedFieldIntoView } from "@/lib/keyboard/useScrollFocusedFieldIntoView";

type KeyboardShowListener = (event: { endCoordinates: { height: number } }) => void;

function mockKeyboardDidShow(): { fire: KeyboardShowListener } {
  let listener: KeyboardShowListener = () => {};
  jest.spyOn(Keyboard, "addListener").mockImplementation((event: string, cb: unknown) => {
    if (event === "keyboardDidShow") listener = cb as KeyboardShowListener;
    return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  return {
    fire: (event) => listener(event),
  };
}

describe("useScrollFocusedFieldIntoView", () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it("does nothing on iOS — its ScrollView already scrolls the focused field into view itself", () => {
    Platform.OS = "ios";
    const addListener = jest.spyOn(Keyboard, "addListener");
    const scrollRef = { current: { scrollTo: jest.fn() } };

    renderHook(() => useScrollFocusedFieldIntoView(scrollRef));

    expect(addListener).not.toHaveBeenCalled();
  });

  it("scrolls the active field above the keyboard on Android when it overflows", () => {
    Platform.OS = "android";
    const { fire } = mockKeyboardDidShow();
    jest.spyOn(Dimensions, "get").mockReturnValue({
      height: 800,
      width: 400,
      scale: 1,
      fontScale: 1,
    });

    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const { result } = renderHook(() => useScrollFocusedFieldIntoView(scrollRef));

    // Field bottom (700 + 50 = 750) sits under a 300px keyboard
    // (visibleBottom = 800 - 300 = 500) — 250px of overflow.
    const field = {
      measureInWindow: (
        cb: (x: number, y: number, w: number, h: number) => void,
      ) => cb(0, 700, 300, 50),
    };

    act(() => {
      result.current.setActiveField(field);
    });
    act(() => {
      fire({ endCoordinates: { height: 300 } });
    });

    expect(scrollTo).toHaveBeenCalledWith({ y: 266, animated: true });
  });

  it("adds the current scroll offset (tracked via onScroll) to the computed overflow", () => {
    Platform.OS = "android";
    const { fire } = mockKeyboardDidShow();
    jest.spyOn(Dimensions, "get").mockReturnValue({
      height: 800,
      width: 400,
      scale: 1,
      fontScale: 1,
    });

    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const { result } = renderHook(() => useScrollFocusedFieldIntoView(scrollRef));

    act(() => {
      result.current.onScroll({
        nativeEvent: { contentOffset: { y: 100 } },
      } as never);
    });

    const field = {
      measureInWindow: (
        cb: (x: number, y: number, w: number, h: number) => void,
      ) => cb(0, 700, 300, 50),
    };
    act(() => {
      result.current.setActiveField(field);
    });
    act(() => {
      fire({ endCoordinates: { height: 300 } });
    });

    expect(scrollTo).toHaveBeenCalledWith({ y: 366, animated: true });
  });

  it("does not scroll when no field is active yet", () => {
    Platform.OS = "android";
    const { fire } = mockKeyboardDidShow();
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    renderHook(() => useScrollFocusedFieldIntoView(scrollRef));

    act(() => {
      fire({ endCoordinates: { height: 300 } });
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll when the active field is already fully visible", () => {
    Platform.OS = "android";
    const { fire } = mockKeyboardDidShow();
    jest.spyOn(Dimensions, "get").mockReturnValue({
      height: 800,
      width: 400,
      scale: 1,
      fontScale: 1,
    });

    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const { result } = renderHook(() => useScrollFocusedFieldIntoView(scrollRef));

    // Field bottom (100 + 50 = 150) is well above visibleBottom (500).
    const field = {
      measureInWindow: (
        cb: (x: number, y: number, w: number, h: number) => void,
      ) => cb(0, 100, 300, 50),
    };
    act(() => {
      result.current.setActiveField(field);
    });
    act(() => {
      fire({ endCoordinates: { height: 300 } });
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("clearing the active field (e.g. on blur) stops it from scrolling into view", () => {
    Platform.OS = "android";
    const { fire } = mockKeyboardDidShow();
    jest.spyOn(Dimensions, "get").mockReturnValue({
      height: 800,
      width: 400,
      scale: 1,
      fontScale: 1,
    });

    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const { result } = renderHook(() => useScrollFocusedFieldIntoView(scrollRef));

    const field = {
      measureInWindow: (
        cb: (x: number, y: number, w: number, h: number) => void,
      ) => cb(0, 700, 300, 50),
    };
    act(() => {
      result.current.setActiveField(field);
    });
    act(() => {
      result.current.setActiveField(null);
    });
    act(() => {
      fire({ endCoordinates: { height: 300 } });
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
