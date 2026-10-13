/* eslint-disable import/first */
/**
 * THE BANNER (NP-190).
 *
 * Two of the card's three acceptances live here:
 *
 *   • "The connectivity banner appears within a second of losing signal and
 *     clears when it returns" — NetInfo PUSHES its state and nothing between it
 *     and the banner debounces, batches or polls, so the assertions below do
 *     not advance a clock: the banner is on screen in the same tick the event
 *     is delivered, which is as far inside a second as it gets.
 *   • "Signing out clears the queue" — every way a session can end arrives here
 *     as `status: "signed-out"`.
 */
const mockAuth: { status: string } = { status: "signed-in" };
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    ...mockAuth,
    user: null,
    token: "test-jwt",
    loading: false,
    isAuthed: mockAuth.status === "signed-in",
    signedOutReason: null,
    setToken: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

import { act, render } from "@testing-library/react-native";
import { ConnectivityBanner } from "@/components/offline/ConnectivityBanner";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import type { ConnectivitySource } from "@/lib/offline/connectivity";
import type { OfflineWrites } from "@/lib/offline/writes";
/* eslint-enable import/first */

function fakeConnectivity(initial: boolean) {
  let online = initial;
  const listeners = new Set<(online: boolean) => void>();
  const source: ConnectivitySource = {
    async isConnected(): Promise<boolean> {
      return online;
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    emit(next: boolean): void {
      online = next;
      listeners.forEach((l) => l(next));
    },
  };
}

function fakeWrites(): OfflineWrites & {
  clear: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
} {
  return {
    logWeight: jest.fn(async () => "sent" as const),
    logMood: jest.fn(async () => "sent" as const),
    start: jest.fn(async () => {}),
    stop: jest.fn(),
    clear: jest.fn(async () => {}),
    pending: jest.fn(() => 0),
    flush: jest.fn(async () => {}),
    queue: {} as OfflineWrites["queue"],
  } as unknown as OfflineWrites & {
    clear: jest.Mock;
    start: jest.Mock;
    stop: jest.Mock;
  };
}

describe("OfflineBanner", () => {
  it("renders nothing while online", () => {
    const { queryByTestId } = render(<OfflineBanner online={true} />);
    expect(queryByTestId("offline-banner")).toBeNull();
  });

  it("says the connection is gone AND that nothing was lost", () => {
    const { getByTestId } = render(<OfflineBanner online={false} />);
    expect(getByTestId("offline-banner-title").props.children).toContain(
      "No connection",
    );
    expect(String(getByTestId("offline-banner-detail").props.children)).toContain(
      "sync",
    );
  });

  it("clears the status bar with the safe-area inset it is given", () => {
    const { getByTestId } = render(
      <OfflineBanner online={false} topInset={47} />,
    );
    const style = getByTestId("offline-banner").props.style as {
      paddingTop?: number;
    };
    expect(style.paddingTop).toBeGreaterThanOrEqual(47);
  });
});

describe("ConnectivityBanner", () => {
  beforeEach(() => {
    mockAuth.status = "signed-in";
  });

  it("is invisible on a working connection", async () => {
    const net = fakeConnectivity(true);
    const writes = fakeWrites();
    const { queryByTestId } = render(
      <ConnectivityBanner connectivity={net.source} writes={writes} />,
    );
    await act(async () => {});
    expect(queryByTestId("offline-banner")).toBeNull();
  });

  it("appears the moment the signal goes, and clears when it returns", async () => {
    const net = fakeConnectivity(true);
    const writes = fakeWrites();
    const { queryByTestId } = render(
      <ConnectivityBanner connectivity={net.source} writes={writes} />,
    );
    await act(async () => {});
    expect(queryByTestId("offline-banner")).toBeNull();

    // No timers advanced: the event IS the update.
    act(() => {
      net.emit(false);
    });
    expect(queryByTestId("offline-banner")).not.toBeNull();

    act(() => {
      net.emit(true);
    });
    expect(queryByTestId("offline-banner")).toBeNull();
  });

  it("shows straight away when the app opens with no connection", async () => {
    const net = fakeConnectivity(false);
    const writes = fakeWrites();
    const { queryByTestId } = render(
      <ConnectivityBanner connectivity={net.source} writes={writes} />,
    );
    await act(async () => {});
    expect(queryByTestId("offline-banner")).not.toBeNull();
  });

  it("starts the write queue so a reconnect replays what is pending", async () => {
    const net = fakeConnectivity(true);
    const writes = fakeWrites();
    render(<ConnectivityBanner connectivity={net.source} writes={writes} />);
    await act(async () => {});
    expect(writes.start).toHaveBeenCalled();
  });

  it("CLEARS THE QUEUE when the session ends", async () => {
    const net = fakeConnectivity(true);
    const writes = fakeWrites();
    const { rerender } = render(
      <ConnectivityBanner connectivity={net.source} writes={writes} />,
    );
    await act(async () => {});
    expect(writes.clear).not.toHaveBeenCalled();

    mockAuth.status = "signed-out";
    await act(async () => {
      rerender(<ConnectivityBanner connectivity={net.source} writes={writes} />);
    });
    expect(writes.clear).toHaveBeenCalledTimes(1);
  });

  it("does not clear while the launch read is still in flight", async () => {
    mockAuth.status = "loading";
    const net = fakeConnectivity(true);
    const writes = fakeWrites();
    render(<ConnectivityBanner connectivity={net.source} writes={writes} />);
    await act(async () => {});
    expect(writes.clear).not.toHaveBeenCalled();
  });
});
