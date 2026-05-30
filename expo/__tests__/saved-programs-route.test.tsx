/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
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
import SavedProgramsRoute from "../app/(tabs)/programming/saved";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function savedCalls(method?: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => {
    if (String(c[0]) !== "/api/programs/saved") return false;
    const m = (c[2] as { method?: string } | undefined)?.method;
    return method ? m === method : true;
  });
}

function wireDefault() {
  mockApiFetch.mockImplementation((path: string, _schema, init) => {
    if (path === "/api/programs/saved") {
      if ((init as { method?: string } | undefined)?.method === "DELETE") {
        return Promise.resolve({ success: true, message: "removed" });
      }
      return Promise.resolve({
        savedPrograms: [
          { program_id: "p1", name: "Foundation", description: "d" },
          { program_id: "p2", name: "Hypertrophy", description: "d2" },
        ],
      });
    }
    return Promise.resolve({});
  });
}

describe("SavedProgramsRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    wireDefault();
  });

  it("GETs /api/programs/saved with baseUrl + token and renders the list", async () => {
    const { getByTestId } = render(<SavedProgramsRoute />);

    await waitFor(() => {
      expect(savedCalls().length).toBeGreaterThan(0);
    });
    const call = savedCalls()[0]!;
    const opts = call[2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    await waitFor(() => {
      expect(getByTestId("saved-programs-item-p1")).toBeTruthy();
      expect(getByTestId("saved-programs-item-p2")).toBeTruthy();
    });
  });

  it("optimistically removes a row and DELETEs on unsave", async () => {
    const { getByTestId, queryByTestId } = render(<SavedProgramsRoute />);

    await waitFor(() => {
      expect(getByTestId("saved-programs-unsave-p1")).toBeTruthy();
    });

    fireEvent.press(getByTestId("saved-programs-unsave-p1"));

    // Optimistic: the row disappears immediately (before the await settles).
    expect(queryByTestId("saved-programs-item-p1")).toBeNull();
    expect(getByTestId("saved-programs-item-p2")).toBeTruthy();

    await waitFor(() => {
      expect(savedCalls("DELETE").length).toBeGreaterThan(0);
    });
    const del = savedCalls("DELETE")[0]!;
    expect(del[2]).toEqual(
      expect.objectContaining({
        method: "DELETE",
        body: { programId: "p1" },
        baseUrl: WEBAPP_BASE_URL,
      }),
    );
  });

  it("rolls the row back and refetches when the unsave fails", async () => {
    let deleteCalls = 0;
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      if (path === "/api/programs/saved") {
        if ((init as { method?: string } | undefined)?.method === "DELETE") {
          deleteCalls += 1;
          return Promise.reject(new Error("server down"));
        }
        return Promise.resolve({
          savedPrograms: [
            { program_id: "p1", name: "Foundation", description: "d" },
          ],
        });
      }
      return Promise.resolve({});
    });

    const { getByTestId, queryByTestId } = render(<SavedProgramsRoute />);
    await waitFor(() => {
      expect(getByTestId("saved-programs-unsave-p1")).toBeTruthy();
    });

    fireEvent.press(getByTestId("saved-programs-unsave-p1"));

    // After the failed DELETE, the row is restored.
    await waitFor(() => {
      expect(deleteCalls).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(queryByTestId("saved-programs-item-p1")).toBeTruthy();
    });
  });
});
