/* eslint-disable import/first */
import {
  suggestStartDate,
  suggestTrainingDays,
  generateSchedulePreview,
  enrollProgram,
  createSchedule,
} from "@/lib/programs/enrollment";
import { localDateKey } from "@/lib/time/localDay";

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    __esModule: true,
    ...actual,
    apiFetch: jest.fn(),
  };
});

import { apiFetch } from "@become/api-client";

const mockApiFetch = apiFetch as unknown as jest.Mock;

/**
 * Web's reference implementation from:
 * webapp/app/dashboard/workout/[programId]/ProgramDetailClient.tsx
 */
function webSuggestStartDate(
  schedules: { scheduledWorkouts?: { date: string }[] }[] = [],
  now: Date = new Date(),
): string {
  let latestDate = "";
  for (const s of schedules) {
    for (const w of s.scheduledWorkouts || []) {
      const d =
        typeof w.date === "string"
          ? w.date.split("T")[0]!
          : new Date(w.date).toISOString().split("T")[0]!;
      if (d > latestDate) latestDate = d;
    }
  }

  const d = new Date(now);
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  const defaultSuggested = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (latestDate) {
    const endDate = new Date(latestDate + "T12:00:00");
    endDate.setDate(endDate.getDate() + 1);
    const dow = endDate.getDay();
    const daysUntilMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
    endDate.setDate(endDate.getDate() + daysUntilMon);
    const suggested = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (suggested > todayStr) {
      return suggested;
    }
  }

  return defaultSuggested;
}

