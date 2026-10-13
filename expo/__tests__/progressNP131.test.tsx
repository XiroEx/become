/* eslint-disable import/first */
// PERSONAL RECORDS (NP-131): the list, the per-exercise trend, correct and
// remove.
//
// The web's `webapp/app/dashboard/progress/ProgressClient.tsx` lists `pbs`
// (persisted `exercisePRs`, heaviest first), charts each record across the
// sessions it was logged in (`getPRHistory` from `detailedWorkouts`), and
// lets the member correct (`PATCH /api/progress/prs { exerciseSlug, weight,
// reps }` behind a review step) or remove (`DELETE
// /api/progress/prs?exerciseSlug=`) a wrong record. This suite pins the
// native port in `components/progress/PersonalRecords.tsx` and its wiring in
// `app/(app)/progress.tsx`:
//
//   • (e015c9a1) correcting a record natively shows the corrected value on
//     the web — the native PATCH sends the web's path, method and body, and
//     the corrected value parses through the web's own PR contract;
//   • (e015c9a2) removing a record asks for confirmation — the modal opens on
//     a chart step, removal stays behind a second tap ("Yes, remove"), and
//     cancelling issues no DELETE.

jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {},
    async deleteItemAsync(key: string): Promise<void> {},
  };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "fake-token", user: { id: "u1" } }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import {
  ProgressApiResponseSchema,
  apiFetch,
  type ProgressApiResponse,
} from "@become/api-client";
import { ProgressScreen } from "@/app/(app)/progress";
import {
  PersonalRecordModal,
  PersonalRecordsSection,
  correctPersonalRecord,
  parsePrCorrection,
  prCorrectPath,
  prHistoryForSlug,
  prRemovePath,
  removePersonalRecord,
} from "@/components/progress/PersonalRecords";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

const PBS = [
  { slug: "bench-press", name: "Barbell Bench Press", weight: 185, reps: 5, date: "Sep 26" },
  { slug: "back-squat", name: "Back Squat", weight: 225, reps: 3, date: "Sep 20" },
];

