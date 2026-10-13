import { ApiError } from "@become/api-client";
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import {
  QUICK_PROGRAM_ID,
  clearQuickSession,
  quickSessionLiveHref,
  quickSessionOverviewHref,
  readQuickSession,
  stashQuickSession,
  stashQuickSessionWithId,
  swapQuickSessionExercise,
  updateQuickSession,
  type DraftSession,
} from "@/lib/quickSession/store";
import {
  clearQuickProgress,
  readQuickProgress,
  writeQuickProgress,
} from "@/lib/quickSession/progress";
import { rebuildQuickSession } from "@/lib/quickSession/rebuild";

// NP-224 — QUICK SESSIONS 1/5: THE LOCAL DRAFT STORE, PROGRESS AND THE REBUILD.
// The native draft store (`expo/lib/quickSession/store.ts`), the per-session
// progress snapshot (`progress.ts`) and the server rebuild (`rebuild.ts`),
// ported from `webapp/lib/quickSession/{store,progress,openQuick}.ts` onto the
// injected `KeyValueStore` the live cache already uses.
// The three acceptance ids, each asserted on its own below.

const DRAFT: DraftSession = {
  title: "Push Day",
  exercises: [
    {
      exerciseSlug: "bench-press",
      name: "Bench Press",
      trackingType: "reps_weight",
      sets: 3,
      reps: "8-12",
      rest: "90s",
    },
  ],
};

/**
 * The server fixture: a superset pair (one with a prescription, one falling
 * back to what its first set implies) plus a time-only exercise with no
 * prescription at all. Mirrors what `GET /api/workouts/session` hands back
 * for a session built mid-run.
 */
const SERVER_SESSION = {
  sessionId: "srv-1",
  title: "Evening Superset",
  needsName: false,
  focus: "push",
  date: "2026-10-01",
  completed: false,
  duration: null,
  exercises: [
    {
      name: "Bench Press",
      exerciseSlug: "bench-press",
      trackingType: "reps_weight",
      equipment: ["barbell"],
      sets: [
        {
          setNumber: 1,
          reps: 8,
          weight: 135,
          duration: null,
          distance: null,
          speed: null,
          completed: true,
        },
      ],
      groupId: "g1",
      groupType: "superset",
      groupLabel: "A",
      groupRounds: 3,
      prescription: { sets: 3, reps: "8-12", rest: "90s" },
    },
    {
      name: "Bent-Over Row",
      exerciseSlug: "bent-over-row",
      trackingType: "",
      sets: [
        {
          setNumber: 1,
          reps: 10,
          weight: 95,
          duration: null,
          distance: null,
          speed: null,
          completed: true,
        },
      ],
      groupId: "g1",
      groupType: "superset",
      groupLabel: "A",
      groupRounds: 3,
      addedAdHoc: true,
    },
    {
      name: "Plank",
      exerciseSlug: "plank",
      trackingType: "",
      sets: [
        {
          setNumber: 1,
          reps: null,
          weight: null,
          duration: 60,
          distance: null,
          speed: null,
          completed: true,
        },
      ],
    },
  ],
};

/**
 * What the WEB's `continueQuickSession` (`webapp/lib/quickSession/openQuick.ts`
 * l.45-71) produces for the fixture above — the mapping is copied set-for-set,
 * so the native rebuild must agree exactly.
 */
const WEB_DRAFT_EXERCISES = [
  {
    exerciseSlug: "bench-press",
    name: "Bench Press",
    trackingType: "reps_weight",
    sets: 3,
    reps: "8-12",
    rest: "90s",
    equipment: ["barbell"],
    groupId: "g1",
    groupType: "superset",
    groupLabel: "A",
    groupRounds: 3,
  },
  {
    exerciseSlug: "bent-over-row",
    name: "Bent-Over Row",
    trackingType: "reps_weight",
    sets: 1,
    reps: "10",
    groupId: "g1",
    groupType: "superset",
    groupLabel: "A",
    groupRounds: 3,
    addedAdHoc: true,
  },
  {
    exerciseSlug: "plank",
    name: "Plank",
    trackingType: "time",
    sets: 1,
    reps: "",
    duration: "60",
  },
];

