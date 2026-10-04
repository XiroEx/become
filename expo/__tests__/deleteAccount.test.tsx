/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

// The danger zone clears the session out of SecureStore on success. Swap the
// session store (`become.session`) for an in-memory one so jest never touches
// the native module.
jest.mock("@/lib/auth/secureStoreToken", () => {
  const actual = jest.requireActual("@/lib/auth/secureStoreToken");
  let value: string | null = "jwt-in-the-keychain";
  return {
    ...actual,
    sessionStore: {
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
  cancelAccountDeletion,
  getAccountDeletionStatus,
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
  const idleStatus = async () => ({ ok: true, deletion: { pending: false } });

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
        statusImpl={idleStatus}
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
    const clearBadge = jest.fn(async () => {});
    const onDeleted = jest.fn();

    const { getByTestId } = render(
      <DangerZone
        token="jwt"
        requestImpl={requestImpl}
        clearToken={clearToken}
        clearBadge={clearBadge}
        onDeleted={onDeleted}
        statusImpl={idleStatus}
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
    // The icon badge is one member's unfinished day (NP-067): it must not
    // outlive the account either.
    expect(clearBadge).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when the request fails, and says so", async () => {
    const requestImpl = jest.fn(async () => ({ ok: false, status: 500 }));
    const clearToken = jest.fn(async () => {});
    const clearBadge = jest.fn(async () => {});
    const onDeleted = jest.fn();

    const { getByTestId } = render(
      <DangerZone
        token="jwt"
        requestImpl={requestImpl}
        clearToken={clearToken}
        clearBadge={clearBadge}
        onDeleted={onDeleted}
        statusImpl={async () => ({ ok: true, deletion: { pending: false } })}
      />,
    );

    fireEvent.press(getByTestId("delete-account"));
    fireEvent.press(getByTestId("delete-account-confirm"));

    await waitFor(() => expect(getByTestId("delete-account-error")).toBeTruthy());
    expect(clearToken).not.toHaveBeenCalled();
    // A request that never landed changes nothing — the badge stays as it was.
    expect(clearBadge).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("(e015c992) a pending deletion shows the scheduled date and Keep my account instead of Delete account", async () => {
    const statusImpl = jest.fn(async () => ({
      ok: true,
      deletion: {
        pending: true,
        requestedAt: "2026-09-30T00:00:00.000Z",
        restorableUntil: "2026-10-07T00:00:00.000Z",
        daysLeft: 5,
        restoreWindowDays: 7,
      },
    }));
    const cancelImpl = jest.fn(async () => ({ ok: true, status: 200 }));
    const onKept = jest.fn();

    const { getByTestId, queryByTestId } = render(
      <DangerZone
        token="jwt"
        cancelImpl={cancelImpl}
        statusImpl={statusImpl}
        onKept={onKept}
        source="ios"
      />,
    );

    // The status read lands: the request surface is replaced by the pending
    // date and the keep button.
    await waitFor(() => expect(getByTestId("deletion-pending")).toBeTruthy());
    expect(queryByTestId("delete-account")).toBeNull();
    expect(getByTestId("keep-my-account")).toBeTruthy();

    fireEvent.press(getByTestId("keep-my-account"));

    // Cancel posts ONLY { cancel: true } — it must not touch notification
    // prefs itself; the settings screen refetches the switch separately.
    await waitFor(() => expect(cancelImpl).toHaveBeenCalledTimes(1));
    expect(cancelImpl).toHaveBeenCalledWith({ jwt: "jwt" });
    expect(onKept).toHaveBeenCalledTimes(1);

    // The status is re-read after the cancel, so the request surface returns.
    await waitFor(() => expect(statusImpl).toHaveBeenCalledTimes(2));
  });

  it("(e015c993) after keeping the account the notice points at the notification switch, which stays off", async () => {
    let pending = true;
    const statusImpl = jest.fn(async () => ({
      ok: true,
      deletion: pending
        ? {
            pending: true,
            requestedAt: "2026-09-30T00:00:00.000Z",
            restorableUntil: "2026-10-07T00:00:00.000Z",
            daysLeft: 5,
            restoreWindowDays: 7,
          }
        : { pending: false, requestedAt: null, restorableUntil: null, daysLeft: 0 },
    }));
    const cancelImpl = jest.fn(async () => {
      pending = false;
      return { ok: true, status: 200 };
    });

    const { getByTestId } = render(
      <DangerZone token="jwt" cancelImpl={cancelImpl} statusImpl={statusImpl} source="ios" />,
    );

    await waitFor(() => expect(getByTestId("keep-my-account")).toBeTruthy());
    fireEvent.press(getByTestId("keep-my-account"));

    // The notice names the NP-068 switch the member must flip themselves.
    await waitFor(() => expect(getByTestId("keep-account-notice")).toBeTruthy());
    expect(getByTestId("keep-account-notice").props.children).toBeDefined();

    // And the request surface is back — the account was kept, not deleted.
    await waitFor(() => expect(getByTestId("delete-account")).toBeTruthy());
  });

  it("a failed status read leaves the delete surface drawn", async () => {
    const statusImpl = jest.fn(async () => ({ ok: false, deletion: null }));

    const { getByTestId, queryByTestId } = render(
      <DangerZone token="jwt" statusImpl={statusImpl} source="ios" />,
    );

    await waitFor(() => expect(statusImpl).toHaveBeenCalledTimes(1));
    // The server stays the gate: a blipped read must never hide the surface.
    expect(getByTestId("delete-account")).toBeTruthy();
    expect(queryByTestId("deletion-pending")).toBeNull();
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

describe("getAccountDeletionStatus", () => {
  it("reads GET /api/me/account with the session and returns the pending date", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(
        JSON.stringify({
          deletion: {
            pending: true,
            requestedAt: "2026-09-30T00:00:00.000Z",
            restorableUntil: "2026-10-07T00:00:00.000Z",
            daysLeft: 5,
            restoreWindowDays: 7,
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const result = await getAccountDeletionStatus({
      jwt: "jwt-123",
      fetchImpl,
      baseUrl: "https://example.test",
    });

    expect(result.ok).toBe(true);
    expect(result.deletion?.pending).toBe(true);
    expect(result.deletion?.restorableUntil).toBe("2026-10-07T00:00:00.000Z");

    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("https://example.test/api/me/account");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer jwt-123");
  });

  it("reports a failed read instead of hiding the surface", async () => {
    const fetchImpl = jest.fn(async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const result = await getAccountDeletionStatus({ jwt: "stale", fetchImpl });
    expect(result).toEqual({ ok: false, status: 401, deletion: null });
  });
});

describe("cancelAccountDeletion", () => {
  it("posts only { cancel: true } — it never touches notification prefs", async () => {
    const fetchImpl = jest.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const result = await cancelAccountDeletion({
      jwt: "jwt-123",
      fetchImpl,
      baseUrl: "https://example.test",
    });

    expect(result.ok).toBe(true);
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("https://example.test/api/me/account");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ cancel: true });
    expect(init.headers.Authorization).toBe("Bearer jwt-123");
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
