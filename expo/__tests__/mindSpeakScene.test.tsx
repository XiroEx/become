import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import {
  SpeakScene,
  FALLBACK_HOLD_MS,
  HOLD_TICK_MS,
} from "@/components/mind/session/scenes/SpeakScene";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";

const mockModule = ExpoSpeechRecognitionModule as unknown as {
  isRecognitionAvailable: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  abort: jest.Mock;
  emit: (event: string, payload: unknown) => void;
  __clearAllListeners: () => void;
  __GRANTED: { status: string; granted: boolean };
};

const MOVE: MindSceneProps["move"] = {
  id: "move-speak-1",
  kind: "speak",
  title: "Declaration",
  statement: "I choose to be disciplined",
  xp: 10,
};

describe("SpeakScene (NP-099)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockModule.__clearAllListeners();
    mockModule.isRecognitionAvailable.mockReturnValue(true);
    mockModule.requestPermissionsAsync.mockResolvedValue(mockModule.__GRANTED);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Acceptance e015c8e4 ──────────────────────────────────────────────────
  it("(id: e015c8e4) On a real iPhone and Android phone, saying the statement passes the beat with words lighting up as spoken", async () => {
    const onDone = jest.fn();
    const haptic = jest.fn();

    const { getByTestId, queryByTestId } = render(
      <SpeakScene move={MOVE} onDone={onDone} haptic={haptic} />,
    );

    // Initial state: idle prompt, plain words
    expect(getByTestId("mind-speak-scene-idle")).toBeTruthy();
    expect(queryByTestId("mind-speak-scene-done")).toBeNull();

    // Tap to start speaking
    fireEvent.press(getByTestId("mind-speak-scene-start-button"));
    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    expect(mockModule.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockModule.start).toHaveBeenCalled();
    expect(getByTestId("mind-speak-scene-listening")).toBeTruthy();

    // Partial speech: "I choose"
    act(() => {
      mockModule.emit("result", {
        isFinal: false,
        results: [{ transcript: "I choose" }],
      });
    });

    // Words light up: index 0 and 1 are spoken, next words have lookahead glow
    const word0 = getByTestId("mind-speak-scene-word-0");
    const word1 = getByTestId("mind-speak-scene-word-1");
    expect(word0.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: expect.any(String) }),
      ]),
    );
    expect(word1.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: expect.any(String) }),
      ]),
    );

    // Complete speech: "I choose to be disciplined"
    act(() => {
      mockModule.emit("result", {
        isFinal: true,
        results: [{ transcript: "I choose to be disciplined" }],
      });
    });

    // Passed! Shows "Locked in." and triggers haptic
    expect(getByTestId("mind-speak-scene-done")).toBeTruthy();
    expect(haptic).toHaveBeenCalled();

    // After done timeout (1100ms), onDone is called
    act(() => {
      jest.advanceTimersByTime(1100);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // ── Acceptance e015c8e5 ──────────────────────────────────────────────────
  it("(id: e015c8e5) Denying the microphone falls back to hold-to-affirm and the session continues", async () => {
    mockModule.requestPermissionsAsync.mockResolvedValueOnce({
      status: "denied",
      granted: false,
    });

    const onDone = jest.fn();
    const haptic = jest.fn();

    const { getByTestId, queryByTestId } = render(
      <SpeakScene move={MOVE} onDone={onDone} haptic={haptic} />,
    );

    // Press start, permission is denied
    fireEvent.press(getByTestId("mind-speak-scene-start-button"));
    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    // Falls back to hold-to-affirm
    expect(getByTestId("mind-speak-scene-fallback")).toBeTruthy();
    expect(getByTestId("mind-speak-scene-hold-button")).toBeTruthy();
    expect(queryByTestId("mind-speak-scene-listening")).toBeNull();

    // Member presses and holds for FALLBACK_HOLD_MS (2600ms)
    fireEvent(getByTestId("mind-speak-scene-hold-button"), "pressIn");
    act(() => {
      jest.advanceTimersByTime(FALLBACK_HOLD_MS + HOLD_TICK_MS);
    });

    // Locked in!
    expect(getByTestId("mind-speak-scene-done")).toBeTruthy();
    expect(haptic).toHaveBeenCalled();

    // Advances to next move
    act(() => {
      jest.advanceTimersByTime(1100);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("falls back to hold-to-affirm when speech recognition is unsupported", async () => {
    mockModule.isRecognitionAvailable.mockReturnValue(false);

    const onDone = jest.fn();
    const { getByTestId } = render(
      <SpeakScene move={MOVE} onDone={onDone} />,
    );

    // Unsupported: renders fallback immediately
    expect(getByTestId("mind-speak-scene-fallback")).toBeTruthy();
    expect(getByTestId("mind-speak-scene-hold-button")).toBeTruthy();

    // Hold to affirm
    fireEvent(getByTestId("mind-speak-scene-hold-button"), "pressIn");
    act(() => {
      jest.advanceTimersByTime(FALLBACK_HOLD_MS + HOLD_TICK_MS);
    });
    expect(getByTestId("mind-speak-scene-done")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1100);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("allows locking in anyway when listening (mis-hears escape hatch)", async () => {
    const onDone = jest.fn();
    const { getByTestId } = render(
      <SpeakScene move={MOVE} onDone={onDone} />,
    );

    fireEvent.press(getByTestId("mind-speak-scene-start-button"));
    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    // Tap "Lock it in anyway"
    fireEvent.press(getByTestId("mind-speak-scene-lock-anyway"));

    expect(getByTestId("mind-speak-scene-done")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1100);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("switches to WriteAffirm when 'Prefer to write it?' is tapped", () => {
    const onDone = jest.fn();
    const { getByTestId } = render(
      <SpeakScene move={MOVE} onDone={onDone} />,
    );

    fireEvent.press(getByTestId("mind-speak-scene-prefer-write"));
    expect(getByTestId("mind-speak-scene-write")).toBeTruthy();
  });
});