describe("NP-224 quick-session draft store", () => {
  it("e5cecfce: stash, read, update and clear round-trip on the injected store", async () => {
    const store = createMemoryKeyValueStore();

    const id = await stashQuickSession(DRAFT, undefined, store);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const read = await readQuickSession(id, store);
    expect(read).toMatchObject({ sessionId: id, title: "Push Day" });
    expect(read?.exercises).toHaveLength(1);

    // A saved non-empty title is an explicit naming action.
    const named = await updateQuickSession(
      id,
      { title: "My Push Day" },
      store,
    );
    expect(named?.title).toBe("My Push Day");
    expect(named?.needsName).toBe(false);

    // An emptied title still needs a name.
    const unnamed = await updateQuickSession(id, { title: "  " }, store);
    expect(unnamed?.needsName).toBe(true);

    // Exercise swaps land in the stash.
    await swapQuickSessionExercise(
      id,
      0,
      { name: "Incline Bench", exerciseSlug: "incline-bench" },
      store,
    );
    const swapped = await readQuickSession(id, store);
    expect(swapped?.exercises[0]?.name).toBe("Incline Bench");
    expect(swapped?.exercises[0]?.exerciseSlug).toBe("incline-bench");
    // The prescription survives the swap.
    expect(swapped?.exercises[0]?.reps).toBe("8-12");

    await clearQuickSession(id, store);
    expect(await readQuickSession(id, store)).toBeNull();

    // Missing / corrupt entries read as null, never throw.
    expect(await readQuickSession("nope", store)).toBeNull();
    expect(await updateQuickSession("nope", { title: "x" }, store)).toBeNull();
    await store.set("quick_session_bad", "{not json");
    expect(await readQuickSession("bad", store)).toBeNull();

    // Storage failures never throw either.
    const failing = {
      get: async () => {
        throw new Error("down");
      },
      set: async () => {
        throw new Error("down");
      },
      remove: async () => {
        throw new Error("down");
      },
    };
    const failedId = await stashQuickSession(DRAFT, undefined, failing);
    expect(typeof failedId).toBe("string");
    expect(await readQuickSession(failedId, failing)).toBeNull();
    expect(await updateQuickSession(failedId, { title: "x" }, failing)).toBeNull();
    await expect(clearQuickSession(failedId, failing)).resolves.toBeUndefined();
  });

  it("e5cecfce: progress writes, reads and clears per sessionId", async () => {
    const store = createMemoryKeyValueStore();
    expect(await readQuickProgress("s1", store)).toBeNull();

    await writeQuickProgress(
      "s1",
      { bench: [{ reps: 8, weight: 135, completed: true }] },
      store,
    );
    const draft = await readQuickProgress("s1", store);
    expect(draft?.grid.bench).toEqual([
      { reps: 8, weight: 135, completed: true },
    ]);
    expect(typeof draft?.savedAt).toBe("number");

    // Sessions do not share progress.
    expect(await readQuickProgress("s2", store)).toBeNull();

    await clearQuickProgress("s1", store);
    expect(await readQuickProgress("s1", store)).toBeNull();
  });

  it("e5cecfce: native href builders point at the expo-router quick routes", () => {
    expect(QUICK_PROGRAM_ID).toBe("quick");
    expect(quickSessionOverviewHref("abc")).toBe(
      "/(tabs)/programming/quick?session=abc",
    );
    expect(
      quickSessionOverviewHref("abc", { saved: true, started: true }),
    ).toBe("/(tabs)/programming/quick?session=abc&saved=1&started=1");
    expect(quickSessionOverviewHref("a b", { date: "2026-10-01" })).toBe(
      "/(tabs)/programming/quick?session=a%20b&date=2026-10-01",
    );
    expect(quickSessionLiveHref("abc")).toBe(
      "/(tabs)/programming/quick/live?session=abc",
    );
  });

  it("e5cecfcd: a repeat stash gets a new sessionId and keeps sourceSessionId separate", async () => {
    const store = createMemoryKeyValueStore();

    const originalId = await stashQuickSessionWithId(
      DRAFT,
      "A",
      { needsName: false },
      store,
    );
    expect(originalId).toBe("A");

    const original = await readQuickSession("A", store);
    expect(original).not.toBeNull();

    // A repeat is stashed as a NEW draft pointing back at its source — the
    // source id is only ever stored as `sourceSessionId`, never as the id.
    const repeatId = await stashQuickSession(
      { title: original!.title, exercises: original!.exercises },
      { sourceSessionId: "A", needsName: original!.needsName },
      store,
    );
    expect(repeatId).not.toBe("A");

    const repeat = await readQuickSession(repeatId, store);
    expect(repeat?.sessionId).toBe(repeatId);
    expect(repeat?.sourceSessionId).toBe("A");

    // The historical log is untouched by the repeat.
    const untouched = await readQuickSession("A", store);
    expect(untouched?.sessionId).toBe("A");
    expect(untouched?.sourceSessionId).toBeUndefined();
  });

  it("e5cecfcf: a server log rebuilds into the web's DraftExercise shape, including groups and time-only sets", async () => {
    const store = createMemoryKeyValueStore();

    const rebuilt = await rebuildQuickSession("srv-1", {
      store,
      fetchSession: async () => ({ session: SERVER_SESSION }),
    });
    expect(rebuilt).not.toBeNull();
    expect(rebuilt?.sessionId).toBe("srv-1");
    expect(rebuilt?.title).toBe("Evening Superset");
    expect(rebuilt?.needsName).toBe(false);
    expect(rebuilt?.exercises).toEqual(WEB_DRAFT_EXERCISES);

    // Stashed under the SAME sessionId with the server's needsName.
    const stashed = await readQuickSession("srv-1", store);
    expect(stashed).toEqual(rebuilt);
  });

  it("e5cecfcf: a 404 returns null and stashes nothing", async () => {
    const store = createMemoryKeyValueStore();

    const missing = await rebuildQuickSession("gone", {
      store,
      fetchSession: async () => {
        throw new ApiError(404, { session: null });
      },
    });
    expect(missing).toBeNull();
    expect(await readQuickSession("gone", store)).toBeNull();

    const nullSession = await rebuildQuickSession("empty", {
      store,
      fetchSession: async () => ({ session: null }),
    });
    expect(nullSession).toBeNull();
    expect(await readQuickSession("empty", store)).toBeNull();
  });
});
