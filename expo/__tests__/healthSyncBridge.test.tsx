/* eslint-disable import/first */
/**
 * The launch bridge: reads the switches once, imports once, renders nothing.
 *
 * The member this exists for weighs themselves on a scale that talks to Health
 * Connect and never types a number into Become — so there is no screen the
 * import can hang off, and a token arriving late (a cold start restoring a
 * session) must not turn into two imports.
 */
const mockToken = { current: null as string | null };
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: mockToken.current,
    loading: false,
    isAuthed: !!mockToken.current,
    setToken: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  }),
}));

import { render, waitFor } from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";
import { HealthSyncBridge } from "@/components/health/HealthSyncBridge";

beforeEach(() => {
  mockToken.current = null;
});

describe("HealthSyncBridge", () => {
  it("renders nothing", () => {
    mockToken.current = "jwt";
    const { toJSON } = render(<HealthSyncBridge run={async () => null} />);
    expect(toJSON()).toBeNull();
  });

  it("does not run without a session", () => {
    const run = jest.fn(async () => null);
    render(<HealthSyncBridge run={run} />);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs once, with the session token", async () => {
    mockToken.current = "jwt";
    const run = jest.fn(async () => null);
    const { rerender } = render(<HealthSyncBridge run={run} />);
    await waitFor(() => {
      expect(run).toHaveBeenCalledWith("jwt");
    });
    rerender(<HealthSyncBridge run={run} />);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a rejected import never reaches the tree", async () => {
    mockToken.current = "jwt";
    const run = jest.fn(async () => {
      throw new Error("Health Connect exploded");
    });
    expect(() => render(<HealthSyncBridge run={run} />)).not.toThrow();
    await waitFor(() => {
      expect(run).toHaveBeenCalled();
    });
  });

  // NP-185: a weigh-in entered in Apple Health / Health Connect while Become
  // was backgrounded should not wait for the next cold start.
  it("re-runs every time the app returns to the foreground, not just at launch", async () => {
    mockToken.current = "jwt";
    const run = jest.fn(async () => null);
    const listenerBox: { current: ((status: AppStateStatus) => void) | null } =
      { current: null };
    const subscribeToAppState = jest.fn(
      (l: (status: AppStateStatus) => void) => {
        listenerBox.current = l;
        return () => {};
      },
    );
    render(
      <HealthSyncBridge run={run} subscribeToAppState={subscribeToAppState} />,
    );
    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });

    listenerBox.current?.("active");
    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(2);
    });

    // A background transition is not a foreground return — no extra call.
    listenerBox.current?.("background");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("the foreground listener does nothing without a session", () => {
    const subscribeToAppState = jest.fn(() => () => {});
    render(
      <HealthSyncBridge
        run={async () => null}
        subscribeToAppState={subscribeToAppState}
      />,
    );
    expect(subscribeToAppState).not.toHaveBeenCalled();
  });
});