function detailedWorkout(overrides: Record<string, unknown> = {}) {
  return {
    date: "Fri, Sep 26",
    rawDate: "2026-09-26T14:00:00.000Z",
    kind: "program",
    day: "Day 1 - Upper A",
    title: "Upper A",
    duration: 45,
    totalVolume: 8450,
    exercises: [
      {
        name: "Barbell Bench Press",
        slug: "bench-press",
        bestSet: { weight: 185, reps: 5 },
        volume: 4625,
        isPR: true,
        sets: [
          {
            setNumber: 1,
            reps: 5,
            weight: 185,
            duration: null,
            distance: null,
            speed: null,
            completed: true,
          },
        ],
      },
      {
        name: "Back Squat",
        slug: "back-squat",
        bestSet: { weight: 225, reps: 3 },
        volume: 3825,
        isPR: false,
        sets: [
          {
            setNumber: 1,
            reps: 3,
            weight: 225,
            duration: null,
            distance: null,
            speed: null,
            completed: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function olderBenchWorkout() {
  return detailedWorkout({
    date: "Mon, Sep 21",
    rawDate: "2026-09-21T14:00:00.000Z",
    title: "Upper B",
    exercises: [
      {
        name: "Barbell Bench Press",
        slug: "bench-press",
        bestSet: { weight: 175, reps: 5 },
        volume: 4375,
        isPR: false,
        sets: [
          {
            setNumber: 1,
            reps: 5,
            weight: 175,
            duration: null,
            distance: null,
            speed: null,
            completed: true,
          },
        ],
      },
    ],
  });
}

const RESPONSE = {
  weightData: [],
  bmiData: [],
  moodData: [],
  currentProgram: null,
  stats: { streakDays: 4, totalWorkouts: 27, thisWeekWorkouts: 2, goalProgress: 50 },
  longestStreak: 9,
  pbs: PBS,
  detailedWorkouts: [detailedWorkout(), olderBenchWorkout()],
  weeklyVolume: [{ week: "Sep 21", volume: 8450, workouts: 2 }],
  totalVolumeLbs: 20650,
  weeklyAvailability: 4,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue({ success: true });
});

function parsedResponse(): ProgressApiResponse {
  return ProgressApiResponseSchema.parse(RESPONSE) as ProgressApiResponse;
}

// ─── History ────────────────────────────────────────────────────────────────

describe("per-exercise history matches the web's getPRHistory", () => {
  it("collects the best set per session, oldest first, skipping the rest", () => {
    const workouts = parsedResponse().detailedWorkouts ?? [];
    expect(prHistoryForSlug(workouts, "bench-press")).toEqual([
      { date: "Mon, Sep 21", weight: 175, reps: 5 },
      { date: "Fri, Sep 26", weight: 185, reps: 5 },
    ]);
    // One session logged the squat: a single point, no trend line.
    expect(prHistoryForSlug(workouts, "back-squat")).toEqual([
      { date: "Fri, Sep 26", weight: 225, reps: 3 },
    ]);
    expect(prHistoryForSlug(workouts, "deadlift")).toEqual([]);
    expect(prHistoryForSlug(null, "bench-press")).toEqual([]);
  });

  it("the correction rule is the web's validEdit: numbers, positive, a change", () => {
    const pr = PBS[0]!;
    expect(parsePrCorrection(pr, "190", "5")).toEqual({ weight: 190, reps: 5 });
    expect(parsePrCorrection(pr, "185", "6")).toEqual({ weight: 185, reps: 6 });
    // Not a change, not a number, not positive, fractional reps.
    expect(parsePrCorrection(pr, "185", "5")).toBeNull();
    expect(parsePrCorrection(pr, "abc", "5")).toBeNull();
    expect(parsePrCorrection(pr, "0", "5")).toBeNull();
    expect(parsePrCorrection(pr, "185", "0")).toBeNull();
    expect(parsePrCorrection(pr, "185", "5.5")).toBeNull();
  });
});

// ─── e015c9a1: correcting natively shows the corrected value on the web ────

describe("(id: e015c9a1) correcting a record natively shows the corrected value on the web", () => {
  it("PATCHes the web's path with the web's body", async () => {
    await correctPersonalRecord({
      slug: "bench-press",
      weight: 190,
      reps: 5,
      authToken: "fake-token",
    });
    expect(prCorrectPath()).toBe("/api/progress/prs");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/progress/prs",
      expect.anything(),
      expect.objectContaining({
        method: "PATCH",
        body: { exerciseSlug: "bench-press", weight: 190, reps: 5 },
      }),
    );
  });

  it("the corrected value is what the web renders: it parses through the web's own PR contract", async () => {
    // The web's route answers the corrected record as `{ weight, reps }` on
    // the `pbs` entry; the shared schema is the contract both clients parse.
    const webAnswer = {
      ...RESPONSE,
      pbs: [{ ...PBS[0], weight: 190, reps: 5 }, PBS[1]],
    };
    const parsed = ProgressApiResponseSchema.parse(webAnswer);
    expect(parsed.pbs?.[0]).toMatchObject({
      slug: "bench-press",
      weight: 190,
      reps: 5,
    });
  });

  it("the modal needs a review tap before the PATCH leaves the phone", async () => {
    setSystemScheme("light");
    const pr = parsedResponse().pbs![0]!;
    const workouts = parsedResponse().detailedWorkouts ?? [];
    const { getByTestId, queryByTestId } = render(
      <PersonalRecordModal
        pr={pr}
        points={prHistoryForSlug(workouts, pr.slug)}
        onClose={() => {}}
        onChanged={() => {}}
        authToken="fake-token"
      />,
    );
    fireEvent.press(getByTestId("pr-modal-correct"));
    fireEvent.changeText(getByTestId("pr-modal-weight"), "190");
    // Review first: no PATCH yet, the confirm banner names the change.
    fireEvent.press(getByTestId("pr-modal-confirm"));
    expect(queryByTestId("pr-modal-review-banner")).toBeTruthy();
    expect(getByTestId("pr-modal-review-change")).toHaveTextContent(
      "185 lb × 5 → 190 lb × 5",
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
    // Confirm: the PATCH goes out with the corrected value.
    await act(async () => {
      fireEvent.press(getByTestId("pr-modal-confirm"));
    });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/progress/prs",
      expect.anything(),
      expect.objectContaining({
        method: "PATCH",
        body: { exerciseSlug: "bench-press", weight: 190, reps: 5 },
      }),
    );
  });

  it("an unchanged record cannot reach review: the confirm stays disabled", () => {
    setSystemScheme("light");
    const pr = parsedResponse().pbs![0]!;
    const { getByTestId } = render(
      <PersonalRecordModal
        pr={pr}
        points={[]}
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );
    fireEvent.press(getByTestId("pr-modal-correct"));
    expect(getByTestId("pr-modal-confirm").props.accessibilityState?.disabled).toBe(
      true,
    );
  });
});

// ─── e015c9a2: removing a record asks for confirmation ──────────────────────

describe("(id: e015c9a2) removing a record asks for confirmation", () => {
  it("DELETEs the web's path with the exercise in the query", async () => {
    await removePersonalRecord({ slug: "bench-press", authToken: "fake-token" });
    expect(prRemovePath("bench-press")).toBe(
      "/api/progress/prs?exerciseSlug=bench-press",
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/progress/prs?exerciseSlug=bench-press",
      expect.anything(),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("the modal opens on the chart: removal needs a second tap", async () => {
    setSystemScheme("light");
    const pr = parsedResponse().pbs![0]!;
    const workouts = parsedResponse().detailedWorkouts ?? [];
    const onChanged = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <PersonalRecordModal
        pr={pr}
        points={prHistoryForSlug(workouts, pr.slug)}
        onClose={() => {}}
        onChanged={onChanged}
        authToken="fake-token"
      />,
    );
    // Chart first: the trend names the sessions, no delete control yet.
    expect(getByTestId("pr-modal-trend")).toBeTruthy();
    expect(queryByTestId("pr-modal-delete-warning")).toBeNull();
    expect(queryByTestId("pr-modal-delete-confirm")).toBeNull();
    // Remove asks: the warning names the record, cancelling deletes nothing.
    fireEvent.press(getByTestId("pr-modal-remove"));
    expect(getByTestId("pr-modal-delete-warning")).toBeTruthy();
    fireEvent.press(getByTestId("pr-modal-cancel"));
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(queryByTestId("pr-modal-delete-warning")).toBeNull();
    // Confirming deletes and refetches.
    fireEvent.press(getByTestId("pr-modal-remove"));
    await act(async () => {
      fireEvent.press(getByTestId("pr-modal-delete-confirm"));
    });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/progress/prs?exerciseSlug=bench-press",
      expect.anything(),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("a failed remove keeps the modal open with the server's words", async () => {
    setSystemScheme("light");
    const { ApiError: ApiErrorClass } = jest.requireActual("@become/api-client");
    mockApiFetch.mockRejectedValueOnce(
      new ApiErrorClass(404, { error: "Personal record not found" }),
    );
    const pr = parsedResponse().pbs![0]!;
    const onChanged = jest.fn();
    const { getByTestId } = render(
      <PersonalRecordModal
        pr={pr}
        points={[]}
        onClose={() => {}}
        onChanged={onChanged}
        authToken="fake-token"
      />,
    );
    fireEvent.press(getByTestId("pr-modal-remove"));
    await act(async () => {
      fireEvent.press(getByTestId("pr-modal-delete-confirm"));
    });
    await waitFor(() =>
      expect(getByTestId("pr-modal-error")).toHaveTextContent(
        "Personal record not found",
      ),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });
});

// ─── Screen wiring ──────────────────────────────────────────────────────────

describe("the progress screen lists records and opens the modal", () => {
  it("renders one row per record; tapping opens the trend modal", () => {
    setSystemScheme("light");
    const { getByTestId, queryByTestId } = render(
      <ProgressScreen data={parsedResponse()} />,
    );
    expect(getByTestId("progress-record-0")).toBeTruthy();
    expect(getByTestId("progress-record-1")).toBeTruthy();
    expect(queryByTestId("pr-modal")).toBeNull();
    fireEvent.press(getByTestId("progress-record-0"));
    expect(getByTestId("pr-modal")).toBeTruthy();
    expect(getByTestId("pr-modal-trend")).toBeTruthy();
  });

  it("a single session shows the need-two-sessions note, not a line", () => {
    setSystemScheme("light");
    const { getByTestId } = render(
      <ProgressScreen data={parsedResponse()} />,
    );
    fireEvent.press(getByTestId("progress-record-1"));
    expect(getByTestId("pr-modal-trend-empty")).toBeTruthy();
  });

  it("no records means no section — the screen keeps its NP-130 shape", () => {
    setSystemScheme("light");
    const empty = ProgressApiResponseSchema.parse({
      ...RESPONSE,
      pbs: [],
    }) as ProgressApiResponse;
    const { queryByTestId, getByTestId } = render(<ProgressScreen data={empty} />);
    expect(queryByTestId("progress-records-section")).toBeNull();
    expect(getByTestId("progress-workouts-section")).toBeTruthy();
  });

  it("the list renders the section directly too", () => {
    setSystemScheme("light");
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <PersonalRecordsSection pbs={parsedResponse().pbs ?? []} onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId("progress-record-0"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "bench-press" }),
    );
  });

  it("no hard-coded ink in the new files", () => {
    for (const rel of [
      "components/progress/PersonalRecords.tsx",
      "app/(app)/progress.tsx",
    ]) {
      const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
      expect(
        code.split("\n").filter((line) =>
          /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/.test(
            line,
          ),
        ),
      ).toEqual([]);
      expect(
        code.split("\n").filter((line) => /["'`]\s*rgba?\(\s*\d/.test(line)),
      ).toEqual([]);
    }
  });
});
