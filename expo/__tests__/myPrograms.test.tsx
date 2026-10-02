/* eslint-disable import/first */
/**
 * MY PROGRAMS, ON THE PHONE (NP-135).
 *
 * Native counterpart of `webapp/app/dashboard/programs/mine/MyProgramsClient.tsx`:
 * a custom program built on the web appears in `GET /api/programs/custom` and
 * can be enrolled in; deleting one frees the free-tier slot at once; create
 * and edit open the right web pages signed in.
 *
 * What is pinned here is the behaviour a member actually feels, against the
 * REAL entitlements store and a stubbed server (the `entitlementsSurfaces`
 * pattern), because two of the three criteria are about ordering rather than
 * markup:
 *
 *   • (e015c9b7) a custom program built on the web appears natively and can
 *     be enrolled in — the list fetch renders the row, and confirming the
 *     enrol modal POSTs `/api/programs/enroll` with the program id;
 *   • (e015c9b8) deleting one lets a free member at 3 of 3 create another
 *     straight away — the delete handler refetches the list AND forces a
 *     snapshot re-read (NP-049), so the create control unlocks without the
 *     60s TTL lapsing (the clock is frozen);
 *   • (e015c9b9) create and edit open the right web pages — both go through
 *     `openWebSignedIn` (NP-121), asserted on the mint POST (path) rather
 *     than on the browser URL (which is the hand-off URL by design).
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
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import MyProgramsRoute from "@/app/(app)/(tabs)/programming/mine";
import {
  CUSTOM_PROGRAM_CREATE_PATH,
  customProgramEditPath,
  toCustomProgramSummary,
  canEditCustomProgram,
} from "@/lib/programs/customPrograms";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockOpenWeb = openWebSignedIn as unknown as jest.Mock;

const NOW_MS = Date.UTC(2026, 8, 30, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor((NOW_MS + 30 * DAY_MS) / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

const MEMBER_JWT = mockMemberJwt();
void MEMBER_JWT;

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
      "custom-programs": {
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

const OWNED = {
  program_id: "custom-abc",
  name: "My Split",
  description: "Built on the web",
  duration_weeks: 8,
  training_days_per_week: 4,
  goal: "strength",
  target_user: "Intermediate",
  tags: ["strength"],
  phases: [],
  isCustom: true,
  isOwner: true,
};

const SHARED = {
  program_id: "custom-shared",
  name: "Coach Plan",
  description: "Shared by my trainer",
  duration_weeks: 6,
  training_days_per_week: 3,
  goal: "hypertrophy",
  target_user: "Beginner",
  tags: [],
  phases: [],
  isCustom: true,
  isOwner: false,
  sharedByName: "Coach Jon",
};

let storage: AsyncStorageLike;

beforeEach(async () => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
  mockOpenWeb.mockReset();
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
  await clearAll(storage);
});

/** Route apiFetch by path: list / delete / enroll. Entitlements answers come
 * from `scriptEntitlements` above (same mock, told apart by path). */
function routeListFetch(impl: (path: string) => unknown) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/me/entitlements") {
      const body = entitlementsQueue.shift();
      if (body === undefined) {
        throw new Error(
          "no entitlements answer scripted — call scriptEntitlements() first",
        );
      }
      return body;
    }
    return impl(path);
  });
}

describe("customPrograms lib", () => {
  it("maps program_id, keeps ownership, and gates edit on isOwner", () => {
    expect(toCustomProgramSummary(OWNED as never)).toMatchObject({
      id: "custom-abc",
      name: "My Split",
      isOwner: true,
    });
    expect(toCustomProgramSummary(SHARED as never)).toMatchObject({
      id: "custom-shared",
      isOwner: false,
      sharedByName: "Coach Jon",
    });
    expect(canEditCustomProgram(toCustomProgramSummary(OWNED as never))).toBe(
      true,
    );
    expect(canEditCustomProgram(toCustomProgramSummary(SHARED as never))).toBe(
      false,
    );
  });

  it("create and edit point at the web editor paths", () => {
    expect(CUSTOM_PROGRAM_CREATE_PATH).toBe("/dashboard/programs/new");
    expect(customProgramEditPath("custom-abc")).toBe(
      "/dashboard/programs/custom-abc/edit",
    );
    expect(customProgramEditPath("a b/c")).toBe(
      "/dashboard/programs/a%20b%2Fc/edit",
    );
  });
});

