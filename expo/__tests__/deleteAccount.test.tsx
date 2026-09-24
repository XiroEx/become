/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

// The danger zone clears the session out of SecureStore on success. Swap the
// real store for an in-memory one so jest never touches the native module.
jest.mock("@/lib/auth/secureStoreToken", () => {
  const actual = jest.requireActual("@/lib/auth/secureStoreToken");
  let value: string | null = "jwt-in-the-keychain";
  return {
    ...actual,
    secureTokenStore: {
      async get() {
        return value;
      },
      async set(v: string) {
        value = v;
      },
      async clear() {
        value = null;
      },
    },
  };
});

import { DangerZone } from "@/components/settings/DangerZone";
import {
  DELETE_CONFIRMATION,
  parseRestoreDeepLink,
  requestAccountDeletion,
  restoreAccount,
} from "@/lib/account/deleteAccount";

/**
 * Account deletion in the store builds — the flow Apple checks by hand
 * (Guideline 5.1.1(v)) and the restore link that has to work whether it opens
 * here or in a browser.
 */
describe("DangerZone", () => {
  it("does not delete anything until the confirmation is pressed", async () => {
    const requestImpl = jest.fn(async () => ({ ok: true }));
    const clearToken = jest.fn(async () => {});
    const onDeleted = jest.fn();

    const { getByTestId } = render(
      <DangerZone
        token="jwt"
        requestImpl={requestImpl}
        clearToken={clearToken}
        onDeleted={onDeleted}
        source="ios"
      />,
    );

    // Tap one raises the confirmation and calls nothing.
    fireEvent.press(getByTestId("delete-account"));
    expect(requestImpl).not.toHaveBeenCalled();
    expect(getByTestId("delete-account-confirm")).toBeTruthy();

    // Backing out leaves the account alone.
    fireEvent.press(getByTestId("delete-account-cancel"));
    expect(requestImpl).not.toHaveBeenCalled();
    expect(clearToken).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("requests deletion, clears the session, and leaves the screen", async () => {
    const requestImpl = jest.fn(async () => ({ ok: true }));
    const clearToken = jest.fn(async () => {});
    const onDeleted = jest.fn();

    const { getByTestId } = render(
      <DangerZone
        token="jwt"
        requestImpl={requestImpl}
        clearToken={clearToken}
        onDeleted={onDeleted}
        source="android"
      />,
    );

    fireEvent.press(getByTestId("delete-account"));
    fireEvent.press(getByTestId("delete-account-confirm"));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(requestImpl).toHaveBeenCalledWith({ jwt: "jwt", source: "android" });
    // The session goes with the request: the server has already dropped this
    // installation's push token, so a stored JWT would show a signed-in app
    // for an account on its way out.
    expect(clearToken).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when the request fails, and says so", async () => {
    const requestImpl = jest.fn(async () => ({ ok: false, status: 500 }));
    const clearToken = jest.fn(async () => {});
    const onDeleted = jest.fn();

    const { getByTestId } = render(
      <DangerZone
        token="jwt"
        requestImpl={requestImpl}
        clearToken={clearToken}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.press(getByTestId("delete-account"));
    fireEvent.press(getByTestId("delete-account-confirm"));

    await waitFor(() => expect(getByTestId("delete-account-error")).toBeTruthy());
    expect(clearToken).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("requestAccountDeletion", () => {
  it("sends the confirmation the server requires, with the session", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ deletion: { restorableUntil: "2026-10-01T00:00:00.000Z" } }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;

    const result = await requestAccountDeletion({
      jwt: "jwt-123",
      source: "ios",
      fetchImpl,
      baseUrl: "https://example.test",
    });

    expect(result.ok).toBe(true);
    expect(result.restorableUntil).toBe("2026-10-01T00:00:00.000Z");

    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("https://example.test/api/me/account");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({
      confirm: DELETE_CONFIRMATION,
      source: "ios",
    });
    expect(init.headers.Authorization).toBe("Bearer jwt-123");
  });

  it("reports a refusal rather than pretending the account is gone", async () => {
    const fetchImpl = jest.fn(async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const result = await requestAccountDeletion({ jwt: "stale", fetchImpl });
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("survives a network failure without throwing at the UI", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(requestAccountDeletion({ jwt: "jwt", fetchImpl })).resolves.toEqual({ ok: false });
  });
});

describe("the restore link", () => {
  it("is parsed from a universal link and from the custom scheme", () => {
    expect(
      parseRestoreDeepLink("https://become.redbtn.io/account/restore?u=abc&t=def"),
    ).toEqual({ userId: "abc", token: "def" });
    expect(parseRestoreDeepLink("become://account/restore?u=abc&t=def")).toEqual({
      userId: "abc",
      token: "def",
    });
  });

  it("refuses another host, another path, and a link with no credential", () => {
    // A link from somewhere else must never be turned into a request against
    // our API.
    expect(parseRestoreDeepLink("https://evil.example/account/restore?u=a&t=b")).toBeNull();
    expect(parseRestoreDeepLink("https://become.redbtn.io/verify?token=x&mode=login")).toBeNull();
    expect(parseRestoreDeepLink("https://become.redbtn.io/account/restore?u=a")).toBeNull();
    expect(parseRestoreDeepLink("not a url")).toBeNull();
    expect(parseRestoreDeepLink("")).toBeNull();
  });

  it("posts the same body the web page posts, with no session", async () => {
    const fetchImpl = jest.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const result = await restoreAccount({
      userId: "abc",
      token: "def",
      fetchImpl,
      baseUrl: "https://example.test",
    });

    expect(result.ok).toBe(true);
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("https://example.test/api/me/account/restore");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ u: "abc", t: "def" });
    expect(init.headers.Authorization).toBeUndefined();
  });
});
