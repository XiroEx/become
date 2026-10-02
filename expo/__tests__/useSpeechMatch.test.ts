import { act, renderHook } from "@testing-library/react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { matchSpeech, normalizeWords } from "@become/core";
import { useSpeechMatch } from "@/hooks/useSpeechMatch";

const mockModule = ExpoSpeechRecognitionModule as unknown as {
  isRecognitionAvailable: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  emit: (event: string, payload: unknown) => void;
  __clearAllListeners: () => void;
  __GRANTED: { status: string; granted: boolean };
};

describe("useSpeechMatch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModule.__clearAllListeners();
    mockModule.isRecognitionAvailable.mockReturnValue(true);
    mockModule.requestPermissionsAsync.mockResolvedValue(mockModule.__GRANTED);
  });

  // ── Acceptance e015c8e6 ──────────────────────────────────────────────────
  it("(id: e015c8e6) The same transcript passes or fails natively exactly as the web matcher decides", () => {
    // Both web and native share the vendored matchSpeech from @become/core.
    // Verify agreement across diverse statement/transcript pairs.
    const testCases: { target: string; spoken: string; expectedRatio: number }[] = [
      {
        target: "I choose to show up with intention every single day",
        spoken: "I choose to show up with intention every single day",
        expectedRatio: 1.0,
      },
      {
        target: "I choose to show up with intention every single day",
        spoken: "I choose show up with intention single day",
        // 8 of 10 words (missing "to" and "every")
        expectedRatio: 8 / 10,
      },
      {
        target: "I am disciplined and focused",
        spoken: "I am disciplined and focused",
        expectedRatio: 1.0,
      },
      {
        target: "I am disciplined and focused",
        spoken: "I'm disciplined and focus", // "i'm" doesn't match single-letter "i" or "am", 3/5 words match
        expectedRatio: 3 / 5,
      },
      {
        target: "I am disciplined and focused",
        spoken: "something completely unrelated spoken here",
        expectedRatio: 0,
      },
      {
        target: "Stronger every day",
        spoken: "stronger every",
        expectedRatio: 2 / 3,
      },
      {
        target: "I will not break my streak today",
        spoken: "I will not break my streak today definitely",
        expectedRatio: 1.0,
      },
    ];

    for (const { target, spoken, expectedRatio } of testCases) {
      const result = matchSpeech(target, spoken);
      expect(result.ratio).toBeCloseTo(expectedRatio, 2);

      const words = normalizeWords(target);
      expect(result.matched.length).toBe(words.length);
      expect(result.total).toBe(words.length);
    }
  });

  it("maintains sticky per-word matches — interim flicker never un-lights a word", async () => {
    const target = "I choose to be disciplined";
    const { result } = renderHook(() => useSpeechMatch(target, { threshold: 0.85 }));

    await act(async () => {
      result.current.start();
    });

    // First interim: "I choose to"
    act(() => {
      mockModule.emit("result", {
        isFinal: false,
        results: [{ transcript: "I choose to" }],
      });
    });

    expect(result.current.matched).toEqual([true, true, true, false, false]);
    expect(result.current.matchedCount).toBe(3);

    // Recognizer interim flicker drops "to" momentarily: "I choose"
    act(() => {
      mockModule.emit("result", {
        isFinal: false,
        results: [{ transcript: "I choose" }],
      });
    });

    // "to" must remain sticky and NOT un-light!
    expect(result.current.matched).toEqual([true, true, true, false, false]);
    expect(result.current.matchedCount).toBe(3);

    // User finishes the sentence: "be disciplined"
    act(() => {
      mockModule.emit("result", {
        isFinal: true,
        results: [{ transcript: "I choose to be disciplined" }],
      });
    });

    expect(result.current.matched).toEqual([true, true, true, true, true]);
    expect(result.current.matchedCount).toBe(5);
    expect(result.current.ratio).toBe(1.0);
    expect(result.current.passed).toBe(true);
  });

  it("requires reaching the end of the line to pass", async () => {
    const target = "I choose to be disciplined and focused today";
    // 8 words total. 85% threshold = 7 words.
    const onPassed = jest.fn();
    const { result } = renderHook(() =>
      useSpeechMatch(target, { threshold: 0.85, onPassed }),
    );

    await act(async () => {
      result.current.start();
    });

    // Say first 6 words — reaches "disciplined", hasn't reached end
    act(() => {
      mockModule.emit("result", {
        isFinal: false,
        results: [{ transcript: "I choose to be disciplined and" }],
      });
    });

    // ratio = 6/8 = 0.75, not reached end
    expect(result.current.passed).toBe(false);
    expect(onPassed).not.toHaveBeenCalled();

    // Now speaker reaches the end of the line:
    act(() => {
      mockModule.emit("result", {
        isFinal: true,
        results: [{ transcript: "I choose to be disciplined and focused today" }],
      });
    });

    expect(result.current.passed).toBe(true);
    expect(onPassed).toHaveBeenCalledTimes(1);
  });

  it("computes optimistic statuses with look-ahead glow and missed tags", async () => {
    const target = "One two three four five six seven";
    const { result } = renderHook(() => useSpeechMatch(target));

    await act(async () => {
      result.current.start();
    });

    // User skipped "two" and spoke "three": "One three"
    act(() => {
      mockModule.emit("result", {
        isFinal: false,
        results: [{ transcript: "One three" }],
      });
    });

    // frontier is index 2 ("three").
    // index 0 ("One") = matched
    // index 1 ("two") = missed (behind frontier)
    // index 2 ("three") = matched
    // index 3-4 ("four", "five") = matched (lookahead glow of 2)
    // index 5-6 ("six", "seven") = pending
    expect(result.current.statuses[0]).toBe("matched");
    expect(result.current.statuses[1]).toBe("missed");
    expect(result.current.statuses[2]).toBe("matched");
    expect(result.current.statuses[3]).toBe("matched"); // lookahead
    expect(result.current.statuses[4]).toBe("matched"); // lookahead
    expect(result.current.statuses[5]).toBe("pending");
    expect(result.current.statuses[6]).toBe("pending");
  });

  it("resets state when target changes", () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useSpeechMatch>,
      { target: string }
    >(({ target }) => useSpeechMatch(target), {
      initialProps: { target: "First target" },
    });

    expect(result.current.targetWords).toEqual(["first", "target"]);
    expect(result.current.matched).toEqual([false, false]);

    rerender({ target: "A completely different second target" });
    expect(result.current.targetWords).toEqual([
      "a",
      "completely",
      "different",
      "second",
      "target",
    ]);
    expect(result.current.matched).toEqual([false, false, false, false, false]);
  });
});
