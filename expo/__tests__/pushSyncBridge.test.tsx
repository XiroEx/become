/* eslint-disable import/first */
import { render, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "jwt-1",
    user: null,
    loading: false,
    isAuthed: true,
  }),
}));

import { PushSyncBridge } from "../components/push/PushSyncBridge";
/* eslint-enable import/first */

describe("<PushSyncBridge>", () => {
  it("checks on mount and on every foreground return", async () => {
    const check = jest.fn(async () => ({ kind: "registered" }));
    const setupChannels = jest.fn(async () => ({ kind: "created" }));
    const holder: { listener: ((status: string) => void) | null } = {
      listener: null,
    };
    render(
      <PushSyncBridge
        check={check}
        setupChannels={setupChannels}
        subscribeToAppState={(fn) => {
          holder.listener = fn as (status: string) => void;
          return () => {
            holder.listener = null;
          };
        }}
      />,
    );
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(setupChannels).toHaveBeenCalledTimes(1);
    // Tokens rotate: every foreground return re-registers.
    holder.listener?.("active");
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    // Background transitions do not register.
    holder.listener?.("background");
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("a failing check never takes the app with it", async () => {
    const check = jest.fn(async () => {
      throw new Error("offline");
    });
    render(
      <PushSyncBridge
        check={check}
        setupChannels={async () => ({ kind: "skipped" })}
        subscribeToAppState={() => () => {}}
      />,
    );
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
  });
});
