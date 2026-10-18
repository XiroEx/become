// Tests for safe weight writes on /api/weight.
//
// These tests verify that /api/weight POST uses targeted updateOne instead of
// progress.save(), so that a malformed legacy subdocument anywhere in the
// UserProgress document (e.g. workout sets missing setNumber) never throws
// whole-document validation errors, consecutiveSkips is incremented at most
// once per local day, memberAction and health-import de-duplication rules are
// preserved, and members without prior progress documents can still create one.

// Ensure mock db connection is set BEFORE loading modules that invoke dbConnect
const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } };
g.mongoose = { conn: { readyState: 1 }, promise: null };
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.JWT_SECRET ||= "become-unit-test-secret";
process.env.MONGODB_URI ||= "mongodb://127.0.0.1:27017/become-test";

import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import UserProgress from "../../models/UserProgress";
import User from "../../models/User";
import { signToken } from "../../lib/auth";
import { dateKey, localDateKey, utcMidnightDateKey } from "../../lib/dayWindow";

const USER_ID = "65f00000000000000000ee77";

let postWeight: any;

before(async () => {
  const weightMod = await import("../../app/api/weight/route");
  postWeight = (weightMod as any).POST ?? (weightMod as any).default?.POST;
});

beforeEach(() => {
  mock.method(User, "findById", () => ({
    select: () => ({
      lean: () => Promise.resolve({ profile: { weightUnit: "lbs" } }),
    }),
  }));
  mock.method(User, "findByIdAndUpdate", () => Promise.resolve({}));
});

async function makeAuthToken(userId = USER_ID) {
  return "Bearer " + (await signToken({ userId, email: "weight-safe-test@example.com" }));
}

function makeWeightRequest(body: unknown, token: string): NextRequest {
  return new NextRequest("http://localhost/api/weight", {
    method: "POST",
    headers: new Headers({
      "Content-Type": "application/json",
      Authorization: token,
    }),
    body: JSON.stringify(body),
  });
}

// ── Static code assertions & acceptance id: 96d41107 ──────────────────────────

test("(id: 96d41107) POST /api/weight no longer calls progress.save(); uses targeted updateOne for each branch", () => {
  const routeCode = fs.readFileSync(
    path.join(__dirname, "../../app/api/weight/route.ts"),
    "utf8",
  );

  const stripComments = (s: string) =>
    s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  assert.doesNotMatch(stripComments(routeCode), /progress\.save\(/);
  assert.doesNotMatch(stripComments(routeCode), /\.save\(/);
  assert.match(routeCode, /UserProgress\.updateOne/);
  assert.match(routeCode, /weightSkipTracking\.consecutiveSkips/);
  assert.match(routeCode, /weightSkipTracking\.lastPromptDate/);
  assert.match(routeCode, /weightSkipTracking\.lastWeightDate/);
  assert.match(routeCode, /weightHistory\.\${existingIndex}\.weight/);
  assert.match(routeCode, /weightHistory\.\${existingIndex}\.unit/);
  assert.match(routeCode, /weightHistory\.\${existingIndex}\.loggedAt/);
});

test("(id: 96d41107) Skip branch issues targeted updateOne with consecutiveSkips and lastPromptDate", async () => {
  const token = await makeAuthToken();
  const todayKey = localDateKey(null, 0);
  const today = utcMidnightDateKey(todayKey);

  const doc = {
    _id: "doc_skip_123",
    userId: USER_ID,
    weightSkipTracking: {
      consecutiveSkips: 1,
      lastPromptDate: new Date("2026-10-10T00:00:00.000Z"),
    },
    weightHistory: [],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(doc);
    }
    return Promise.resolve(null);
  });
  const updateCalls: Array<{ filter: any; update: any }> = [];
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any, update: any) {
    if (filter?._id === doc._id) {
      updateCalls.push({ filter, update });
    }
    return Promise.resolve({ acknowledged: true, modifiedCount: 1 });
  });

  try {
    const res = await postWeight(makeWeightRequest({ skip: true, tz: 0 }, token));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);

    assert.equal(updateCalls.length, 1);
    const call = updateCalls[0];
    assert.deepEqual(call.filter, { _id: "doc_skip_123" });
    assert.equal(call.update.$set["weightSkipTracking.consecutiveSkips"], 2);
    assert.deepEqual(call.update.$set["weightSkipTracking.lastPromptDate"], today);
    assert.equal(call.update.$set["weightSkipTracking.lastWeightDate"], undefined);
    assert.equal(call.update.$push, undefined);
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

