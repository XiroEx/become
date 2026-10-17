// TRAINING DAY TAB LABELS (NP-220).
//
// Visual QA (native vs web) found the Training Days selector rendering blank
// pills: catalogue/custom documents carry `day: ""` (or whitespace-only), and
// every `w.day ?? `Day ${i + 1}`` site lets `""` through `??` — so the tab's
// `<Text>` child is `""`, with no visible label in EITHER theme, while
// `key`/`testID`/`accessibilityLabel` collapse onto duplicates.
//
// This suite pins the fix from the outside, in both themes:
//
//   1. `workoutDayLabel` falls back to `Day ${i + 1}` on missing AND blank
//      days (and trims real ones) — the unit contract every call site shares.
//   2. `toProgramDetailViewModel` normalizes blank days, so the view model
//      never carries an empty label downstream.
//   3. `<ProgramDetail>` renders visible `Day 1/2/3` tab labels for
//      empty/missing-day inputs, with contrasting text in BOTH light and dark
//      mode (selected: `primary-foreground` on `primary`; unselected:
//      `foreground` on `card` — the web's `bg-zinc-900 text-white /
//      dark:bg-white dark:text-black` and its bordered unselected state).
//   4. The detail ScrollView reserves `TAB_BAR_CONTENT_INSET` at the bottom,
//      so the Day row cannot sit under the floating glass tab bar (NP-351).

