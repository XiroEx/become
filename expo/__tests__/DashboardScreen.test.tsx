import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { DashboardScreen } from "@/components/DashboardScreen";
import type { UpcomingWorkoutSummary } from "@/lib/dashboard/types";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/nutrition/foodFlags", () => {
  const actual = jest.requireActual("@/lib/nutrition/foodFlags");
  return {
    ...actual,
    loadMyReports: jest.fn(async () => ({
      status: "loaded",
      items: [],
      unreadCount: 0,
    })),
    markReportsRead: jest.fn(async () => ({ status: "marked" })),
    addReportEvidence: jest.fn(),
  };
});

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

describe("DashboardScreen", () => {
  const baseProps = {
    streakDays: 7,
    todayWorkout: {
      programName: "Foundation",
      workoutTitle: "Push A",
      phaseLabel: "Phase 1, Week 2",
      exerciseCount: 6,
    },
    // Both of these are REQUIRED props now. They used to default to a no-op
    // inside the component (`onStartWorkout ?? (() => {})`), which is exactly
    // why the shipped Start workout button did nothing: the route never passed
    // one and neither the compiler nor this file could tell.
    onStartWorkout: jest.fn(),
    onOpenCalendar: jest.fn(),
    onSubmitCheckIn: jest.fn(),
  };

  it("renders the streak tile in the grid with the supplied streak days", () => {
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        layout={[{ id: "streak", kind: "stat", size: "1x1" }]}
      />,
    );
    expect(getByTestId("tile-streak")).toBeTruthy();
    expect(getByTestId("tile-streak-value")).toBeTruthy();
  });

  it("renders the shared page header (Become + subtitle)", () => {
    // The hand-rolled dashboard header is gone: PageHeader owns the title
    // ("Become", not "Dashboard") and the avatar menu on every screen.
    const { getByTestId, getByText } = render(
      <DashboardScreen {...baseProps} userName="Jon" />,
    );
    expect(getByTestId("page-header-title").props.children).toBe("Become");
    expect(getByText("Track your fitness journey")).toBeTruthy();
  });

  it("does not render a separate Today's workout card (NP-255): Up Next is the one next-workout card", () => {
    // The dropped card used to render above the tile grid and could disagree
    // with Up Next (a different data source). It no longer renders at all.
    const { queryByTestId } = render(<DashboardScreen {...baseProps} />);
    expect(queryByTestId("dashboard-today")).toBeNull();
    expect(queryByTestId("dashboard-today-workout")).toBeNull();
    expect(queryByTestId("dashboard-rest")).toBeNull();
    expect(queryByTestId("dashboard-start-workout")).toBeNull();
  });

  it("opens the check-in modal when checkInOpen is true (prompt-driven parity)", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <DashboardScreen {...baseProps} checkInOpen={false} />,
    );
    expect(queryByTestId("dashboard-checkin-modal-mood-row")).toBeNull();
    rerender(<DashboardScreen {...baseProps} checkInOpen />);
    expect(getByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
  });

  it("submits check-in payload through onSubmitCheckIn", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onSubmitCheckIn={onSubmit}
        checkInOpen
        onCheckInOpenChange={() => {}}
      />,
    );
    fireEvent.press(getByTestId("dashboard-checkin-modal-mood-5"));
    fireEvent.changeText(
      getByTestId("dashboard-checkin-modal-weight"),
      "180",
    );
    fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ mood: 5, weight: 180, weightLbs: 180 }),
      );
    });
  });

  it("fires onOpenCalendar when the Up Next calendar link is pressed", () => {
    // The calendar is reached via the Up Next link on Home (NP-211 / NP-106).
    const onOpenCalendar = jest.fn();
    const upcomingWorkout: UpcomingWorkoutSummary = {
      dateLabel: "Tomorrow",
      dayLabel: "Day 2 Lower A",
      workoutTitle: "Lower Body",
      programName: "Foundation",
    };
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onOpenCalendar={onOpenCalendar}
        upcomingWorkout={upcomingWorkout}
      />,
    );
    fireEvent.press(getByTestId("up-next-calendar"));
    expect(onOpenCalendar).toHaveBeenCalledTimes(1);
  });

  it("presses through to the handler it was given, with no no-op default", () => {
    // The regression this file missed: with `onStartWorkout ?? (() => {})` in
    // the component, a screen rendered without the prop still had a live,
    // pressable button. There is no default any more — `tsc` requires the
    // prop — so the press has to reach the caller's function. Up Next is now
    // the one next-workout card, and its Start action falls back to
    // onStartWorkout when onStartNextWorkout is not supplied.
    const onStartWorkout = jest.fn();
    const upcomingWorkout: UpcomingWorkoutSummary = {
      dateLabel: "Today",
      dayLabel: "Day 2 Pull A",
      workoutTitle: "Pull A",
      programName: "Foundation",
    };
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onStartWorkout={onStartWorkout}
        upcomingWorkout={upcomingWorkout}
      />,
    );
    const button = getByTestId("up-next-card");
    expect(button.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(button);
    expect(onStartWorkout).toHaveBeenCalledTimes(1);
  });

  it("renders tiles from the layout prop and opens the Workout Now sheet when workoutNow is pressed", async () => {
    const onStartWorkout = jest.fn();
    const onOpenMind = jest.fn();
    const onOpenNutrition = jest.fn();

    const { getByTestId, queryByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onStartWorkout={onStartWorkout}
        onOpenMind={onOpenMind}
        onOpenNutrition={onOpenNutrition}
        layout={[
          { id: "mindset", kind: "stat", size: "1x1" },
          { id: "nutrition", kind: "stat", size: "1x1" },
          { id: "workoutNow", kind: "stat", size: "2x1" },
        ]}
      />,
    );

    // Tiles rendered
    expect(getByTestId("tilegrid")).toBeTruthy();
    expect(getByTestId("tile-mindset")).toBeTruthy();
    expect(getByTestId("tile-nutrition")).toBeTruthy();
    expect(getByTestId("tile-workoutNow")).toBeTruthy();

    // Action clicks
    fireEvent.press(getByTestId("tile-mindset"));
    expect(onOpenMind).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("tile-nutrition"));
    expect(onOpenNutrition).toHaveBeenCalledTimes(1);

    // Workout Now sheet opens in place (NP-076): the focus list, not a
    // single start button.
    expect(queryByTestId("dashboard-workout-now-sheet-body-focus-push")).toBeNull();
    fireEvent.press(getByTestId("tile-workoutNow"));
    expect(
      getByTestId("dashboard-workout-now-sheet-body-focus-push"),
    ).toBeTruthy();
  });

  it("calls onSkipCheckIn when skip button is pressed in check-in modal", async () => {
    const onSkip = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onSkipCheckIn={onSkip}
        checkInOpen
        onCheckInOpenChange={() => {}}
      />,
    );
    fireEvent.press(getByTestId("dashboard-checkin-modal-skip"));
    await waitFor(() => {
      expect(onSkip).toHaveBeenCalled();
    });
  });

  it("opens weight log sheet from weight tile and submits through onSubmitWeight", async () => {
    const onSubmitWeight = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onSubmitWeight={onSubmitWeight}
        layout={[{ id: "weight", kind: "stat", size: "1x1" }]}
      />,
    );
    // Tap weight tile
    fireEvent.press(getByTestId("tile-weight"));

    // Weight sheet is open
    expect(getByTestId("dashboard-weight-sheet-input")).toBeTruthy();

    fireEvent.changeText(getByTestId("dashboard-weight-sheet-input"), "178.5");
    fireEvent.press(getByTestId("dashboard-weight-sheet-submit"));

    await waitFor(() => {
      expect(onSubmitWeight).toHaveBeenCalledWith(178.5);
    });
  });

  it("renders with kg weightUnit on check-in modal and weight sheet", () => {
    const { getByTestId, getByText } = render(
      <DashboardScreen
        {...baseProps}
        checkInOpen
        weightUnit="kg"
        checkInInfo={{ targetWeight: 75, lastWeight: 78 }}
      />,
    );
    expect(getByText("Current Weight (kg)")).toBeTruthy();
    expect(getByTestId("checkin-goal-line")).toBeTruthy();
  });

  it("(id: e015ca09 / e015ca0a) renders NutritionCard when nutritionData is provided and passes callbacks", () => {
    const onOpenNutrition = jest.fn();
    const onQuickAdd = jest.fn();
    const nutritionData = {
      calories: { consumed: 1500, goal: 2000 },
      protein: { current: 120, goal: 150 },
      carbs: { current: 180, goal: 220 },
      fats: { current: 50, goal: 65 },
      water: { current: 64, goal: 96 },
    };
    const nutritionTrend = {
      loggedDays: 5,
      totalDays: 7,
      proteinHitDays: 3,
      avgCalories: 1800,
      calorieRead: "under" as const,
      line: "Logged 5 of 7 days · protein hit 3 · avg 1,800 cal (under)",
    };

    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        nutritionData={nutritionData}
        nutritionTrend={nutritionTrend}
        onOpenNutrition={onOpenNutrition}
        onQuickAdd={onQuickAdd}
      />,
    );

    expect(getByTestId("dashboard-nutrition-card")).toBeTruthy();
    expect(getByTestId("nutrition-trend")).toBeTruthy();

    fireEvent.press(getByTestId("nutrition-card-quick-add"));
    expect(onQuickAdd).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("nutrition-card-view-all"));
    expect(onOpenNutrition).toHaveBeenCalledTimes(1);
  });

  describe("native spacing parity with the web (dashboard vertical rhythm)", () => {
    // Web reference: layout `px-3 py-4` (12 sides, 16 top) + `space-y-4` (16)
    // between sections, `mb-2` (8) under the header, `mt-2` (8) above the
    // Customize link inside the tiles group, `pt-2` (8) above the footer links.
    it("matches the web's phone page box: 12pt sides, 16pt top, 16pt section gap", () => {
      const { getByTestId } = render(<DashboardScreen {...baseProps} />);
      const content = getByTestId("dashboard-scroll").props
        .contentContainerStyle as {
        paddingHorizontal: number;
        paddingTop: number;
        gap: number;
      };
      expect(content.paddingHorizontal).toBe(12);
      expect(content.paddingTop).toBe(16);
      expect(content.gap).toBe(16);
    });

    it("leaves only the 16pt section gap under the header (owner cut the extra 8)", () => {
      const { getByTestId } = render(<DashboardScreen {...baseProps} />);
      expect(getByTestId("dashboard-header-wrap").props.style?.marginBottom ?? 0).toBe(0);
    });

    it("sits Customize tiles 8pt under the grid with no extra margins (the web's mt-2)", () => {
      const { getByTestId } = render(<DashboardScreen {...baseProps} />);
      // Grid and link share one wrapper, like the web's dashboard-tiles div.
      expect(getByTestId("dashboard-tiles-wrap")).toBeTruthy();
      expect(getByTestId("dashboard-customize-wrap").props.style).toEqual(
        expect.objectContaining({ marginTop: 8 }),
      );
      const style = getByTestId("dashboard-customize-wrap").props.style as {
        marginTop: number;
        marginBottom?: number;
      };
      expect(style.marginTop).toBe(8);
      expect(style.marginBottom ?? 0).toBe(0);
    });

    it("keeps the Customize row at content height while holding a 44pt target via hitSlop", () => {
      // The old `minTouchTarget` forced the VIEW to 44 tall — the empty bands
      // above/below the text. hitSlop counts toward the 44pt rule (see
      // test-support/a11y.ts) without growing the row.
      const { getByTestId } = render(<DashboardScreen {...baseProps} />);
      const link = getByTestId("dashboard-customize-tiles");
      const flat = Array.isArray(link.props.style)
        ? Object.assign({}, ...link.props.style)
        : link.props.style;
      expect(flat.minWidth ?? 0).toBeLessThan(44);
      const slop = link.props.hitSlop as {
        top: number;
        bottom: number;
        left: number;
        right: number;
      };
      expect((flat.minHeight ?? 0) + slop.top + slop.bottom).toBeGreaterThanOrEqual(
        44,
      );
    });

    it("ends the tile grid flush: cells carry no bottom margin (the web's gap-2 lives on the grid)", () => {
      // Regression: cells once carried marginBottom 8 on top of the
      // container rowGap 8, doubling every inter-row gap to 16 and leaving a
      // trailing 8 below the grid — which stacked with Customize's mt-2 into
      // the 16pt band above "Customize tiles".
      const { getByTestId } = render(
        <DashboardScreen
          {...baseProps}
          layout={[
            { id: "streak", kind: "stat", size: "1x1" },
            { id: "weekly", kind: "stat", size: "1x1" },
          ]}
        />,
      );
      const grid = getByTestId("tilegrid");
      const cells = grid.props.children as Array<{
        props: { style: unknown };
      }>;
      expect(cells.length).toBe(2);
      for (const cell of cells) {
        const flat = StyleSheet.flatten(cell.props.style as never) as {
          marginBottom?: number;
        };
        expect(flat.marginBottom ?? 0).toBe(0);
      }
    });

    it("stacks the Becoming card like the web: chips mt-2.5 under the header (p-3.5, no uniform gap)", () => {
      const { getByTestId } = render(<DashboardScreen {...baseProps} />);
      expect(
        StyleSheet.flatten(getByTestId("becoming-door-chips").props.style),
      ).toMatchObject({ marginTop: 10 });
    });

    it("fires onOpenCustomizeTiles when the Customize link is pressed", () => {
      const onOpenCustomizeTiles = jest.fn();
      const { getByTestId } = render(
        <DashboardScreen
          {...baseProps}
          onOpenCustomizeTiles={onOpenCustomizeTiles}
        />,
      );
      fireEvent.press(getByTestId("dashboard-customize-tiles"));
      expect(onOpenCustomizeTiles).toHaveBeenCalledTimes(1);
    });

    it("keeps the footer at pt-2 with no extra top margin (the web's LegalLinks pt-2)", () => {
      const { getByTestId } = render(<DashboardScreen {...baseProps} />);
      const footer = getByTestId("dashboard-legal-footer");
      expect(footer.props.className).toContain("pt-2");
      expect(footer.props.className).not.toContain("mt-4");
    });
  });
});
