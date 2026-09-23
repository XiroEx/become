import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { DangerZone } from "@/components/settings/DangerZone";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";

/**
 * TWO TAPS. That is the acceptance criterion and it is what this drives:
 * press "Delete account", press "Delete my account", and the deletion has been
 * requested. Nothing in between, nothing to type, no email to send.
 *
 * Apple checks 5.1.1(v) by hand, so the thing that breaks it is never a
 * function returning the wrong value — it is a third step appearing in the
 * middle, or the section quietly moving behind a tab. Both show up here.
 */

const DELETION = {
  requestedAt: "2026-09-20T10:00:00.000Z",
  scheduledPurgeAt: "2026-09-27T10:00:00.000Z",
  daysRemaining: 7,
};

function makeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
  return { fetch: fn, calls };
}

describe("DangerZone (native)", () => {
  it("takes exactly two taps to request deletion", async () => {
    const spy = makeFetch({ deletion: DELETION, pushSubscriptionsDropped: 2 });
    const store = createMemoryTokenStore("jwt");
    const { getByTestId, queryByTestId } = render(
      <DangerZone jwt="jwt" fetchImpl={spy.fetch} tokenStore={store} source="ios" />,
    );

    // Nothing has been asked for yet.
    expect(spy.calls).toHaveLength(0);

    // Tap one: the confirmation.
    fireEvent.press(getByTestId("delete-account"));
    expect(queryByTestId("delete-account-confirm")).not.toBeNull();
    expect(spy.calls).toHaveLength(0);

    // Tap two: the deletion.
    fireEvent.press(getByTestId("delete-account-confirm"));
    await waitFor(() => expect(spy.calls).toHaveLength(1));
    expect(spy.calls[0]!.init.method).toBe("DELETE");
  });

  it("offers a way out of the dialog that asks for nothing", () => {
    const spy = makeFetch({ deletion: DELETION });
    const { getByTestId, queryByTestId } = render(
      <DangerZone jwt="jwt" fetchImpl={spy.fetch} tokenStore={createMemoryTokenStore("jwt")} />,
    );
    fireEvent.press(getByTestId("delete-account"));
    fireEvent.press(getByTestId("delete-account-cancel"));
    expect(queryByTestId("delete-account-confirm")).toBeNull();
    expect(spy.calls).toHaveLength(0);
  });

  it("signs the device out and says when the data goes", async () => {
    const spy = makeFetch({ deletion: DELETION, pushSubscriptionsDropped: 3 });
    const store = createMemoryTokenStore("jwt");
    const onDeleted = jest.fn();
    const { getByTestId } = render(
      <DangerZone
        jwt="jwt"
        fetchImpl={spy.fetch}
        tokenStore={store}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.press(getByTestId("delete-account"));
    fireEvent.press(getByTestId("delete-account-confirm"));

    await waitFor(() => expect(getByTestId("deletion-scheduled")).toBeTruthy());
    // The JWT is gone from the store — that IS the sign-out.
    expect(await store.get()).toBeNull();
    expect(onDeleted).toHaveBeenCalled();
  });

  it("says so, and keeps the session, when the request fails", async () => {
    const spy = makeFetch({ error: "nope" }, 500);
    const store = createMemoryTokenStore("jwt");
    const { getByTestId, queryByTestId } = render(
      <DangerZone jwt="jwt" fetchImpl={spy.fetch} tokenStore={store} />,
    );

    fireEvent.press(getByTestId("delete-account"));
    fireEvent.press(getByTestId("delete-account-confirm"));

    await waitFor(() => expect(getByTestId("danger-zone-error")).toBeTruthy());
    expect(queryByTestId("deletion-scheduled")).toBeNull();
    expect(await store.get()).toBe("jwt");
  });

  it("is inert with no session rather than absent", () => {
    // Absent would be worse: a reviewer who hits a rendering edge would report
    // "there is no delete account option" and the build would be rejected.
    const { getByTestId } = render(<DangerZone jwt={null} />);
    expect(getByTestId("delete-account")).toBeTruthy();
  });
});