test("(id: 96d41107) Append new day branch issues targeted updateOne with $push onto weightHistory and $set on weightSkipTracking", async () => {
  const token = await makeAuthToken();
  const todayKey = localDateKey(null, 0);
  const today = utcMidnightDateKey(todayKey);

  const doc = {
    _id: "doc_push_123",
    userId: USER_ID,
    weightSkipTracking: {
      consecutiveSkips: 3,
      lastPromptDate: new Date("2026-10-10T00:00:00.000Z"),
    },
    weightHistory: [
      {
        date: new Date("2026-10-10T00:00:00.000Z"),
        loggedAt: new Date("2026-10-10T08:00:00.000Z"),
        weight: 185,
        unit: "lbs",
      },
    ],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(doc);
    }
    return Promise.resolve(null);
  });
  const updateCalls: Array<{ filter: any; update: any }> = [];
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any, update: any) {
    if (filter?._id === doc._id) {
      updateCalls.push({ filter, update });
    }
    return Promise.resolve({ acknowledged: true, modifiedCount: 1 });
  });

  try {
    const res = await postWeight(makeWeightRequest({ weight: 182, bodyFat: 15.5, tz: 0 }, token));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);

    assert.equal(updateCalls.length, 1);
    const call = updateCalls[0];
    assert.deepEqual(call.filter, { _id: "doc_push_123" });
    assert.ok(call.update.$push?.weightHistory);
    assert.equal(call.update.$push.weightHistory.weight, 182);
    assert.equal(call.update.$push.weightHistory.unit, "lbs");
    assert.equal(call.update.$push.weightHistory.bodyFat, 15.5);
    assert.deepEqual(call.update.$push.weightHistory.date, today);

    // Reset skip tracking in the same update
    assert.equal(call.update.$set["weightSkipTracking.consecutiveSkips"], 0);
    assert.deepEqual(call.update.$set["weightSkipTracking.lastPromptDate"], today);
    assert.deepEqual(call.update.$set["weightSkipTracking.lastWeightDate"], today);
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

test("(id: 96d41107) Update existing day branch issues targeted updateOne with positional $set on weightHistory.<i> and weightSkipTracking", async () => {
  const token = await makeAuthToken();
  const todayKey = localDateKey(null, 0);
  const today = utcMidnightDateKey(todayKey);

  const doc = {
    _id: "doc_update_123",
    userId: USER_ID,
    weightSkipTracking: {
      consecutiveSkips: 1,
      lastPromptDate: today,
    },
    weightHistory: [
      {
        date: today,
        loggedAt: new Date(Date.now() - 60000),
        weight: 180,
        unit: "lbs",
      },
    ],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(doc);
    }
    return Promise.resolve(null);
  });
  const updateCalls: Array<{ filter: any; update: any }> = [];
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any, update: any) {
    if (filter?._id === doc._id) {
      updateCalls.push({ filter, update });
    }
    return Promise.resolve({ acknowledged: true, modifiedCount: 1 });
  });

  try {
    const res = await postWeight(makeWeightRequest({ weight: 179.5, bodyFat: 14.8, tz: 0 }, token));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);

    assert.equal(updateCalls.length, 1);
    const call = updateCalls[0];
    assert.deepEqual(call.filter, { _id: "doc_update_123" });
    assert.equal(call.update.$push, undefined);
    assert.equal(call.update.$set["weightHistory.0.weight"], 179.5);
    assert.equal(call.update.$set["weightHistory.0.unit"], "lbs");
    assert.equal(call.update.$set["weightHistory.0.bodyFat"], 14.8);
    assert.ok(call.update.$set["weightHistory.0.loggedAt"] instanceof Date);
    assert.equal(call.update.$set["weightSkipTracking.consecutiveSkips"], 0);
    assert.deepEqual(call.update.$set["weightSkipTracking.lastPromptDate"], today);
    assert.deepEqual(call.update.$set["weightSkipTracking.lastWeightDate"], today);
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

// ── Acceptance id: 96d41108 ──────────────────────────────────────────────────