import { act } from "react-test-renderer";
import { fireEvent, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { workoutDayLabel } from "@/lib/programs/dayLabel";
import { toProgramDetailViewModel } from "@/lib/programs/programDetail";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import type { ProgramDetailResponse } from "@become/api-client";
import {
  darkTokens,
  getTokens,
  lightTokens,
  type ThemeMode,
  type TokenName,
} from "@/lib/theme/tokens";
import { TAB_BAR_CONTENT_INSET } from "@/lib/navigation/tabBarInset";

function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

/** `"24 24 27"` → `[24, 24, 27]`. */
function channels(mode: ThemeMode, name: TokenName): [number, number, number] {
  const [r = 0, g = 0, b = 0] = getTokens(mode)[name].split(" ").map(Number);
  return [r, g, b];
}

/** Relative luminance of an sRGB triplet, 0–1. */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two token colours. */
function contrast(
  mode: ThemeMode,
  fg: TokenName,
  bg: TokenName,
): number {
  const l1 = luminance(channels(mode, fg));
  const l2 = luminance(channels(mode, bg));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** A view model whose three workouts carry blank/missing days — the QA shape. */
function blankDayProgram(): ProgramDetailViewModel {
  return {
    id: "prog-qa",
    name: "QA Program",
    description: "",
    phases: [
      {
        phaseIndex: 0,
        name: "Phase 1",
        weekStart: 1,
        weekEnd: 4,
        workouts: [
          { workoutIndex: 0, day: "", title: "Push", exerciseCount: 0 },
          { workoutIndex: 1, day: "   ", title: "Pull", exerciseCount: 0 },
          { workoutIndex: 2, title: "Legs", exerciseCount: 0 },
        ],
      },
    ],
  };
}

/** The same shape as a wire response, for the view-model normalizer. */
function blankDayWireResponse(): ProgramDetailResponse {
  return {
    program_id: "prog-qa",
    name: "QA Program",
    phases: [
      {
        phase: "Phase 1",
        weeks: "1-4",
        workouts: [
          { day: "", title: "Push", exercises: [] },
          { day: "   ", title: "Pull", exercises: [] },
          { title: "Legs", exercises: [] },
        ],
      },
    ],
  } as unknown as ProgramDetailResponse;
}

afterEach(() => {
  setSystemScheme("dark");
});

describe("workoutDayLabel (NP-220)", () => {
  it("keeps a real label, trimmed", () => {
    expect(workoutDayLabel("Day 1", 0)).toBe("Day 1");
    expect(workoutDayLabel("  Upper A  ", 0)).toBe("Upper A");
  });

  it("falls back to `Day ${i + 1}` when the day is missing", () => {
    expect(workoutDayLabel(undefined, 0)).toBe("Day 1");
    expect(workoutDayLabel(undefined, 2)).toBe("Day 3");
  });

  it("falls back when the day is an empty or whitespace-only string", () => {
    // `??` lets `""` through — this is the QA bug, stated as a unit.
    expect(workoutDayLabel("", 0)).toBe("Day 1");
    expect(workoutDayLabel("   ", 1)).toBe("Day 2");
    expect(workoutDayLabel("\t\n ", 2)).toBe("Day 3");
  });
});

describe("toProgramDetailViewModel day normalization (NP-220)", () => {
  it("normalizes empty/missing wire days to Day 1/2/3", () => {
    const vm = toProgramDetailViewModel(blankDayWireResponse());
    expect(vm.phases[0]?.workouts.map((w) => w.day)).toEqual([
      "Day 1",
      "Day 2",
      "Day 3",
    ]);
  });
});

describe("ProgramDetail Training Days tabs (NP-220)", () => {
  it.each(["light", "dark"] as const)(
    "renders visible Day 1/2/3 labels in %s mode when days are blank",
    (mode) => {
      setSystemScheme(mode);
      const { getByTestId, getByText } = render(
        <ProgramDetail program={blankDayProgram()} />,
      );
      // The tabs exist under non-empty, unique ids — no collapsed "" keys.
      for (const label of ["Day 1", "Day 2", "Day 3"]) {
        expect(getByTestId(`program-detail-day-${label}`)).toBeTruthy();
        expect(getByText(label)).toBeTruthy();
      }
    },
  );

  it.each(["light", "dark"] as const)(
    "gives every day-tab text a contrasting theme colour in %s mode",
    (mode) => {
      setSystemScheme(mode);
      const { getByText } = render(<ProgramDetail program={blankDayProgram()} />);
      // Day 1 is selected by default: primary-foreground ink on the primary
      // pill; the rest are foreground ink on card — the web's selected /
      // unselected day-button treatments.
      const selected = getByText("Day 1");
      const unselected = getByText("Day 2");
      const selectedColor = (
        Array.isArray(selected.props.style)
          ? selected.props.style
          : [selected.props.style]
      ).reduce(
        (acc: Record<string, unknown>, s: Record<string, unknown>) => ({
          ...acc,
          ...s,
        }),
        {},
      ).color as string;
      const unselectedColor = (
        Array.isArray(unselected.props.style)
          ? unselected.props.style
          : [unselected.props.style]
      ).reduce(
        (acc: Record<string, unknown>, s: Record<string, unknown>) => ({
          ...acc,
          ...s,
        }),
        {},
      ).color as string;
      expect(selectedColor).toBe(`rgb(${getTokens(mode)["primary-foreground"]})`);
      expect(unselectedColor).toBe(`rgb(${getTokens(mode).foreground})`);
      // And those pairs are legible: AA (4.5:1) in both modes.
      expect(contrast(mode, "primary-foreground", "primary")).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(mode, "foreground", "card")).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("selects the normalized label when a blank-day tab is pressed", () => {
    const onDaySelect = jest.fn();
    const { getByTestId } = render(
      <ProgramDetail program={blankDayProgram()} onDaySelect={onDaySelect} />,
    );
    fireEvent.press(getByTestId("program-detail-day-Day 2"));
    expect(onDaySelect).toHaveBeenCalledWith("Day 2");
  });

  it("reserves the glass tab bar's footprint at the bottom of its scroll content", () => {
    const { getByTestId } = render(<ProgramDetail program={blankDayProgram()} />);
    const scroll = getByTestId("program-detail");
    const merged = (
      Array.isArray(scroll.props.contentContainerStyle)
        ? scroll.props.contentContainerStyle
        : [scroll.props.contentContainerStyle]
    ).reduce(
      (acc: Record<string, unknown>, s: Record<string, unknown>) => ({
        ...acc,
        ...s,
      }),
      {},
    );
    expect(merged.paddingBottom).toBe(TAB_BAR_CONTENT_INSET);
  });
});

describe("NP-220 token sanity", () => {
  it("the day-tab token pairs differ between modes the way the web does", () => {
    // The web's selected day is zinc-900/white in light mode and the inverse
    // in dark — the pairs must actually flip, or one mode has no contrast.
    expect(lightTokens.primary).not.toBe(darkTokens.primary);
    expect(lightTokens["primary-foreground"]).not.toBe(
      darkTokens["primary-foreground"],
    );
  });
});
