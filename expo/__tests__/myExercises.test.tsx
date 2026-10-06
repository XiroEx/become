/* eslint-disable import/first */
/**
 * MY EXERCISES, ON THE PHONE (NP-169).
 *
 * Native counterpart of `webapp/app/dashboard/workout/library/ExerciseLibraryClient.tsx`:
 * a custom exercise built on the web appears in `GET /api/exercises/custom` and
 * can be edited, deleted and submitted for review; creating one posts the same
 * field set the web form sends; deleting one frees the free-tier slot at once.
 *
 * What is pinned here is the behaviour a member actually feels, against the
 * REAL entitlements store and a stubbed server (the `entitlementsSurfaces`
 * pattern), because two of the three criteria are about ordering rather than
 * markup:
 *
 *   • (e015ca72) a free member at 3 of 3 sees the upgrade sheet on Create but
 *     can still edit and delete — create reads `canCreate` (the sheet opens),
 *     while edit (PATCH) and delete (DELETE) stay `requireFeature` and succeed
 *     at the cap; the delete then forces a snapshot re-read (NP-049) so the
 *     create control unlocks without the 60s TTL lapsing (the clock is frozen);
 *   • (e015ca73) an exercise created natively can be used in a swap and a
 *     session on the web — the create POST sends the web's field set
 *     (name/trackingType/muscleGroup/category/role/defaultSets/defaultReps),
 *     and the created row maps onto a swap candidate with its slug, tracking
 *     type and classification intact;
 *   • (e015ca74) choosing Bodyweight gives reps-only tracking natively —
 *     `applyCategoryChange` switches tracking at pick time, so the picker the
 *     member sees always agrees with what the server stores.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // Run the focus effect on mount, like the tab coming into view.
    const React = jest.requireActual("react");
    React.useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "member@example.com" },
    token: mockMemberJwt(),
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: jest.fn(async () => "signed-in" as const),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

const mockPush = jest.fn();

function mockMemberJwt(): string {
  return jwtFor("member-1");
}

import { apiFetch } from "@become/api-client";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import { getUpgradeSheetGate, hideUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import MyExercisesRoute from "@/app/(app)/(tabs)/programming/exercises";
import {
  DEFAULT_CUSTOM_EXERCISE_FORM,
  applyCategoryChange,
  customExerciseDeletePath,
  customExerciseEditPath,
  customExerciseSubmitPath,
  toCustomExerciseSummary,
  toCustomExerciseWriteBody,
} from "@/lib/workout/customExercises";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const NOW_MS = Date.UTC(2026, 8, 30, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor((NOW_MS + 30 * DAY_MS) / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

/** The entitlements server, scripted per test (surfaces pattern).
 * NOTE: the route under test calls the mocked `@become/api-client` (which the
 * store also uses), so entitlements answers are scripted by path inside
 * `routeListFetch` — there is no second fetch impl. */
let entitlementsQueue: unknown[] = [];

/** Script the next N snapshot reads, in order. */
function scriptEntitlements(...bodies: unknown[]): void {
  entitlementsQueue = [...bodies];
}