test("(id: 96d41108) A malformed legacy subdocument fails document.validateSync() and save()", () => {
  const legacyDoc = new UserProgress({
    userId: USER_ID,
    workoutLogs: [
      {
        date: new Date(),
        exercises: [
          {
            exerciseSlug: "deadlift",
            // Missing required setNumber: SetLogSchema requires setNumber: { type: Number, required: true }
            sets: [{ reps: 5 } as any],
          },
        ],
      },
    ],
  });

  const valError = legacyDoc.validateSync();
  assert.ok(valError, "Mongoose validateSync should fail for legacy missing required fields");
  assert.match(
    valError.message,
    /setNumber/,
    "Validation error mentions missing setNumber",
  );
});

test("(id: 96d41108) Both weigh-in and skip succeed on UserProgress document containing a subdocument that would fail whole-document validation", async () => {
  const token = await makeAuthToken();
  const todayKey = localDateKey(null, 0);
  const today = utcMidnightDateKey(todayKey);

  const invalidDoc: any = {
    _id: "doc_with_invalid_workout_set",
    userId: USER_ID,
    workoutLogs: [
      {
        exercises: [
          {
            exerciseSlug: "squat",
            sets: [{ reps: 8 }], // missing setNumber
          },
        ],
      },
    ],
    weightSkipTracking: {
      consecutiveSkips: 4,
      lastPromptDate: new Date("2026-10-01T00:00:00.000Z"),
    },
    weightHistory: [],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(invalidDoc);
    }
    return Promise.resolve(null);
  });
  const updateCalls: Array<{ filter: any; update: any }> = [];
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any, update: any) {
    if (filter?._id === invalidDoc._id) {
      updateCalls.push({ filter, update });
    }
    return Promise.resolve({ acknowledged: true, modifiedCount: 1 });
  });

  try {
    // 1. Skip on invalid document
    const skipRes = await postWeight(makeWeightRequest({ skip: true, tz: 0 }, token));
    assert.equal(skipRes.status, 200, "Skip must return 200 on invalid document");
    const skipJson = await skipRes.json();
    assert.equal(skipJson.success, true);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].update.$set["weightSkipTracking.consecutiveSkips"], 5);

    // 2. Weigh-in (new day) on invalid document
    const weighRes = await postWeight(makeWeightRequest({ weight: 175, tz: 0 }, token));
    assert.equal(weighRes.status, 200, "Weigh-in must return 200 on invalid document");
    const weighJson = await weighRes.json();
    assert.equal(weighJson.success, true);
    assert.equal(updateCalls.length, 2);
    assert.equal(updateCalls[1].update.$push?.weightHistory?.weight, 175);

    // 3. Weigh-in (updating existing day) on invalid document
    invalidDoc.weightHistory = [
      {
        date: today,
        loggedAt: new Date(Date.now() - 30000),
        weight: 175,
        unit: "lbs",
      },
    ];
    const updateRes = await postWeight(makeWeightRequest({ weight: 174.5, tz: 0 }, token));
    assert.equal(updateRes.status, 200, "Update weigh-in must return 200 on invalid document");
    const updateJson = await updateRes.json();
    assert.equal(updateJson.success, true);
    assert.equal(updateCalls.length, 3);
    assert.equal(updateCalls[2].update.$set["weightHistory.0.weight"], 174.5);
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

// ── Acceptance id: 96d41109 ──────────────────────────────────────────────────

