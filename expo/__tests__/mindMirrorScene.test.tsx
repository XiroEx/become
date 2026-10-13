import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { View } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import {
  MirrorScene,
  MIRROR_HOLD_MS,
  MIRROR_PASS,
  MIRROR_DONE_MS,
} from "@/components/mind/session/scenes/MirrorScene";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";

const mockSpeech = ExpoSpeechRecognitionModule as unknown as {
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
  id: "move-mirror-1",
  kind: "mirror",
  title: "Mirror",
  subtitle: "Look at yourself. Say it.",
  statement: "I choose to be disciplined",
  xp: 5,
};

const GRANTED = {
  status: "granted",
  granted: true,
  canAskAgain: true,
  expires: "never",
};

const DENIED = {
  status: "denied",
  granted: false,
  canAskAgain: false,
  expires: "never",
};

function mockCamera(permission: typeof GRANTED | typeof DENIED | null) {
  const requestPermission = jest.fn(async () => permission);
  const permissionImpl = jest.fn(() => [permission, requestPermission]) as any;
  const cameraCalls: { facing?: string }[] = [];
  const CameraStub = ({ facing, testID }: any) => {
    cameraCalls.push({ facing });
    return <View testID={testID ?? "mock-camera-view"} />;
  };
  return { permissionImpl, requestPermission, cameraCalls, CameraStub };
}

describe("MirrorScene (NP-100)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSpeech.__clearAllListeners();
    mockSpeech.isRecognitionAvailable.mockReturnValue(true);
    mockSpeech.requestPermissionsAsync.mockResolvedValue(
      mockSpeech.__GRANTED,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Acceptance e015c8ea ──────────────────────────────────────────────────
  it("(id: e015c8ea) shows the front camera mirrored and passes on speech", async () => {
    expect(MIRROR_PASS).toBe(0.6);
    const onDone = jest.fn();
    const haptic = jest.fn();
    const cam = mockCamera(GRANTED);

    const { getByTestId, queryByTestId } = render(
      <MirrorScene
        move={MOVE}
        onDone={onDone}
        haptic={haptic}
        permissionImpl={cam.permissionImpl}
        cameraImpl={cam.CameraStub as any}
      />,
    );

    // Front camera preview is mounted…
    expect(getByTestId("mind-mirror-scene-camera")).toBeTruthy();
    expect(cam.cameraCalls[0]?.facing).toBe("front");
    expect(queryByTestId("mind-mirror-scene-no-camera")).toBeNull();

    // …and the beat starts on speech.
    expect(getByTestId("mind-mirror-scene-idle")).toBeTruthy();
    fireEvent.press(getByTestId("mind-mirror-scene-start-button"));
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(mockSpeech.start).toHaveBeenCalled();
    expect(getByTestId("mind-mirror-scene-listening")).toBeTruthy();

    // Say the whole statement: words light up and the beat locks in.
    act(() => {
      mockSpeech.emit("result", {
        isFinal: true,
        results: [{ transcript: "I choose to be disciplined" }],
      });
    });
    expect(getByTestId("mind-mirror-scene-done")).toBeTruthy();
    expect(haptic).toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(MIRROR_DONE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // ── Acceptance e015c8eb ──────────────────────────────────────────────────
  it("(id: e015c8eb) with camera permission denied the scene still completes", async () => {
    const onDone = jest.fn();
    const haptic = jest.fn();
    const cam = mockCamera(DENIED);

    const { getByTestId, queryByTestId } = render(
      <MirrorScene
        move={MOVE}
        onDone={onDone}
        haptic={haptic}
        permissionImpl={cam.permissionImpl}
        cameraImpl={cam.CameraStub as any}
      />,
    );

    // No video — but not a blocked session.
    expect(queryByTestId("mind-mirror-scene-camera")).toBeNull();
    expect(getByTestId("mind-mirror-scene-no-camera")).toBeTruthy();

    // Speech still passes the beat.
    fireEvent.press(getByTestId("mind-mirror-scene-start-button"));
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    act(() => {
      mockSpeech.emit("result", {
        isFinal: true,
        results: [{ transcript: "I choose to be disciplined" }],
      });
    });
    expect(getByTestId("mind-mirror-scene-done")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(MIRROR_DONE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // ── Acceptance e015c8ec ──────────────────────────────────────────────────
  it("(id: e015c8ec) the camera indicator turns off as soon as the scene ends", async () => {
    const onDone = jest.fn();
    const cam = mockCamera(GRANTED);

    const { getByTestId, queryByTestId, unmount } = render(
      <MirrorScene
        move={MOVE}
        onDone={onDone}
        permissionImpl={cam.permissionImpl}
        cameraImpl={cam.CameraStub as any}
      />,
    );

    // Camera is on while the beat is live…
    expect(getByTestId("mind-mirror-scene-camera")).toBeTruthy();

    // …and unmounts the moment the beat passes (the preview unmount is what
    // releases the camera and turns the indicator off).
    fireEvent.press(getByTestId("mind-mirror-scene-start-button"));
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    act(() => {
      mockSpeech.emit("result", {
        isFinal: true,
        results: [{ transcript: "I choose to be disciplined" }],
      });
    });
    expect(getByTestId("mind-mirror-scene-done")).toBeTruthy();
    expect(queryByTestId("mind-mirror-scene-camera")).toBeNull();

    // …and unmounting the scene releases it too.
    unmount();
    expect(mockSpeech.stop).toHaveBeenCalled();
  });

  it("falls back to press-and-hold when speech is unsupported", () => {
    mockSpeech.isRecognitionAvailable.mockReturnValue(false);
    const onDone = jest.fn();
    const cam = mockCamera(GRANTED);

    const { getByTestId } = render(
      <MirrorScene
        move={MOVE}
        onDone={onDone}
        permissionImpl={cam.permissionImpl}
        cameraImpl={cam.CameraStub as any}
      />,
    );

    expect(getByTestId("mind-mirror-scene-fallback")).toBeTruthy();
    expect(getByTestId("mind-mirror-scene-hold-button")).toBeTruthy();

    fireEvent(getByTestId("mind-mirror-scene-hold-button"), "pressIn");
    act(() => {
      jest.advanceTimersByTime(MIRROR_HOLD_MS + 50);
    });
    expect(getByTestId("mind-mirror-scene-done")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(MIRROR_DONE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("switches to WriteAffirm when 'Write instead' is tapped", () => {
    const onDone = jest.fn();
    const cam = mockCamera(GRANTED);

    const { getByTestId } = render(
      <MirrorScene
        move={MOVE}
        onDone={onDone}
        permissionImpl={cam.permissionImpl}
        cameraImpl={cam.CameraStub as any}
      />,
    );

    fireEvent.press(getByTestId("mind-mirror-scene-write-instead"));
    expect(getByTestId("mind-mirror-scene-write")).toBeTruthy();
  });
});