function freePlan(canCreate: boolean, remaining: number, enforced = true) {
  return {
    role: "user",
    tier: "free",
    enforced,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {
      "custom-exercises": {
        allowed: true,
        canCreate,
        requiresTier: "plus",
        limit: 3,
        used: 3 - remaining,
        remaining,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

const AT_CAP = freePlan(false, 0);
const SLOT_FREED = freePlan(true, 1);
const ROOM = freePlan(true, 3);

const OWNED = {
  slug: "custom-u1-seated-leg-curl-1",
  name: "Seated Leg Curl",
  trackingType: "reps_weight",
  primaryMuscles: ["hamstrings"],
  bodyRegion: "lower_body",
  category: "strength",
  role: "accessory",
  defaultSets: 3,
  defaultReps: "8-12",
  equipment: [],
  reviewStatus: "none",
  isUniversal: false,
};

let storage: AsyncStorageLike;

beforeEach(async () => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
  hideUpgradeSheet();
  storage = createMemoryAsyncStorage();
  await clearAll(storage);
  setCacheMemberId(null);
  // NOTE: no fetchImpl — the store shares the mocked `@become/api-client`,
  // so entitlements requests arrive in `mockApiFetch` (path
  // `/api/me/entitlements`) and each test routes them there.
  configureEntitlementsStore({ baseUrl: "https://example.test", storage });
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  jest.spyOn(Date, "now").mockImplementation(() => NOW_MS);
});

afterEach(async () => {
  jest.restoreAllMocks();
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  await clearAll(storage);
});

/** Route apiFetch by path: list / create / edit / delete / submit.
 * Entitlements answers come from `scriptEntitlements` above (same mock, told
 * apart by path). */
function routeListFetch(impl: (path: string, init?: unknown) => unknown) {
  mockApiFetch.mockImplementation(async (path: string, schema?: unknown, init?: unknown) => {
    if (path === "/api/me/entitlements") {
      const body = entitlementsQueue.shift();
      if (body === undefined) {
        throw new Error(
          "no entitlements answer scripted — call scriptEntitlements() first",
        );
      }
      return body;
    }
    return impl(path, init);
  });
}

describe("customExercises lib", () => {
  it("maps slug/name/classification and prefills the edit form", () => {
    expect(toCustomExerciseSummary(OWNED as never)).toMatchObject({
      slug: "custom-u1-seated-leg-curl-1",
      name: "Seated Leg Curl",
      trackingType: "reps_weight",
    });
    expect(customExerciseDeletePath("a b")).toBe("/api/exercises/custom?slug=a%20b");
    expect(customExerciseEditPath("custom-x")).toBe("/api/exercises/custom/custom-x");
    expect(customExerciseSubmitPath("custom-x")).toBe(
      "/api/exercises/custom/custom-x/submit",
    );
  });

  it("sends the web's field set on create", () => {
    expect(toCustomExerciseWriteBody({ ...DEFAULT_CUSTOM_EXERCISE_FORM, name: " X " })).toMatchObject({
      name: "X",
      trackingType: "reps_weight",
      muscleGroup: "chest",
      category: "strength",
      role: "accessory",
    });
  });

  it("(id: e015ca74) choosing Bodyweight gives reps-only tracking", () => {
    const next = applyCategoryChange(
      { ...DEFAULT_CUSTOM_EXERCISE_FORM, trackingType: "reps_weight" },
      "bodyweight",
    );
    expect(next.category).toBe("bodyweight");
    expect(next.trackingType).toBe("reps_only");
    // Any other category leaves the picked tracking alone.
    const kept = applyCategoryChange(
      { ...DEFAULT_CUSTOM_EXERCISE_FORM, trackingType: "time" },
      "cardio",
    );
    expect(kept.trackingType).toBe("time");
  });
});

describe("(id: e015ca72) A free member at 3 of 3 sees the upgrade sheet on Create but can still edit and delete", () => {
  it("create opens the sheet; edit and delete succeed; delete unlocks create without the TTL lapsing", async () => {
    // The hook reads the session from the store (`useSyncExternalStore` on
    // the token), so the token must be set BEFORE the screen mounts — the
    // effect that fires the first entitlements read runs on mount. The first
    // snapshot read answers AT_CAP; the forced re-read after the delete
    // answers SLOT_FREED. NOTE: the mocked useAuth token must equal the
    // store token or the identity check drops the snapshot.
    setEntitlementsToken(mockMemberJwt());
    // THREE reads, not two: the mount read, the focus re-read (the mocked
    // focus effect fires on mount beside it), then the forced re-read after
    // the delete. The first two answer AT_CAP; the post-delete one answers
    // SLOT_FREED — which is exactly the ordering the store's
    // supersede-then-force rules exist to guarantee.
    scriptEntitlements(AT_CAP, AT_CAP, SLOT_FREED);
    routeListFetch((path: string) => {
      if (path === "/api/exercises/custom") {
        return { exercises: [OWNED] };
      }
      if (path === customExerciseEditPath(OWNED.slug)) {
        return {
          exercise: { ...OWNED, name: "Seated Leg Curl v2" },
        };
      }
      if (path === customExerciseDeletePath(OWNED.slug)) {
        return { ok: true };
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyExercisesRoute />);

    // The member is at the cap: the counter reads 3/3 and the lock explains it.
    await waitFor(() =>
      expect(
        screen.getByTestId("my-exercises-allowance-counter-count"),
      ).toHaveTextContent("3/3"),
    );
    expect(screen.getByTestId("my-exercises-allowance-lock")).toBeTruthy();

    // Create at the cap raises the upgrade sheet — no create modal opens.
    fireEvent.press(screen.getByTestId("my-exercises-create"));
    await waitFor(() => expect(getUpgradeSheetGate()).toBeTruthy());
    expect(getUpgradeSheetGate()).toMatchObject({
      feature: "custom-exercises",
      requiresTier: "plus",
    });
    expect(screen.queryByTestId("my-exercises-create-modal")).toBeNull();
    hideUpgradeSheet();

    // Edit still works at the cap: expand the row, open the edit form, save.
    fireEvent.press(screen.getByTestId(`my-exercises-toggle-${OWNED.slug}`));
    fireEvent.press(screen.getByTestId(`my-exercises-edit-${OWNED.slug}`));
    expect(
      screen.getByTestId(`my-exercises-edit-${OWNED.slug}-name`),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(
        screen.getByTestId(`my-exercises-edit-${OWNED.slug}-submit`),
      );
    });
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        customExerciseEditPath(OWNED.slug),
        expect.anything(),
        expect.objectContaining({ method: "PATCH" }),
      ),
    );

    // Delete is a two-tap confirm: the row stays until the member confirms.
    fireEvent.press(screen.getByTestId(`my-exercises-delete-${OWNED.slug}`));
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-delete-modal")).toBeTruthy(),
    );
    // Cancelling keeps the row and issues no delete.
    fireEvent.press(screen.getByTestId("my-exercises-delete-cancel"));
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      customExerciseDeletePath(OWNED.slug),
      expect.anything(),
      expect.anything(),
    );

    // Confirming deletes, then the list AND the snapshot are re-read: the
    // second entitlements request carries the freed slot.
    fireEvent.press(screen.getByTestId(`my-exercises-delete-${OWNED.slug}`));
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-delete-modal")).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("my-exercises-delete-confirm"));
    });

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        customExerciseDeletePath(OWNED.slug),
        expect.anything(),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );

    // The lock clears and create is a create again — the clock never moved.
    await waitFor(() =>
      expect(screen.queryByTestId("my-exercises-allowance-lock")).toBeNull(),
    );
    expect(Date.now()).toBe(NOW_MS);
  });
});