describe("Enrolment Start Date & Schedule Parity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("(id: e015c846) The suggested start date matches the web's for the same member", () => {
    it("matches web default (next Monday) when member has no existing schedules", () => {
      // Wednesday Sep 30, 2026
      const fixedNow = new Date(2026, 8, 30, 14, 0, 0);
      const webResult = webSuggestStartDate([], fixedNow);
      const nativeResult = suggestStartDate([], fixedNow);

      expect(nativeResult).toBe(webResult);
      expect(nativeResult).toBe("2026-10-05"); // Following Monday
    });

    it("matches web when today is already Monday", () => {
      // Monday Oct 5, 2026
      const fixedNow = new Date(2026, 9, 5, 10, 0, 0);
      const webResult = webSuggestStartDate([], fixedNow);
      const nativeResult = suggestStartDate([], fixedNow);

      expect(nativeResult).toBe(webResult);
      expect(nativeResult).toBe("2026-10-05");
    });

    it("matches web when today is Sunday", () => {
      // Sunday Oct 4, 2026
      const fixedNow = new Date(2026, 9, 4, 10, 0, 0);
      const webResult = webSuggestStartDate([], fixedNow);
      const nativeResult = suggestStartDate([], fixedNow);

      expect(nativeResult).toBe(webResult);
      expect(nativeResult).toBe("2026-10-05"); // Tomorrow Monday
    });

    it("matches web when member has an existing schedule ending later", () => {
      // Current date: Sep 30, 2026
      const fixedNow = new Date(2026, 8, 30, 12, 0, 0);
      // Existing schedule ending on Friday Oct 16, 2026
      const schedules = [
        {
          scheduledWorkouts: [
            { date: "2026-10-05" },
            { date: "2026-10-07" },
            { date: "2026-10-16" }, // Last workout
          ],
        },
      ];

      const webResult = webSuggestStartDate(schedules, fixedNow);
      const nativeResult = suggestStartDate(schedules, fixedNow);

      expect(nativeResult).toBe(webResult);
      expect(nativeResult).toBe("2026-10-19"); // Monday following Oct 16
    });

    it("matches web across multiple active programs", () => {
      const fixedNow = new Date(2026, 8, 30, 12, 0, 0);
      const schedules = [
        {
          scheduledWorkouts: [
            { date: "2026-10-08" },
          ],
        },
        {
          scheduledWorkouts: [
            { date: "2026-10-22" }, // Thursday Oct 22
          ],
        },
      ];

      const webResult = webSuggestStartDate(schedules, fixedNow);
      const nativeResult = suggestStartDate(schedules, fixedNow);

      expect(nativeResult).toBe(webResult);
      expect(nativeResult).toBe("2026-10-26"); // Monday following Oct 22
    });

    it("falls back to default next Monday if existing schedule ended in the past", () => {
      const fixedNow = new Date(2026, 8, 30, 12, 0, 0);
      const pastSchedules = [
        {
          scheduledWorkouts: [
            { date: "2026-08-10" },
            { date: "2026-08-15" },
          ],
        },
      ];

      const webResult = webSuggestStartDate(pastSchedules, fixedNow);
      const nativeResult = suggestStartDate(pastSchedules, fixedNow);

      expect(nativeResult).toBe(webResult);
      expect(nativeResult).toBe("2026-10-05");
    });
  });

  describe("(id: e015c847) At 22:00 Pacific, choosing today stores today, not tomorrow", () => {
    it("computes local date key as today at 22:00 in any local timezone", () => {
      // At 22:00 on Sep 30, in local time, the day is 30, month is 8 (Sep), year is 2026.
      // UTC instant is 2026-10-01T05:00:00Z (Pacific PDT UTC-7).
      // If code used .toISOString().slice(0, 10), it would produce '2026-10-01' (tomorrow).
      const pacificDate = new Date(2026, 8, 30, 22, 0, 0);

      // Verify that toISOString would be tomorrow (in UTC if running in UTC/PDT)
      const localResult = localDateKey(pacificDate);
      expect(localResult).toBe("2026-09-30");
      expect(localResult).not.toBe("2026-10-01");
    });

    it("sends local today to enrollProgram without UTC bleed", async () => {
      mockApiFetch.mockResolvedValueOnce({
        message: "Enrolled",
        activeProgram: {
          programId: "prog-pacific",
          startDate: "2026-09-30",
          status: "in-progress",
        },
      });

      // User choosing today at 22:00
      const chosenToday = localDateKey(new Date(2026, 8, 30, 22, 0, 0));
      expect(chosenToday).toBe("2026-09-30");

      await enrollProgram(
        { baseUrl: "https://become.redbtn.io", getToken: () => "test-token" },
        { programId: "prog-pacific", startDate: chosenToday },
      );

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/programs/enroll",
        expect.anything(),
        expect.objectContaining({
          method: "POST",
          body: {
            programId: "prog-pacific",
            startDate: "2026-09-30",
          },
        }),
      );
    });

    it("sends local today to createSchedule without UTC bleed", async () => {
      mockApiFetch.mockResolvedValueOnce({
        message: "Schedule created",
        schedule: {
          programId: "prog-pacific",
          totalScheduledWorkouts: 12,
        },
      });

      const chosenToday = localDateKey(new Date(2026, 8, 30, 22, 0, 0));

      await createSchedule(
        { baseUrl: "https://become.redbtn.io", getToken: () => "test-token" },
        {
          programId: "prog-pacific",
          trainingDays: [1, 3, 5],
          startDate: chosenToday,
        },
      );

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/schedule",
        expect.anything(),
        expect.objectContaining({
          method: "POST",
          body: {
            programId: "prog-pacific",
            trainingDays: [1, 3, 5],
            startDate: "2026-09-30",
          },
        }),
      );
    });
  });

  describe("Shared enroll request helper (NP-057 & NP-074 parity)", () => {
    it("enrols with startDate for program detail (NP-074)", async () => {
      mockApiFetch.mockResolvedValueOnce({
        message: "Enrolled",
        activeProgram: { programId: "p1", status: "in-progress" },
      });

      await enrollProgram(
        { baseUrl: "https://become.redbtn.io" },
        { programId: "p1", startDate: "2026-10-05" },
      );

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/programs/enroll",
        expect.anything(),
        expect.objectContaining({
          body: { programId: "p1", startDate: "2026-10-05" },
        }),
      );
    });

    it("enrols without startDate for onboarding (NP-057)", async () => {
      mockApiFetch.mockResolvedValueOnce({
        message: "Enrolled",
        activeProgram: { programId: "p-onboard", status: "in-progress" },
      });

      await enrollProgram(
        { baseUrl: "https://become.redbtn.io" },
        { programId: "p-onboard" },
      );

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/programs/enroll",
        expect.anything(),
        expect.objectContaining({
          body: { programId: "p-onboard" },
        }),
      );
    });
  });

  describe("suggestTrainingDays parity", () => {
    it("matches web training days suggestions", () => {
      expect(suggestTrainingDays(1)).toEqual([1]);
      expect(suggestTrainingDays(2)).toEqual([1, 4]);
      expect(suggestTrainingDays(3)).toEqual([1, 3, 5]);
      expect(suggestTrainingDays(4)).toEqual([1, 2, 4, 5]);
      expect(suggestTrainingDays(5)).toEqual([1, 2, 3, 4, 5]);
      expect(suggestTrainingDays(6)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(suggestTrainingDays(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(suggestTrainingDays(0)).toEqual([1, 2, 4, 5]); // fallback
    });
  });

  describe("generateSchedulePreview", () => {
    it("generates 2-week preview matching training days", () => {
      // Start date: Monday Oct 5, 2026
      // Training days: Mon (1), Wed (3), Fri (5)
      const preview = generateSchedulePreview("2026-10-05", [1, 3, 5], 14);

      expect(preview.length).toBe(6); // 3 days/week * 2 weeks = 6 workouts
      expect(preview[0]).toEqual({
        date: "2026-10-05",
        dayLabel: "Day 1",
        title: "Training Day 1",
      });
      expect(preview[1]).toEqual({
        date: "2026-10-07",
        dayLabel: "Day 2",
        title: "Training Day 2",
      });
      expect(preview[2]).toEqual({
        date: "2026-10-09",
        dayLabel: "Day 3",
        title: "Training Day 3",
      });
      expect(preview[3]).toEqual({
        date: "2026-10-12",
        dayLabel: "Day 4",
        title: "Training Day 4",
      });
    });
  });
});
