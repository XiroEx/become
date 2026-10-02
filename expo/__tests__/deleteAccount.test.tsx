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
  const idleStatus = jest.fn(async () => ({
    ok: true as const,
    status: {
      deletion: {
        pending: false,
        requestedAt: null,
        restorableUntil: null,
        daysLeft: 0,
        restoreWindowDays: 7,
      },
    },
  }));

  beforeEach(() => {
    idleStatus.mockClear();
  });

  it("does not delete anything until the confirmation is pressed", async () => {
    const requestImpl = jest.fn(async () => ({ ok: true }));
    const clearToken = jest.fn(async () => {});
    const onDeleted = jest.fn();

    const { getByTestId } = render(
      <DangerZone
        token="jwt"
        requestImpl={requestImpl}
        statusImpl={idleStatus}
        clearToken={clearToken}
        onDeleted={onDeleted}
        source="ios"
      />,
    );

    await waitFor(() => expect(idleStatus).toHaveBeenCalled());

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
        statusImpl={idleStatus}
        clearToken={clearToken}
        onDeleted={onDeleted}
        source="android"
      />,
    );

    await waitFor(() => expect(idleStatus).toHaveBeenCalled());

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
        statusImpl={idleStatus}
        clearToken={clearToken}
        onDeleted={onDeleted}
      />,
    );

    await waitFor(() => expect(idleStatus).toHaveBeenCalled());

    fireEvent.press(getByTestId("delete-account"));
    fireEvent.press(getByTestId("delete-account-confirm"));

    await waitFor(() => expect(getByTestId("delete-account-error")).toBeTruthy());
    expect(clearToken).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("(e015c992) shows the scheduled date and keeps the account when a deletion is pending", async () => {
    const pendingStatus = jest.fn(async () => ({
      ok: true as const,
      status: {
        deletion: {
          pending: true,
          requestedAt: "2026-09-30T00:00:00.000Z",
          restorableUntil: "2026-10-07T00:00:00.000Z",
          daysLeft: 5,
          restoreWindowDays: 7,
        },
      },
    }));
    const cancelImpl = jest.fn(async () => ({ ok: true }));
    const onKept = jest.fn();

    const { getByTestId, queryByTestId } = render(
      <DangerZone
        token="jwt"
        cancelImpl={cancelImpl}
        statusImpl={pendingStatus}
        onKept={onKept}
        source="ios"
      />,
    );

    // The scheduled date renders instead of the delete button.
    await waitFor(() => expect(getByTestId("deletion-pending")).toBeTruthy());
    expect(queryByTestId("delete-account")).toBeNull();
    expect(getByTestId("keep-my-account")).toBeTruthy();

    // Keeping the account cancels server-side, then re-reads the status so
    // the delete button comes back instead of a stale pending date.
    fireEvent.press(getByTestId("keep-my-account"));

    await waitFor(() => expect(cancelImpl).toHaveBeenCalledWith({ jwt: "jwt" }));
    expect(cancelImpl).toHaveBeenCalledTimes(1);

    // The cancel re-reads the (still pending, in this stub) status and then
    // shows the notifications-off notice pointing at the NP-068 switch —
    // cancelling never turns notifications back on (e015c993).
    await waitFor(() => expect(getByTestId("keep-account-notice")).toBeTruthy());
    expect(onKept).toHaveBeenCalledTimes(1);
  });

  it("(e015c993) keeping the account points at the notification switch, which stays off", async () => {
    const pendingStatus = jest.fn(async () => ({
      ok: true as const,
      status: {
        deletion: {
          pending: true,
          requestedAt: "2026-09-30T00:00:00.000Z",
          restorableUntil: "2026-10-07T00:00:00.000Z",
          daysLeft: 5,
          restoreWindowDays: 7,
        },
      },
    }));
    const cancelImpl = jest.fn(async () => ({ ok: true }));

    const { getByTestId, getByText } = render(
      <DangerZone token="jwt" cancelImpl={cancelImpl} statusImpl={pendingStatus} source="ios" />,
    );

    await waitFor(() => expect(getByTestId("deletion-pending")).toBeTruthy());
    fireEvent.press(getByTestId("keep-my-account"));

    // The notice names the switch explicitly — the member is not left
    // believing notifications came back with the account.
    await waitFor(() => expect(getByTestId("keep-account-notice")).toBeTruthy());
    expect(getByText(/notification switch above/, { exact: false })).toBeTruthy();
    // And the cancel itself never touches the preferences route: no PATCH, no
    // re-enable — the latch stays off until the member flips the switch.
    expect(cancelImpl).toHaveBeenCalledTimes(1);
  });

  it("(e015c992) refreshes the status after a cancel so the delete button returns", async () => {
    let pending = true;
    const statusImpl = jest.fn(async () => ({
      ok: true as const,
      status: {
        deletion: pending
          ? {
              pending: true,
              requestedAt: "2026-09-30T00:00:00.000Z",
              restorableUntil: "2026-10-07T00:00:00.000Z",
              daysLeft: 5,
              restoreWindowDays: 7,
            }
          : {
              pending: false,
              requestedAt: null,
              restorableUntil: null,
              daysLeft: 0,
              restoreWindowDays: 7,
            },
      },
    }));
    const cancelImpl = jest.fn(async () => {
      pending = false;
      return { ok: true };
    });

    const { getByTestId, queryByTestId } = render(
      <DangerZone token="jwt" cancelImpl={cancelImpl} statusImpl={statusImpl} source="ios" />,
    );

    await waitFor(() => expect(getByTestId("deletion-pending")).toBeTruthy());

    fireEvent.press(getByTestId("keep-my-account"));

    // After the cancel the section re-reads and shows the delete button again.
    await waitFor(() => expect(getByTestId("delete-account")).toBeTruthy());
    expect(queryByTestId("deletion-pending")).toBeNull();
    expect(statusImpl.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("says so when keeping the account fails, and keeps the pending state", async () => {
    const pendingStatus = jest.fn(async () => ({
      ok: true as const,
      status: {
        deletion: {
          pending: true,
          requestedAt: "2026-09-30T00:00:00.000Z",
          restorableUntil: "2026-10-07T00:00:00.000Z",
          daysLeft: 5,
          restoreWindowDays: 7,
        },
      },
    }));
    const cancelImpl = jest.fn(async () => ({ ok: false, status: 500 }));

    const { getByTestId } = render(
      <DangerZone token="jwt" cancelImpl={cancelImpl} statusImpl={pendingStatus} source="ios" />,
    );

    await waitFor(() => expect(getByTestId("deletion-pending")).toBeTruthy());

    fireEvent.press(getByTestId("keep-my-account"));

    await waitFor(() => expect(getByTestId("delete-account-error")).toBeTruthy());
    // The pending date stays: nothing was cancelled.
    expect(getByTestId("deletion-pending")).toBeTruthy();
  });

  it("leaves the delete button drawn when the status read fails", async () => {
    const statusImpl = jest.fn(async () => ({ ok: false as const }));

    const { getByTestId, queryByTestId } = render(
      <DangerZone token="jwt" statusImpl={statusImpl} source="ios" />,
    );

    await waitFor(() => expect(statusImpl).toHaveBeenCalled());
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
  function statusResponse(body: unknown, status = 200): typeof fetch {
    return jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  }

  it("reads GET /api/me/account with the session and returns the pending state", async () => {
    const fetchImpl = statusResponse({
      deletion: {
        pending: true,
        requestedAt: "2026-09-30T00:00:00.000Z",
        restorableUntil: "2026-10-07T00:00:00.000Z",
        daysLeft: 5,
        restoreWindowDays: 7,
      },
    });

    const result = await getAccountDeletionStatus({
      jwt: "jwt-123",
      fetchImpl,
      baseUrl: "https://example.test",
    });

    expect(result).toEqual({
      ok: true,
      status: {
        deletion: {
          pending: true,
          requestedAt: "2026-09-30T00:00:00.000Z",
          restorableUntil: "2026-10-07T00:00:00.000Z",
          daysLeft: 5,
          restoreWindowDays: 7,
        },
      },
    });

    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("https://example.test/api/me/account");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer jwt-123");
  });

  it("answers not-pending when nothing is scheduled", async () => {
    const fetchImpl = statusResponse({
      deletion: { pending: false, requestedAt: null, restorableUntil: null, daysLeft: 0 },
    });
    const result = await getAccountDeletionStatus({ jwt: "jwt", fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.status.deletion.pending).toBe(false);
  });

  it("reports a refusal and survives a network failure without throwing", async () => {
    const refused = statusResponse({}, 401);
    await expect(getAccountDeletionStatus({ jwt: "stale", fetchImpl: refused })).resolves.toEqual({
      ok: false,
      status: 401,
    });
    const offline = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(getAccountDeletionStatus({ jwt: "jwt", fetchImpl: offline })).resolves.toEqual({
      ok: false,
    });
  });
});

describe("cancelAccountDeletion", () => {
  it("posts { cancel: true } with the session, like the web danger zone", async () => {
    const fetchImpl = jest.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const result = await cancelAccountDeletion({
      jwt: "jwt-123",
      fetchImpl,
      baseUrl: "https://example.test",
    });

    expect(result).toEqual({ ok: true, status: 200 });
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("https://example.test/api/me/account");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ cancel: true });
    expect(init.headers.Authorization).toBe("Bearer jwt-123");
  });

  it("reports a refusal and survives a network failure without throwing", async () => {
    const refused = jest.fn(async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await expect(cancelAccountDeletion({ jwt: "stale", fetchImpl: refused })).resolves.toEqual({
      ok: false,
      status: 401,
    });
    const offline = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(cancelAccountDeletion({ jwt: "jwt", fetchImpl: offline })).resolves.toEqual({
      ok: false,
    });
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
