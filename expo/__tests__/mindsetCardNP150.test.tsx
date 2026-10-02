import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { MindsetCard } from "@/components/dashboard/MindsetCard";
import {
  chapterProgressPct,
  mindsetCta,
  mindsetStatus,
  resolveMindsetMood,
  visibleLastState,
} from "@/lib/mind/mindsetCard";
import { moodGateway } from "@become/core";
import type { MindSummaryResponse } from "@become/api-client";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

function summary(
  overrides: Partial<MindSummaryResponse> = {},
): MindSummaryResponse {
  return {
    todayKey: "2026-09-30",
    level: 3,
    levelPct: 40,
    chapter: 2,
    chapterName: "Foundations",
    sessionsIntoChapter: 3,
    sessionsPerChapter: 7,
    sessionDoneToday: false,
    mainSessionAvailable: true,
    sessionsLast7Days: 2,
    moodCheckinsLast7Days: 4,
    todayMood: null,
    lastState: null,
    ...overrides,
  };
}

describe("NP-150: native Mindset card from GET /api/mind/summary", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  // ─── e015ca0e: same level, chapter progress and session status as the web ──
  describe("e015ca0e: the native card shows the same level, chapter progress and session status as the web's", () => {
    it("renders level, chapter and sessions-into-chapter from the summary", () => {
      const { getByTestId } = render(<MindsetCard summary={summary()} />);
      expect(getByTestId("mindset-card-level").props.children).toEqual(
        expect.arrayContaining([
          expect.anything(),
          expect.anything(),
          expect.anything(),
        ]),
      );
      // The joined text carries the same words the web renders.
      const level = getByTestId("mindset-card-level");
      const text = flatten(level.props.children);
      expect(text).toContain("Level 3");
      expect(text).toContain("Chapter 2");
      expect(text).toContain("Foundations");
      expect(getByTestId("mindset-card-progress-label").props.children).toEqual(
        expect.arrayContaining([3, 7]),
      );
    });

    it("matches the web's chapter progress percent maths", () => {
      expect(chapterProgressPct(summary())).toBe(
        Math.round((3 / 7) * 100),
      );
      expect(chapterProgressPct(summary({ sessionsPerChapter: 0 }))).toBe(0);
    });

    it("shows the ready status and Start CTA when today's session is available", () => {
      const { getByTestId } = render(<MindsetCard summary={summary()} />);
      expect(mindsetStatus(summary())).toEqual({
        done: false,
        text: "Today's session is ready",
      });
      expect(flatten(getByTestId("mindset-card-status").props.children)).toContain(
        "Today's session is ready",
      );
      expect(mindsetCta(summary(), null)).toBe("Start today's session");
      expect(
        getByTestId("mindset-card-cta").props.accessibilityLabel,
      ).toBe("Start today's session");
    });

    it("shows the done status and Training Grounds CTA when today's session is done", () => {
      const done = summary({ sessionDoneToday: true });
      const { getByTestId } = render(<MindsetCard summary={done} />);
      expect(mindsetStatus(done)).toEqual({
        done: true,
        text: "Today's session done",
      });
      expect(flatten(getByTestId("mindset-card-status").props.children)).toContain(
        "Today's session done",
      );
      expect(mindsetCta(done, 1)).toBe("Training Grounds");
      expect(getByTestId("mindset-card-cta").props.accessibilityLabel).toBe(
        "Training Grounds",
      );
    });

    it("shows the Training Grounds fallback when no main session is available", () => {
      const s = summary({ mainSessionAvailable: false });
      expect(mindsetStatus(s)).toEqual({
        done: false,
        text: "Session done · Training Grounds open",
      });
      expect(mindsetCta(s, null)).toBe("Training Grounds");
    });

    it("shows this week's check-ins and sessions, and the last state within 24h only", () => {
      const now = Date.now();
      const fresh = summary({
        lastState: {
          state: "low_energy",
          feeling: "Drained",
          at: now - 2 * 3_600_000,
        },
      });
      const { getByTestId } = render(<MindsetCard summary={fresh} />);
      const week = flatten(getByTestId("mindset-card-week").props.children);
      expect(week).toContain("4 mood check-ins");
      expect(week).toContain("2 sessions");
      expect(week).toContain("drained");
      expect(visibleLastState(fresh, now)).toBe("drained");

      const stale = summary({
        lastState: { state: "stressed", feeling: null, at: now - 25 * 3_600_000 },
      });
      expect(visibleLastState(stale, now)).toBeNull();
      const { queryByTestId } = render(<MindsetCard summary={stale} />);
      expect(flatten(queryByTestId("mindset-card-week")!.props.children)).not.toContain(
        "stressed",
      );
    });

    it("prefers the check-in mood, then the summary's todayMood", () => {
      expect(resolveMindsetMood(2, summary({ todayMood: 5 }))).toBe(2);
      expect(resolveMindsetMood(null, summary({ todayMood: 4 }))).toBe(4);
      expect(resolveMindsetMood(null, summary())).toBeNull();
      expect(resolveMindsetMood(9, summary())).toBeNull();
    });

    it("opens the native Mind tab, never the web", () => {
      const onOpenMind = jest.fn();
      const { getByTestId } = render(
        <MindsetCard summary={summary()} onOpenMind={onOpenMind} />,
      );
      fireEvent.press(getByTestId("mindset-card-cta"));
      expect(onOpenMind).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("falls back to the Mind tab route when no handler is passed", () => {
      const { getByTestId } = render(<MindsetCard summary={summary()} />);
      fireEvent.press(getByTestId("mindset-card-cta"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/mind?start=1");
    });
  });

  // ─── e015ca0f: low mood reads the gateway invitation ───────────────────────
  describe("e015ca0f: with today's mood set low, the button reads the mood gateway's invitation", () => {
    it.each([1, 2] as const)(
      "mood %i renders the gateway CTA, as on the web",
      (level) => {
        const s = summary({ todayMood: level });
        const expected = moodGateway(level).cta;
        expect(mindsetCta(s, level)).toBe(expected);
        const { getByTestId } = render(
          <MindsetCard summary={s} todaysMood={level} />,
        );
        expect(getByTestId("mindset-card-cta").props.accessibilityLabel).toBe(
          expected,
        );
        expect(
          flatten(getByTestId("mindset-card-gateway")!.props.children),
        ).toContain(moodGateway(level).headline);
      },
    );

    it("a done session wins over the low-mood invitation, as on the web", () => {
      const s = summary({ sessionDoneToday: true, todayMood: 1 });
      expect(mindsetCta(s, 1)).toBe("Training Grounds");
    });
  });
});

function flatten(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  if (typeof node === "object" && "props" in (node as object)) {
    return flatten((node as { props: { children?: unknown } }).props.children);
  }
  return "";
}