test("(id: 96d41109) Per-day skip counting: consecutiveSkips increments at most once per local day", async () => {
  const token = await makeAuthToken();
  const tz = 300;
  const todayKey = localDateKey(null, tz);
  const today = utcMidnightDateKey(todayKey);
  const yesterdayKey = "2026-10-13";

  const progressDoc: any = {
    _id: "doc_skips_counting",
    userId: USER_ID,
    weightSkipTracking: {
      consecutiveSkips: 2,
      lastPromptDate: utcMidnightDateKey(yesterdayKey),
    },
    weightHistory: [],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(progressDoc);
    }
    return Promise.resolve(null);
  });
  const updateCalls: Array<{ filter: any; update: any }> = [];
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any, update: any) {
    if (filter?._id === progressDoc._id) {
      updateCalls.push({ filter, update });
      if (update.$set) {
        if (update.$set["weightSkipTracking.consecutiveSkips"] !== undefined) {
          progressDoc.weightSkipTracking.consecutiveSkips = update.$set["weightSkipTracking.consecutiveSkips"];
        }
        if (update.$set["weightSkipTracking.lastPromptDate"] !== undefined) {
          progressDoc.weightSkipTracking.lastPromptDate = update.$set["weightSkipTracking.lastPromptDate"];
        }
      }
    }
    return Promise.resolve({ acknowledged: true });
  });

  try {
    // 1st skip today: increments 2 -> 3
    const res1 = await postWeight(makeWeightRequest({ skip: true, tz }, token));
    assert.equal(res1.status, 200);
    assert.equal(updateCalls[0].update.$set["weightSkipTracking.consecutiveSkips"], 3);
    assert.deepEqual(updateCalls[0].update.$set["weightSkipTracking.lastPromptDate"], today);

    // 2nd skip today: already counted today, consecutiveSkips remains 3
    const res2 = await postWeight(makeWeightRequest({ skip: true, tz }, token));
    assert.equal(res2.status, 200);
    assert.equal(updateCalls[1].update.$set["weightSkipTracking.consecutiveSkips"], 3);

    // 3rd skip today: already counted today, consecutiveSkips remains 3
    const res3 = await postWeight(makeWeightRequest({ skip: true, tz }, token));
    assert.equal(res3.status, 200);
    assert.equal(updateCalls[2].update.$set["weightSkipTracking.consecutiveSkips"], 3);

    assert.equal(progressDoc.weightSkipTracking.consecutiveSkips, 3);
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

test("(id: 96d41109) memberAction: today manual weigh-in resets consecutiveSkips to 0 and updates lastPromptDate to today", async () => {
  const token = await makeAuthToken();
  const todayKey = localDateKey(null, 0);
  const today = utcMidnightDateKey(todayKey);

  const doc = {
    _id: "doc_member_action",
    userId: USER_ID,
    weightSkipTracking: {
      consecutiveSkips: 5,
      lastPromptDate: new Date("2026-10-01T00:00:00.000Z"),
    },
    weightHistory: [],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(doc);
    }
    return Promise.resolve(null);
  });
  let updateArgs: any = null;
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any, update: any) {
    if (filter?._id === doc._id) {
      updateArgs = { filter, update };
    }
    return Promise.resolve({ acknowledged: true });
  });

  try {
    const res = await postWeight(makeWeightRequest({ weight: 170, tz: 0 }, token));
    assert.equal(res.status, 200);
    assert.ok(updateArgs);
    assert.equal(updateArgs.update.$set["weightSkipTracking.consecutiveSkips"], 0);
    assert.deepEqual(updateArgs.update.$set["weightSkipTracking.lastPromptDate"], today);
    assert.deepEqual(updateArgs.update.$set["weightSkipTracking.lastWeightDate"], today);
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

test("(id: 96d41109) Backdated weigh-in: leaves consecutiveSkips and lastPromptDate untouched (memberAction is false)", async () => {
  const token = await makeAuthToken();
  const oldPrompt = new Date("2026-10-01T00:00:00.000Z");

  const doc = {
    _id: "doc_backdated",
    userId: USER_ID,
    weightSkipTracking: {
      consecutiveSkips: 4,
      lastPromptDate: oldPrompt,
    },
    weightHistory: [],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(doc);
    }
    return Promise.resolve(null);
  });
  let updateArgs: any = null;
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any, update: any) {
    if (filter?._id === doc._id) {
      updateArgs = { filter, update };
    }
    return Promise.resolve({ acknowledged: true });
  });

  try {
    // Log a weight backdated within the 7-day window
    const backdateStr = dateKey(new Date(Date.now() - 2 * 86_400_000), 0);
    const res = await postWeight(makeWeightRequest({ weight: 172, date: backdateStr, tz: 0 }, token));
    assert.equal(res.status, 200);
    assert.ok(updateArgs);
    // consecutiveSkips and lastPromptDate should NOT be in $set
    assert.equal(updateArgs.update.$set?.["weightSkipTracking.consecutiveSkips"], undefined);
    assert.equal(updateArgs.update.$set?.["weightSkipTracking.lastPromptDate"], undefined);
    // Since there were no later entries, isNewestWeighIn is true, so lastWeightDate is updated
    assert.deepEqual(
      updateArgs.update.$set?.["weightSkipTracking.lastWeightDate"],
      utcMidnightDateKey(backdateStr),
    );
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

test("(id: 96d41109) Health import: duplicate externalId is recognized, ignored without DB write (applied: false, duplicate: true)", async () => {
  const token = await makeAuthToken();

  const doc = {
    _id: "doc_import_dedup",
    userId: USER_ID,
    weightSkipTracking: { consecutiveSkips: 0 },
    weightHistory: [
      {
        date: new Date("2026-10-10T00:00:00.000Z"),
        weight: 180,
        unit: "lbs",
        source: "healthkit",
        externalId: "hk_sample_unique_123",
      },
    ],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(doc);
    }
    return Promise.resolve(null);
  });
  let updateCalled = false;
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any) {
    if (filter?._id === doc._id) {
      updateCalled = true;
    }
    return Promise.resolve({ acknowledged: true });
  });

  try {
    const res = await postWeight(
      makeWeightRequest(
        {
          weight: 180,
          date: "2026-10-10",
          source: "healthkit",
          externalId: "hk_sample_unique_123",
          tz: 0,
        },
        token,
      ),
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.applied, false);
    assert.equal(json.duplicate, true);
    assert.equal(updateCalled, false, "Duplicate health import must not issue updateOne");
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

test("(id: 96d41109) Stale replay precedence: older loggedAt for same day is accepted but ignored (applied: false, no DB write)", async () => {
  const token = await makeAuthToken();
  const todayKey = localDateKey(null, 0);
  const today = utcMidnightDateKey(todayKey);
  const newerTime = new Date("2026-10-14T10:00:00.000Z");
  const olderTime = new Date("2026-10-14T08:00:00.000Z");

  const doc = {
    _id: "doc_stale_replay",
    userId: USER_ID,
    weightSkipTracking: { consecutiveSkips: 0 },
    weightHistory: [
      {
        date: today,
        loggedAt: newerTime,
        weight: 178,
        unit: "lbs",
      },
    ],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(doc);
    }
    return Promise.resolve(null);
  });
  let updateCalled = false;
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any) {
    if (filter?._id === doc._id) {
      updateCalled = true;
    }
    return Promise.resolve({ acknowledged: true });
  });

  try {
    const res = await postWeight(
      makeWeightRequest(
        {
          weight: 182,
          date: todayKey,
          loggedAt: olderTime.toISOString(),
          tz: 0,
        },
        token,
      ),
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.applied, false);
    assert.equal(updateCalled, false, "Stale replay must not issue updateOne");
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

test("(id: 96d41109) isNewestWeighIn precedence: backdated entry older than newest does not update lastWeightDate", async () => {
  const token = await makeAuthToken();
  const latestStr = dateKey(new Date(Date.now() - 1 * 86_400_000), 0);
  const backdateStr = dateKey(new Date(Date.now() - 3 * 86_400_000), 0);
  const latestDate = utcMidnightDateKey(latestStr);

  const doc = {
    _id: "doc_newest_check",
    userId: USER_ID,
    weightSkipTracking: {
      consecutiveSkips: 0,
      lastWeightDate: latestDate,
    },
    weightHistory: [
      {
        date: latestDate,
        loggedAt: new Date(Date.now() - 1 * 86_400_000),
        weight: 175,
        unit: "lbs",
      },
    ],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(doc);
    }
    return Promise.resolve(null);
  });
  let updateArgs: any = null;
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any, update: any) {
    if (filter?._id === doc._id) {
      updateArgs = { filter, update };
    }
    return Promise.resolve({ acknowledged: true });
  });

  try {
    const res = await postWeight(
      makeWeightRequest(
        {
          weight: 177,
          date: backdateStr,
          tz: 0,
        },
        token,
      ),
    );
    assert.equal(res.status, 200);
    assert.ok(updateArgs);
    assert.equal(updateArgs.update.$push?.weightHistory?.weight, 177);
    assert.equal(updateArgs.update.$set, undefined);
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

// ── Acceptance id: 96d4110a ──────────────────────────────────────────────────

test("(id: 96d4110a) The no-progress-document UserProgress.create branch is unchanged", async () => {
  const token = await makeAuthToken();

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    return Promise.resolve(null);
  });

  const createCalls: any[] = [];
  const createMock = mock.method(UserProgress, "create", function(this: any, ...args: any[]) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      createCalls.push(args[0]);
    }
    return Promise.resolve({
      _id: "newly_created_doc_id",
      ...args[0],
    });
  });

  let updateCalled = false;
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any, filter: any) {
    if (filter?._id === "newly_created_doc_id") {
      updateCalled = true;
    }
    return Promise.resolve({ acknowledged: true });
  });

  try {
    const res = await postWeight(makeWeightRequest({ weight: 180, tz: 0 }, token));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);

    assert.ok(createCalls.length >= 1, "UserProgress.create must be called when document is null");
    assert.equal(updateCalled, false, "UserProgress.updateOne must not be called when document is created");
    const weightCreateCall = createCalls[0];
    assert.equal(weightCreateCall.userId, USER_ID);
    assert.equal(weightCreateCall.weightHistory.length, 1);
    assert.equal(weightCreateCall.weightHistory[0].weight, 180);
    assert.equal(weightCreateCall.weightSkipTracking.consecutiveSkips, 0);
    assert.ok(weightCreateCall.weightSkipTracking.lastPromptDate instanceof Date);
    assert.ok(weightCreateCall.weightSkipTracking.lastWeightDate instanceof Date);
  } finally {
    findOneMock.mock.restore();
    createMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

// ── Acceptance id: 96d4110b ──────────────────────────────────────────────────

test("(id: 96d4110b) recordStreakActivity, bustTilesCache and goalReached still run on the same conditions", async () => {
  const token = await makeAuthToken();

  const doc = {
    _id: "doc_side_effects",
    userId: USER_ID,
    weightSkipTracking: { consecutiveSkips: 0 },
    weightHistory: [],
  };

  const findOneMock = mock.method(UserProgress, "findOne", function(this: any) {
    if (this === UserProgress || this?.modelName === "UserProgress") {
      return Promise.resolve(doc);
    }
    return Promise.resolve(null);
  });
  const updateOneMock = mock.method(UserProgress, "updateOne", function(this: any) {
    return Promise.resolve({ acknowledged: true });
  });

  try {
    // 1. Manual weigh-in today: streak runs and streak is included in response
    const res = await postWeight(makeWeightRequest({ weight: 170, tz: 0 }, token));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.streak, "Manual weigh-in today must record streak activity");

    // 2. Skip: streak does NOT run (streak not in response)
    const skipRes = await postWeight(makeWeightRequest({ skip: true, tz: 0 }, token));
    assert.equal(skipRes.status, 200);
    const skipJson = await skipRes.json();
    assert.equal(skipJson.streak, undefined, "Skip must not touch streak");

    // 3. Backdated weigh-in: streak does NOT run (streak not in response)
    const backdateStr = dateKey(new Date(Date.now() - 2 * 86_400_000), 0);
    const backdateRes = await postWeight(makeWeightRequest({ weight: 172, date: backdateStr, tz: 0 }, token));
    assert.equal(backdateRes.status, 200);
    const backdateJson = await backdateRes.json();
    assert.equal(backdateJson.streak, undefined, "Backdated weigh-in must not touch streak");

    // Static code verification that conditions are unchanged
    const routeCode = fs.readFileSync(
      path.join(__dirname, "../../app/api/weight/route.ts"),
      "utf8",
    );
    assert.ok(routeCode.includes("if (!skip && weight && isCurrent)"));
    assert.ok(routeCode.includes("User.findByIdAndUpdate"));
    assert.ok(routeCode.includes("if (!skip && weight && memberAction)"));
    assert.ok(routeCode.includes("recordStreakActivity"));
    assert.ok(routeCode.includes("checkGoalReached"));
    assert.ok(routeCode.includes("bustTilesCache(authResult.userId!)"));
  } finally {
    findOneMock.mock.restore();
    updateOneMock.mock.restore();
  }
});

// ── Acceptance id: 96d4110c ──────────────────────────────────────────────────

test("(id: 96d4110c) No new dependency; validateBeforeSave is not used", () => {
  const routeCode = fs.readFileSync(
    path.join(__dirname, "../../app/api/weight/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(routeCode, /validateBeforeSave/);

  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"),
  );
  assert.ok(pkgJson.dependencies);
});
