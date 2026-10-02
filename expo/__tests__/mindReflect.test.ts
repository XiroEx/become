/* eslint-disable import/first */
const mockRunAiTask = jest.fn();
jest.mock("@/lib/ai/runClient", () => ({
  runAiTask: (...args: unknown[]) => mockRunAiTask(...args),
}));

import { reflectOnAnswers } from "@/lib/mind/reflect";
/* eslint-enable import/first */

describe("reflectOnAnswers (NP-101)", () => {
  beforeEach(() => {
    mockRunAiTask.mockReset();
  });

  it("returns null when no answers were given or answers are empty", async () => {
    expect(await reflectOnAnswers("Mind session", [])).toBeNull();
    expect(
      await reflectOnAnswers("Mind session", [
        { prompt: "Q1", answer: "   " },
        { prompt: "Q2", answer: "" },
      ]),
    ).toBeNull();
    expect(mockRunAiTask).not.toHaveBeenCalled();
  });

  it("formats answers and calls runAiTask with /api/ai/mind/coach non-silently", async () => {
    mockRunAiTask.mockResolvedValueOnce({
      ok: true,
      text: "  You stayed steady through the pressure. Keep moving forward.  ",
    });

    const result = await reflectOnAnswers("Mind session", [
      { prompt: "How I checked in today", answer: "Grateful" },
      { prompt: "What did you accomplish?", answer: "Shipped the feature" },
    ]);

    expect(result).toBe(
      "You stayed steady through the pressure. Keep moving forward.",
    );
    expect(mockRunAiTask).toHaveBeenCalledTimes(1);
    const [endpoint, body, opts] = mockRunAiTask.mock.calls[0]!;
    expect(endpoint).toBe("/api/ai/mind/coach");
    expect(body.message).toContain("How I checked in today → “Grateful”");
    expect(body.message).toContain("What did you accomplish? → “Shipped the feature”");
    // Non-silent run: opts.silent must NOT be true, so declined AI members see consent sheet
    expect(opts?.silent).toBeUndefined();
  });

  it("returns null when runAiTask returns ok: false (e.g. ai_consent or failure)", async () => {
    mockRunAiTask.mockResolvedValueOnce({
      ok: false,
      error: "ai_consent",
    });

    const result = await reflectOnAnswers("Mind session", [
      { prompt: "How I checked in today", answer: "Stressed" },
    ]);

    expect(result).toBeNull();
  });

  it("returns null when runAiTask throws", async () => {
    mockRunAiTask.mockRejectedValueOnce(new Error("Network failure"));

    const result = await reflectOnAnswers("Mind session", [
      { prompt: "How I checked in today", answer: "Focused" },
    ]);

    expect(result).toBeNull();
  });
});
