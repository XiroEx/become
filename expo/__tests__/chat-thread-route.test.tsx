/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
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
import ChatThreadRoute from "../app/(tabs)/chat/[id]";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const PATH = "/api/chat/conversations/c1/messages";

function callsByMethod(method: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]) === PATH &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === method,
  );
}

describe("ChatThreadRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockParams = { id: "c1" };
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === PATH && (!method || method === "GET")) {
        return Promise.resolve({
          messages: [
            { _id: "m1", senderId: "coach1", text: "Welcome", createdAt: "2026-06-01T10:00:00Z" },
          ],
        });
      }
      if (path === PATH && method === "POST") {
        return Promise.resolve({
          message: { _id: "m2", senderId: "u1", text: "Hello coach", createdAt: "2026-06-01T11:00:00Z" },
        });
      }
      return Promise.resolve({});
    });
  });

  it("loads the message history with baseUrl + token", async () => {
    const { getByTestId } = render(<ChatThreadRoute />);
    await waitFor(() => {
      expect(callsByMethod("GET").length).toBeGreaterThan(0);
    });
    const opts = callsByMethod("GET")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    await waitFor(() => {
      expect(getByTestId("thread-view-message-m1-text").props.children).toBe(
        "Welcome",
      );
    });
  });

  it("sends a message: POSTs {text}, appends optimistically, parses wrapped response", async () => {
    const { getByTestId, getByText } = render(<ChatThreadRoute />);
    await waitFor(() => {
      expect(getByTestId("thread-view-message-m1")).toBeTruthy();
    });

    fireEvent.changeText(getByTestId("composer-input"), "Hello coach");
    await act(async () => {
      fireEvent.press(getByTestId("composer-send"));
    });

    // POST fired with the text body.
    await waitFor(() => {
      expect(callsByMethod("POST").length).toBeGreaterThan(0);
    });
    const post = callsByMethod("POST")[0]!;
    expect(post[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { text: "Hello coach" },
        baseUrl: WEBAPP_BASE_URL,
      }),
    );

    // The optimistic message was appended and then replaced by the real one
    // parsed out of the wrapped { message } response (id m2, sender user).
    await waitFor(() => {
      expect(getByTestId("thread-view-message-m2-text").props.children).toBe(
        "Hello coach",
      );
    });
    expect(getByText("Hello coach")).toBeTruthy();
  });
});
