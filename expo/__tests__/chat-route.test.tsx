/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

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
import ChatIndexRoute from "../app/(tabs)/chat/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]) === path);
}

function mockInterval() {
  let fn: (() => void) | null = null;
  const setI = ((f: () => void) => {
    fn = f;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const clearI = (() => {
    fn = null;
  }) as unknown as typeof clearInterval;
  return { setI, clearI, tick: () => fn?.() };
}

describe("ChatIndexRoute", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
  });

  it("GETs conversations with baseUrl + token and renders the list", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/chat/conversations") {
        return Promise.resolve({
          conversations: [{ _id: "c1", name: "Coach Jon", unreadCount: 0 }],
        });
      }
      if (path === "/api/chat/unread") {
        return Promise.resolve({ unreadCount: 0 });
      }
      return Promise.resolve({});
    });

    const { getByTestId } = render(<ChatIndexRoute />);
    await waitFor(() => {
      expect(callsTo("/api/chat/conversations").length).toBeGreaterThan(0);
    });
    const opts = callsTo("/api/chat/conversations")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    await waitFor(() => {
      expect(getByTestId("conversation-list-item-c1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("conversation-list-item-c1"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/chat/c1");
  });

  it("renders the unread badge and updates it from the poll", async () => {
    let unreadGets = 0;
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/chat/conversations") {
        return Promise.resolve({ conversations: [] });
      }
      if (path === "/api/chat/unread") {
        unreadGets += 1;
        return Promise.resolve({ unreadCount: unreadGets === 1 ? 2 : 5 });
      }
      return Promise.resolve({});
    });

    const { setI, clearI, tick } = mockInterval();
    const { getByTestId } = render(
      <ChatIndexRoute setIntervalImpl={setI} clearIntervalImpl={clearI} />,
    );

    await waitFor(() => {
      expect(
        getByTestId("chat-unread-badge").props.accessibilityLabel,
      ).toBe("2 unread");
    });

    // Fire the poll → unread refetches and the badge updates.
    await act(async () => {
      tick();
    });
    await waitFor(() => {
      expect(
        getByTestId("chat-unread-badge").props.accessibilityLabel,
      ).toBe("5 unread");
    });
  });
});
