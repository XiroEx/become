import { act, renderHook } from "@testing-library/react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

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

describe("useSpeechRecognition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModule.__clearAllListeners();
    mockModule.isRecognitionAvailable.mockReturnValue(true);
    mockModule.requestPermissionsAsync.mockResolvedValue(mockModule.__GRANTED);
  });

  it("reports supported=true when recognition is available", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(true);
    expect(result.current.api).toBe("SpeechRecognition");
    expect(result.current.listening).toBe(false);
    expect(result.current.transcript).toBe("");
    expect(result.current.error).toBeNull();
  });

  it("reports supported=false when recognition is unavailable", () => {
    mockModule.isRecognitionAvailable.mockReturnValue(false);
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(false);
    expect(result.current.api).toBeNull();

    act(() => {
      result.current.start();
    });
    expect(result.current.error).toBe("not-supported");
  });

  it("starts listening and accumulates interim and final transcripts", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      result.current.start();
    });

    expect(mockModule.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockModule.start).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: "en-US",
        interimResults: true,
        continuous: true,
      }),
    );
    expect(result.current.listening).toBe(true);

    // Interim result
    act(() => {
      mockModule.emit("result", {
        isFinal: false,
        results: [{ transcript: "I choose" }],
      });
    });
    expect(result.current.transcript).toBe("I choose");

    // Next interim result
    act(() => {
      mockModule.emit("result", {
        isFinal: false,
        results: [{ transcript: "I choose to be" }],
      });
    });
    expect(result.current.transcript).toBe("I choose to be");

    // Final result
    act(() => {
      mockModule.emit("result", {
        isFinal: true,
        results: [{ transcript: "I choose to be disciplined" }],
      });
    });
    expect(result.current.transcript).toBe("I choose to be disciplined");

    // Stop listening
    act(() => {
      result.current.stop();
    });
    expect(mockModule.stop).toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });

  it("handles denied permissions with error=not-allowed", async () => {
    mockModule.requestPermissionsAsync.mockResolvedValueOnce({
      status: "denied",
      granted: false,
    });

    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      result.current.start();
    });

    expect(result.current.error).toBe("not-allowed");
    expect(result.current.listening).toBe(false);
  });

  it("surfaces native error events except benign ones", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      result.current.start();
    });

    // no-speech is benign
    act(() => {
      mockModule.emit("error", { error: "no-speech" });
    });
    expect(result.current.error).toBeNull();

    // aborted is benign
    act(() => {
      mockModule.emit("error", { error: "aborted" });
    });
    expect(result.current.error).toBeNull();

    // service-not-allowed surfaces
    act(() => {
      mockModule.emit("error", { error: "service-not-allowed" });
    });
    expect(result.current.error).toBe("service-not-allowed");
  });

  it("auto-restarts on engine pause while still wanting to listen", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      result.current.start();
    });
    expect(mockModule.start).toHaveBeenCalledTimes(1);

    // Recognition ends due to engine silence timeout
    act(() => {
      mockModule.emit("end", null);
    });

    // Should automatically restart
    expect(mockModule.start).toHaveBeenCalledTimes(2);

    // Explicit stop prevents further auto-restart
    act(() => {
      result.current.stop();
    });
    act(() => {
      mockModule.emit("end", null);
    });
    expect(mockModule.start).toHaveBeenCalledTimes(2);
  });

  it("resets transcript and error on reset()", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      result.current.start();
    });
    act(() => {
      mockModule.emit("result", {
        isFinal: true,
        results: [{ transcript: "some words" }],
      });
      mockModule.emit("error", { error: "network" });
    });

    expect(result.current.transcript).toBe("some words");
    expect(result.current.error).toBe("network");

    act(() => {
      result.current.reset();
    });

    expect(result.current.transcript).toBe("");
    expect(result.current.error).toBeNull();
  });
});