describe("(id: e015ca73) An exercise created natively can be used in a swap and a session on the web", () => {
  it("create posts the web's field set and the created row maps onto a swap candidate intact", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(ROOM, ROOM);
    const created = {
      slug: "custom-u1-my-lift-2",
      name: "My Lift",
      trackingType: "reps_weight",
      primaryMuscles: ["chest"],
      bodyRegion: "upper_body",
      category: "strength",
      role: "accessory",
      defaultSets: 3,
      defaultReps: "8-12",
      equipment: [],
      reviewStatus: "none",
      isUniversal: false,
    };
    let postedBody: unknown = null;
    routeListFetch((path: string, init?: unknown) => {
      if (path === "/api/exercises/custom") {
        // First read: empty library. After the create POST, the re-read
        // returns the created row — the same round trip the web does.
        return postedBody === null ? { exercises: [] } : { exercises: [created] };
      }
      throw new Error(`unexpected fetch ${path}`);
    });
    mockApiFetch.mockImplementation(async (path: string, schema?: unknown, init?: unknown) => {
      if (path === "/api/me/entitlements") {
        const body = entitlementsQueue.shift();
        if (body === undefined) throw new Error("no entitlements answer scripted");
        return body;
      }
      if (path === "/api/exercises/custom") {
        const opts = init as { method?: string; body?: unknown } | undefined;
        if (opts?.method === "POST") {
          postedBody = opts.body;
          return { exercise: created };
        }
        return postedBody === null ? { exercises: [] } : { exercises: [created] };
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyExercisesRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-screen-state")).toBeTruthy(),
    );

    // Create is a create with room: the modal opens, the name goes in, submit.
    fireEvent.press(screen.getByTestId("my-exercises-create"));
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-create-modal")).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByTestId("my-exercises-create-form-name"),
      "My Lift",
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("my-exercises-create-form-submit"));
    });

    // The POST carries the web's field set — this is the contract the web's
    // swap sheet and session builder read back (slug, tracking, muscles).
    await waitFor(() => expect(postedBody).toBeTruthy());
    expect(postedBody).toMatchObject({
      name: "My Lift",
      trackingType: "reps_weight",
      muscleGroup: "chest",
      category: "strength",
      role: "accessory",
      defaultSets: "3",
      defaultReps: "8-12",
    });

    // The created row renders with its slug, tracking and muscles intact —
    // the fields a swap candidate and a session row are built from.
    await waitFor(() =>
      expect(
        screen.getByTestId(`my-exercises-item-${created.slug}`),
      ).toBeTruthy(),
    );
    const summary = toCustomExerciseSummary(created as never);
    expect(summary.slug).toBe(created.slug);
    expect(summary.trackingType).toBe("reps_weight");
    expect(summary.primaryMuscles).toEqual(["chest"]);
  });

  it("submit for review posts to …/submit and withdraw deletes it", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(ROOM, ROOM);
    routeListFetch((path: string) => {
      if (path === "/api/exercises/custom") {
        return { exercises: [OWNED] };
      }
      if (path === customExerciseSubmitPath(OWNED.slug)) {
        return { reviewStatus: "pending", submittedAt: new Date(NOW_MS).toISOString() };
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyExercisesRoute />);
    await waitFor(() =>
      expect(screen.getByTestId(`my-exercises-item-${OWNED.slug}`)).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId(`my-exercises-toggle-${OWNED.slug}`));
    await act(async () => {
      fireEvent.press(screen.getByTestId(`my-exercises-submit-${OWNED.slug}`));
    });
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        customExerciseSubmitPath(OWNED.slug),
        expect.anything(),
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});

describe("(NP-276) native parity — the create sheet fits the safe area; list search/sort/filters; video entry point; pending banner; form hints", () => {
  const BENCH = {
    slug: "custom-u1-bench-press-1",
    name: "Bench Press",
    trackingType: "reps_weight",
    primaryMuscles: ["chest"],
    bodyRegion: "upper_body",
    category: "strength",
    role: "compound",
    defaultSets: 4,
    defaultReps: "6-8",
    equipment: [],
    reviewStatus: "none",
    isUniversal: false,
    tags: ["custom", "strength", "push", "upper_body"],
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  const PLANK = {
    slug: "custom-u1-plank-hold-2",
    name: "Plank Hold",
    trackingType: "time",
    primaryMuscles: ["abs", "obliques"],
    bodyRegion: "core",
    category: "bodyweight",
    role: "accessory",
    defaultSets: 3,
    defaultReps: "45s",
    equipment: [],
    reviewStatus: "pending",
    isUniversal: false,
    tags: ["custom", "bodyweight", "core", "isometric"],
    createdAt: "2026-09-15T00:00:00.000Z",
  };

  it("BLOCKER: the create sheet is a scrollable bottom sheet bounded to the safe area, not an unbounded centred modal", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(ROOM, ROOM);
    routeListFetch((path: string) => {
      if (path === "/api/exercises/custom") return { exercises: [] };
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyExercisesRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-screen-state")).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId("my-exercises-create"));
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-create-modal")).toBeTruthy(),
    );

    // Bounded, not an unbounded centred `Modal`: the sheet's own card caps
    // its height to the safe area and the form scrolls inside it — this is
    // what keeps the title, Cancel and Create reachable on a phone screen
    // shorter than the form (the card's BLOCKER).
    expect(
      screen.getByTestId("my-exercises-create-modal-sheet").props.style,
    ).toMatchObject({ maxHeight: "90%" });
    expect(screen.getByTestId("my-exercises-create-form-scroll")).toBeTruthy();
    expect(screen.getByTestId("my-exercises-create-form-name")).toBeTruthy();
    expect(screen.getByTestId("my-exercises-create-form-cancel")).toBeTruthy();
    expect(screen.getByTestId("my-exercises-create-form-submit")).toBeTruthy();
  });

  it("the empty library shows an icon and a Create Exercise button (ScreenState no longer swallows them)", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(ROOM, ROOM);
    routeListFetch((path: string) => {
      if (path === "/api/exercises/custom") return { exercises: [] };
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyExercisesRoute />);
    await waitFor(() => expect(screen.getByTestId("my-exercises-empty")).toBeTruthy());
    expect(screen.getByTestId("my-exercises-create-empty")).toBeTruthy();

    fireEvent.press(screen.getByTestId("my-exercises-create-empty"));
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-create-modal")).toBeTruthy(),
    );
  });

  it("search, sort and the body-part / role filter chips narrow the list the way the web's do", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(ROOM, ROOM);
    routeListFetch((path: string) => {
      if (path === "/api/exercises/custom") return { exercises: [BENCH, PLANK] };
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyExercisesRoute />);
    await waitFor(() =>
      expect(screen.getByTestId(`my-exercises-item-${BENCH.slug}`)).toBeTruthy(),
    );
    expect(screen.getByTestId(`my-exercises-item-${PLANK.slug}`)).toBeTruthy();

    // "Recent" (the default) sorts the newer row (Plank) first.
    let rows = screen.getAllByTestId(/^my-exercises-item-/);
    expect(rows[0]?.props.testID).toBe(`my-exercises-item-${PLANK.slug}`);

    // "A–Z" sorts Bench before Plank.
    fireEvent.press(screen.getByTestId("my-exercises-sort-alphabetical"));
    rows = screen.getAllByTestId(/^my-exercises-item-/);
    expect(rows[0]?.props.testID).toBe(`my-exercises-item-${BENCH.slug}`);

    // Search narrows to the matching row only.
    fireEvent.changeText(screen.getByTestId("my-exercises-search"), "plank");
    expect(screen.queryByTestId(`my-exercises-item-${BENCH.slug}`)).toBeNull();
    expect(screen.getByTestId(`my-exercises-item-${PLANK.slug}`)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("my-exercises-search"), "");

    // Body-part chip: "Chest" keeps Bench, drops Plank; toggling it off brings
    // Plank back.
    fireEvent.press(screen.getByTestId("my-exercises-body-part-chest"));
    expect(screen.getByTestId(`my-exercises-item-${BENCH.slug}`)).toBeTruthy();
    expect(screen.queryByTestId(`my-exercises-item-${PLANK.slug}`)).toBeNull();
    fireEvent.press(screen.getByTestId("my-exercises-body-part-chest"));

    // Role chip: "Accessory" keeps Plank, drops Bench.
    fireEvent.press(screen.getByTestId("my-exercises-role-accessory"));
    expect(screen.queryByTestId(`my-exercises-item-${BENCH.slug}`)).toBeNull();
    expect(screen.getByTestId(`my-exercises-item-${PLANK.slug}`)).toBeTruthy();

    // No match for an unfindable query — and "Clear search & filters" resets.
    fireEvent.press(screen.getByTestId("my-exercises-role-accessory"));
    fireEvent.changeText(screen.getByTestId("my-exercises-search"), "nonexistent-xyz");
    expect(screen.getByTestId("my-exercises-no-matches")).toBeTruthy();
    fireEvent.press(screen.getByTestId("my-exercises-clear-filters"));
    expect(screen.getByTestId(`my-exercises-item-${BENCH.slug}`)).toBeTruthy();
    expect(screen.getByTestId(`my-exercises-item-${PLANK.slug}`)).toBeTruthy();
  });

  it("every row shows the Yours badge and its chip row (sets, reps, derived tags)", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(ROOM, ROOM);
    routeListFetch((path: string) => {
      if (path === "/api/exercises/custom") return { exercises: [BENCH] };
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyExercisesRoute />);
    await waitFor(() =>
      expect(screen.getByTestId(`my-exercises-item-${BENCH.slug}`)).toBeTruthy(),
    );
    expect(screen.getByTestId(`my-exercises-yours-${BENCH.slug}`)).toBeTruthy();
    expect(screen.getByTestId(`my-exercises-chip-sets-${BENCH.slug}`)).toBeTruthy();
    expect(screen.getByTestId(`my-exercises-chip-reps-${BENCH.slug}`)).toBeTruthy();
    expect(
      screen.getByTestId(`my-exercises-chip-tag-${BENCH.slug}-strength`),
    ).toBeTruthy();
    expect(screen.getByTestId(`my-exercises-chip-tag-${BENCH.slug}-push`)).toBeTruthy();
  });

  it("the expanded card offers Add a video and an outline delete, and a pending row shows the amber banner", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(ROOM, ROOM);
    routeListFetch((path: string) => {
      if (path === "/api/exercises/custom") return { exercises: [BENCH, PLANK] };
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyExercisesRoute />);
    await waitFor(() =>
      expect(screen.getByTestId(`my-exercises-item-${BENCH.slug}`)).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId(`my-exercises-toggle-${BENCH.slug}`));
    // Neither row has a demo yet — "Add a video" opens the web library, with
    // the hint copy the card asks for, rather than no video section at all.
    expect(screen.getByTestId(`my-exercises-video-${BENCH.slug}`)).toBeTruthy();
    expect(screen.getByTestId(`my-exercises-video-hint-${BENCH.slug}`)).toBeTruthy();
    expect(screen.getByTestId(`my-exercises-delete-${BENCH.slug}`)).toBeTruthy();

    fireEvent.press(screen.getByTestId(`my-exercises-toggle-${PLANK.slug}`));
    expect(screen.getByTestId(`my-exercises-pending-${PLANK.slug}`)).toBeTruthy();
  });

  it("the create form shows the web's tracking-type and role hints", async () => {
    setEntitlementsToken(mockMemberJwt());
    scriptEntitlements(ROOM, ROOM);
    routeListFetch((path: string) => {
      if (path === "/api/exercises/custom") return { exercises: [] };
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyExercisesRoute />);
    fireEvent.press(screen.getByTestId("my-exercises-create"));
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-create-modal")).toBeTruthy(),
    );

    expect(
      screen.getByTestId("my-exercises-create-form-tracking-reps_weight"),
    ).toBeTruthy();
    expect(screen.getByTestId("my-exercises-create-form-role-compound")).toBeTruthy();
    expect(screen.getByTestId("my-exercises-create-form-advanced-hint")).toBeTruthy();
  });
});