describe("(id: e015c9b7) A custom program built on the web appears natively and can be enrolled in", () => {
  it("lists the web-built program and enrols through the enrol modal", async () => {
    routeListFetch((path: string) => {
      if (path === "/api/programs/custom") {
        return { programs: [OWNED, SHARED] };
      }
      if (path === "/api/programs/enroll") {
        return {
          message: "Enrolled",
          activeProgram: {
            programId: "custom-abc",
            programName: "My Split",
            startDate: "2026-10-05",
            currentPhase: 1,
            currentDay: "Day 1",
            completedWorkouts: 0,
            totalWorkouts: 32,
            status: "in-progress",
          },
        };
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyProgramsRoute />);

    // Both rows appear: owned and trainer-shared.
    await waitFor(() =>
      expect(screen.getByTestId("my-programs-item-custom-abc")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("my-programs-item-custom-shared"),
    ).toBeTruthy();
    // The shared row enrols but has no edit and no delete.
    expect(
      screen.getByTestId("my-programs-enroll-custom-shared"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("my-programs-edit-custom-shared"),
    ).toBeNull();
    expect(
      screen.queryByTestId("my-programs-delete-custom-shared"),
    ).toBeNull();
    // The owned row has all three.
    expect(
      screen.getByTestId("my-programs-edit-custom-abc"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("my-programs-delete-custom-abc"),
    ).toBeTruthy();

    // Enrol: tap Enroll, confirm the start-date modal, POST /api/programs/enroll.
    fireEvent.press(screen.getByTestId("my-programs-enroll-custom-abc"));
    await waitFor(() =>
      expect(screen.getByTestId("my-programs-enroll-modal")).toBeTruthy(),
    );
    fireEvent.press(
      screen.getByTestId("my-programs-enroll-modal-confirm"),
    );

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/programs/enroll",
        expect.anything(),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const enrollCall = mockApiFetch.mock.calls.find(
      ([path]) => path === "/api/programs/enroll",
    );
    expect(enrollCall).toBeTruthy();
  });
});

describe("(id: e015c9b8) Deleting one natively lets a free member at 3 of 3 create another straight away", () => {
  it("delete refetches the list and forces the snapshot re-read, unlocking create without the TTL lapsing", async () => {
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
      if (path === "/api/programs/custom") {
        return { programs: [OWNED] };
      }
      if (path.startsWith("/api/programs/custom/")) {
        return { ok: true };
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyProgramsRoute />);

    // The member is at the cap: the counter reads 3/3 and the lock explains it.
    await waitFor(() =>
      expect(
        screen.getByTestId("my-programs-allowance-counter-count"),
      ).toHaveTextContent("3/3"),
    );
    expect(
      screen.getByTestId("my-programs-allowance-lock"),
    ).toBeTruthy();

    // Delete is a two-tap confirm: the row stays until the member confirms.
    fireEvent.press(screen.getByTestId("my-programs-delete-custom-abc"));
    await waitFor(() =>
      expect(
        screen.getByTestId("my-programs-delete-modal"),
      ).toBeTruthy(),
    );
    // Cancelling keeps the row and issues no delete.
    fireEvent.press(screen.getByTestId("my-programs-delete-cancel"));
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      "/api/programs/custom/custom-abc",
      expect.anything(),
      expect.anything(),
    );

    // Confirming deletes, then the list AND the snapshot are re-read: the
    // second entitlements request carries the freed slot.
    fireEvent.press(screen.getByTestId("my-programs-delete-custom-abc"));
    await waitFor(() =>
      expect(
        screen.getByTestId("my-programs-delete-modal"),
      ).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("my-programs-delete-confirm"));
    });

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/programs/custom/custom-abc",
        expect.anything(),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );

    // The lock clears and create is a create again — the clock never moved.
    await waitFor(() =>
      expect(
        screen.queryByTestId("my-programs-allowance-lock"),
      ).toBeNull(),
    );
    expect(Date.now()).toBe(NOW_MS);
  });
});

describe("(id: e015c9b9) Create and Edit open the right web pages", () => {
  it("create opens /dashboard/programs/new and edit opens /dashboard/programs/{id}/edit, signed in", async () => {
    routeListFetch((path: string) => {
      if (path === "/api/programs/custom") {
        return { programs: [OWNED] };
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyProgramsRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("my-programs-item-custom-abc")).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId("my-programs-create"));
    await waitFor(() =>
      expect(mockOpenWeb).toHaveBeenCalledWith("/dashboard/programs/new"),
    );

    fireEvent.press(screen.getByTestId("my-programs-edit-custom-abc"));
    await waitFor(() =>
      expect(mockOpenWeb).toHaveBeenCalledWith(
        "/dashboard/programs/custom-abc/edit",
      ),
    );
  });
});
