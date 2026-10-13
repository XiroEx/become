import React from "react";
import { act, render, fireEvent } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { MindsetCard } from "@/components/dashboard/MindsetCard";
import { DashboardScreen } from "@/components/DashboardScreen";
import type { MindSummaryResponse } from "@become/api-client";
import { darkTokens, lightTokens } from "@/lib/theme/tokens";
import {
  computeMindsetCta,
  computeMindsetStatus,
  computeChapterProgress,
  isLastStateWithin24Hours,
  formatLastStateFeeling,
  getEffectiveMood,
} from "@/lib/mind/mindsetCard";

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

const MOCK_SUMMARY: MindSummaryResponse = {
  todayKey: "2026-10-02",
  level: 4,
  levelPct: 45,
  chapter: 2,
  chapterName: "The Foundation",
  sessionsIntoChapter: 3,
  sessionsPerChapter: 5,
  sessionDoneToday: false,
  mainSessionAvailable: true,
  sessionsLast7Days: 3,
  moodCheckinsLast7Days: 4,
  todayMood: null,
  lastState: {
    state: "locked_in",
    feeling: "focused",
    at: Date.now() - 2 * 3_600_000, // 2 hours ago
  },
};

describe("NP-150: Mindset Card and helpers", () => {
  describe("Pure copy and calculation helpers", () => {
    it("computes chapter progress percentage correctly", () => {
      expect(computeChapterProgress(0, 5)).toBe(0);
      expect(computeChapterProgress(3, 5)).toBe(60);
      expect(computeChapterProgress(5, 5)).toBe(100);
      expect(computeChapterProgress(1, 0)).toBe(0);
    });

    it("evaluates 24h window for last state accurately", () => {
      const now = 1_000_000_000_000;
      expect(isLastStateWithin24Hours({ at: now - 3_600_000 }, now)).toBe(true);
      expect(isLastStateWithin24Hours({ at: now - 24 * 3_600_000 }, now)).toBe(true);
      expect(isLastStateWithin24Hours({ at: now - 25 * 3_600_000 }, now)).toBe(false);
      expect(isLastStateWithin24Hours(null, now)).toBe(false);
    });

    it("formats last state feeling with fallbacks", () => {
      expect(formatLastStateFeeling({ state: "locked_in", feeling: "Focused" })).toBe("focused");
      expect(formatLastStateFeeling({ state: "low_energy", feeling: null })).toBe("low energy");
      expect(formatLastStateFeeling({ state: "distracted", feeling: "" })).toBe("distracted");
      expect(formatLastStateFeeling({ state: "custom_state", feeling: null })).toBe("custom_state");
    });

    it("resolves effective mood correctly", () => {
      expect(getEffectiveMood(1, MOCK_SUMMARY)).toBe(1);
      expect(getEffectiveMood(null, { ...MOCK_SUMMARY, todayMood: 4 })).toBe(4);
      expect(getEffectiveMood(null, MOCK_SUMMARY)).toBe(null);
    });

    it("computes session status matching web", () => {
      expect(computeMindsetStatus(null)).toBeNull();
      expect(computeMindsetStatus({ ...MOCK_SUMMARY, sessionDoneToday: true })).toEqual({
        done: true,
        text: "Today's session done",
      });
      expect(
        computeMindsetStatus({ ...MOCK_SUMMARY, sessionDoneToday: false, mainSessionAvailable: true }),
      ).toEqual({
        done: false,
        text: "Today's session is ready",
      });
      expect(
        computeMindsetStatus({ ...MOCK_SUMMARY, sessionDoneToday: false, mainSessionAvailable: false }),
      ).toEqual({
        done: false,
        text: "Session done · Training Grounds open",
      });
    });

    it("computes CTA button copy for all cases", () => {
      expect(computeMindsetCta(null, null)).toBe("Open Mindset");
      // When session done today, CTA is always Training Grounds
      expect(computeMindsetCta({ ...MOCK_SUMMARY, sessionDoneToday: true }, 1)).toBe("Training Grounds");
      // Low mood gateway invitations when session not done
      expect(computeMindsetCta({ ...MOCK_SUMMARY, sessionDoneToday: false }, 1)).toBe("Take five in Mindset");
      expect(computeMindsetCta({ ...MOCK_SUMMARY, sessionDoneToday: false }, 2)).toBe("Reset in Mindset");
      // Neutral / positive mood or unset
      expect(computeMindsetCta({ ...MOCK_SUMMARY, sessionDoneToday: false, mainSessionAvailable: true }, 3)).toBe("Start today's session");
      expect(computeMindsetCta({ ...MOCK_SUMMARY, sessionDoneToday: false, mainSessionAvailable: true }, null)).toBe("Start today's session");
      expect(computeMindsetCta({ ...MOCK_SUMMARY, sessionDoneToday: false, mainSessionAvailable: false }, null)).toBe("Training Grounds");
    });
  });

  describe("MindsetCard Component Acceptance Criteria", () => {
    // (id: e015ca0e) The native card shows the same level, chapter progress and session status as the web's for the same member at the same moment
    it("(id: e015ca0e) shows the same level, chapter progress and session status as the web", () => {
      const { getByTestId, getByText } = render(
        <MindsetCard summary={MOCK_SUMMARY} />,
      );

      // Level and chapter
      expect(getByTestId("mindset-level-chapter")).toBeTruthy();
      expect(getByText(/Level 4/)).toBeTruthy();
      expect(getByText(/Chapter 2: The Foundation/)).toBeTruthy();

      // Chapter progress
      expect(getByText("3/5 sessions")).toBeTruthy();

      // Session status: ready
      expect(getByText("Today's session is ready")).toBeTruthy();

      // Weekly counts and last check-in
      expect(getByText(/This week: 4 mood check-ins · 3 sessions/)).toBeTruthy();
      expect(getByText(/last check-in/)).toBeTruthy();
      expect(getByText("focused")).toBeTruthy();

      // Default CTA when available and no low mood
      expect(getByText("Start today's session")).toBeTruthy();
    });

    it("(id: e015ca0e) shows completed session status when session done today", () => {
      const doneSummary: MindSummaryResponse = {
        ...MOCK_SUMMARY,
        sessionDoneToday: true,
        sessionsLast7Days: 1,
        moodCheckinsLast7Days: 1,
      };

      const { getByText } = render(<MindsetCard summary={doneSummary} />);

      expect(getByText("Today's session done")).toBeTruthy();
      expect(getByText(/This week: 1 mood check-in · 1 session/)).toBeTruthy();
      expect(getByText("Training Grounds")).toBeTruthy();
    });

    it("(id: e015ca0e) suppresses last state when older than 24 hours", () => {
      const oldSummary: MindSummaryResponse = {
        ...MOCK_SUMMARY,
        lastState: {
          state: "stressed",
          feeling: "overwhelmed",
          at: Date.now() - 30 * 3_600_000, // 30 hours ago (>24h)
        },
      };

      const { queryByText } = render(<MindsetCard summary={oldSummary} />);
      expect(queryByText("overwhelmed")).toBeNull();
      expect(queryByText(/last check-in/)).toBeNull();
    });

    // (id: e015ca0f) With today's mood set low, the button reads the mood gateway's invitation, as on the web
    it("(id: e015ca0f) with today's mood set to 1 (Bad), button reads mood gateway invitation and shows headline/body", () => {
      const { getByText, getByTestId } = render(
        <MindsetCard summary={MOCK_SUMMARY} todaysMood={1} />,
      );

      // Low mood invitation CTA
      expect(getByText("Take five in Mindset")).toBeTruthy();
      expect(getByTestId("mindset-cta")).toBeTruthy();

      // Gateway banner copy
      expect(getByText(/Rough one\./)).toBeTruthy();
      expect(
        getByText(/You do not have to fix it right now\. A short Mind session takes the edge off first\./),
      ).toBeTruthy();
    });

    it("(id: e015ca0f) with today's mood set to 2 (Not great), button reads Reset in Mindset", () => {
      const { getByText, getByTestId } = render(
        <MindsetCard summary={MOCK_SUMMARY} todaysMood={2} />,
      );

      // Low mood invitation CTA
      expect(getByText("Reset in Mindset")).toBeTruthy();
      expect(getByTestId("mindset-cta")).toBeTruthy();

      // Gateway banner copy
      expect(getByText(/Not your best\. Noted\./)).toBeTruthy();
      expect(
        getByText(/Flat days are data, not destiny\. A few minutes in Mindset usually shifts it\./),
      ).toBeTruthy();
    });

    it("(id: e015ca0f) low mood reads todayMood from summary when todaysMood prop is unset", () => {
      const summaryWithMood: MindSummaryResponse = {
        ...MOCK_SUMMARY,
        todayMood: 1,
      };

      const { getByText } = render(<MindsetCard summary={summaryWithMood} />);
      expect(getByText("Take five in Mindset")).toBeTruthy();
    });

    it("renders loading placeholder and 'Open Mindset' CTA when summary is null", () => {
      const { getByTestId, getByText, queryByTestId } = render(
        <MindsetCard summary={null} />,
      );

      expect(getByTestId("mindset-card-placeholder")).toBeTruthy();
      expect(getByText("Open Mindset")).toBeTruthy();
      expect(queryByTestId("mindset-level-chapter")).toBeNull();
    });

    it("triggers onOpenMind callback when CTA or View link is pressed", () => {
      const onOpenMind = jest.fn();
      const { getByTestId } = render(
        <MindsetCard summary={MOCK_SUMMARY} onOpenMind={onOpenMind} />,
      );

      fireEvent.press(getByTestId("mindset-cta"));
      expect(onOpenMind).toHaveBeenCalledTimes(1);

      fireEvent.press(getByTestId("mindset-card-view"));
      expect(onOpenMind).toHaveBeenCalledTimes(2);
    });

    it("renders MindsetCard inside DashboardScreen below tile grid", () => {
      const onOpenMind = jest.fn();
      const { getByTestId, getByText } = render(
        <DashboardScreen
          userName="Jon"
          streakDays={3}
          todayWorkout={null}
          mind={MOCK_SUMMARY}
          todaysMood={1}
          onOpenMind={onOpenMind}
          onStartWorkout={() => {}}
          onOpenCalendar={() => {}}
          onOpenSettings={() => {}}
          onSubmitCheckIn={() => {}}
        />,
      );

      expect(getByTestId("mindset-card")).toBeTruthy();
      expect(getByText("Take five in Mindset")).toBeTruthy();
      expect(getByText(/Chapter 2: The Foundation/)).toBeTruthy();
    });

    // (card NP-257) In dark mode the "Mindset" title and "Level N · Chapter M"
    // line rendered with no explicit colour, which React Native defaults to
    // BLACK — invisible on the near-black dark surfaces. They must resolve
    // `colors.foreground`, which flips light/dark, same as the web's
    // `text-zinc-900 dark:text-white`.
    it.each(["light", "dark"] as const)(
      "(NP-257) title and level/chapter line resolve colors.foreground in %s mode",
      (mode) => {
        setSystemScheme(mode);
        const tokens = mode === "dark" ? darkTokens : lightTokens;
        const { getByTestId } = render(<MindsetCard summary={MOCK_SUMMARY} />);

        const title = getByTestId("mindset-card-title");
        const titleColor = [title.props.style]
          .flat(Infinity)
          .find((s) => s?.color)?.color;
        expect(titleColor).toBe(`rgb(${tokens.foreground})`);

        const levelChapter = getByTestId("mindset-level-chapter");
        const levelColor = [levelChapter.props.style]
          .flat(Infinity)
          .find((s) => s?.color)?.color;
        expect(levelColor).toBe(`rgb(${tokens.foreground})`);
      },
    );

    // (NP-257) The CTA is a solid button: filled with `colors.foreground`
    // (dark ink in light mode, white in dark mode) and labelled with
    // `colors.background` — the inverse pairing is what makes it read as a
    // solid black button in light mode and a solid white one in dark mode,
    // matching the web's `bg-zinc-900 text-white dark:bg-white dark:text-black`.
    it.each(["light", "dark"] as const)(
      "(NP-257) the CTA button is filled, not transparent, in %s mode",
      (mode) => {
        setSystemScheme(mode);
        const tokens = mode === "dark" ? darkTokens : lightTokens;
        const { getByTestId, getByText } = render(
          <MindsetCard summary={MOCK_SUMMARY} />,
        );

        const cta = getByTestId("mindset-cta");
        const ctaStyle = (
          typeof cta.props.style === "function"
            ? cta.props.style({ pressed: false })
            : cta.props.style
        );
        const fill = [ctaStyle].flat(Infinity).find((s) => s?.backgroundColor)
          ?.backgroundColor;
        expect(fill).toBe(`rgb(${tokens.foreground})`);

        const ctaLabel = getByText("Start today's session");
        const labelColor = [ctaLabel.props.style]
          .flat(Infinity)
          .find((s) => s?.color)?.color;
        expect(labelColor).toBe(`rgb(${tokens.background})`);
      },
    );
  });
});
