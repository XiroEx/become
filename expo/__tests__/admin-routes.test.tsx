/* eslint-disable import/first */
import { render, waitFor } from "@testing-library/react-native";

let mockUser: { _id: string; email: string; role?: string } | null = null;
const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    token: mockToken,
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

import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import AdminExercisesRoute from "../app/admin/exercises/index";
import AdminFoodsRoute from "../app/admin/foods/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]) === path);
}

describe("Admin routes — role gating + data fetch", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/exercises") {
        return Promise.resolve({
          exercises: [
            { slug: "bench-press", name: "Bench Press", category: "push", videoUrl: "x.mp4" },
          ],
          total: 1,
        });
      }
      if (path === "/api/admin/foods") {
        return Promise.resolve({
          foods: [
            { _id: "f1", name: "Oats", source: "usda", needsReview: true },
          ],
          total: 1,
        });
      }
      return Promise.resolve({});
    });
  });

  describe("admin user", () => {
    beforeEach(() => {
      mockUser = { _id: "u1", email: "admin@x.com", role: "admin" };
    });

    it("exercises: GETs /api/exercises with baseUrl+token and renders the list", async () => {
      const { getByTestId } = render(<AdminExercisesRoute />);
      await waitFor(() => {
        expect(callsTo("/api/exercises").length).toBeGreaterThan(0);
      });
      const opts = callsTo("/api/exercises")[0]![2] as {
        baseUrl?: string;
        getToken?: () => string | undefined;
      };
      expect(opts).toEqual(
        expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }),
      );
      expect(opts.getToken?.()).toBe(mockToken);
      expect(getByTestId("admin-gate-allowed")).toBeTruthy();
      await waitFor(() => {
        expect(getByTestId("admin-exercises-item-bench-press")).toBeTruthy();
      });
    });

    it("foods: GETs /api/admin/foods with baseUrl+token and renders the list", async () => {
      const { getByTestId } = render(<AdminFoodsRoute />);
      await waitFor(() => {
        expect(callsTo("/api/admin/foods").length).toBeGreaterThan(0);
      });
      const opts = callsTo("/api/admin/foods")[0]![2] as {
        baseUrl?: string;
        getToken?: () => string | undefined;
      };
      expect(opts).toEqual(
        expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }),
      );
      expect(opts.getToken?.()).toBe(mockToken);
      expect(getByTestId("admin-gate-allowed")).toBeTruthy();
      await waitFor(() => {
        expect(getByTestId("admin-foods-item-f1")).toBeTruthy();
      });
    });
  });

  describe("non-admin user", () => {
    beforeEach(() => {
      mockUser = { _id: "u2", email: "jon@x.com", role: "user" };
    });

    it("exercises: blocks the screen and fires NO admin fetch", async () => {
      const { getByTestId, queryByTestId } = render(<AdminExercisesRoute />);
      expect(getByTestId("admin-gate-blocked")).toBeTruthy();
      expect(queryByTestId("admin-gate-allowed")).toBeNull();
      // The fetch is skipped for non-admins.
      await new Promise((r) => setTimeout(r, 0));
      expect(callsTo("/api/exercises").length).toBe(0);
    });

    it("foods: blocks the screen and fires NO admin fetch", async () => {
      const { getByTestId, queryByTestId } = render(<AdminFoodsRoute />);
      expect(getByTestId("admin-gate-blocked")).toBeTruthy();
      expect(queryByTestId("admin-gate-allowed")).toBeNull();
      await new Promise((r) => setTimeout(r, 0));
      expect(callsTo("/api/admin/foods").length).toBe(0);
    });
  });
});
