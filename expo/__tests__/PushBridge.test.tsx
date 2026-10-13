import { render } from "@testing-library/react-native";
import { PushBridge } from "@/components/push/PushBridge";
import type { NotificationPayload } from "@/lib/push/deepLinkRouter";

describe("PushBridge", () => {
  it("subscribes on mount and unsubscribes on unmount", () => {
    const unsubscribe = jest.fn();
    const subscribeToTap = jest.fn(() => unsubscribe);
    const navigate = jest.fn();
    const { unmount } = render(
      <PushBridge subscribeToTap={subscribeToTap} navigate={navigate} />,
    );
    expect(subscribeToTap).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("routes a tap's url to its screen", () => {
    const holder: { listener: ((p: NotificationPayload) => void) | null } = {
      listener: null,
    };
    const navigate = jest.fn();
    render(
      <PushBridge
        subscribeToTap={(fn) => {
          holder.listener = fn;
          return () => {};
        }}
        navigate={navigate}
      />,
    );
    holder.listener?.({ url: "/dashboard/calendar" });
    expect(navigate).toHaveBeenCalledWith("/(tabs)/calendar");
  });

  it("opens Home for a tap with no url", () => {
    const holder: { listener: ((p: NotificationPayload) => void) | null } = {
      listener: null,
    };
    const navigate = jest.fn();
    render(
      <PushBridge
        subscribeToTap={(fn) => {
          holder.listener = fn;
          return () => {};
        }}
        navigate={navigate}
      />,
    );
    holder.listener?.({});
    expect(navigate).toHaveBeenCalledWith("/(tabs)/dashboard");
  });

  it("starts the tap router when no subscribeToTap is injected", async () => {
    const navigate = jest.fn();
    const stop = jest.fn();
    const startRouter = jest.fn(async () => stop);
    const { unmount } = render(
      <PushBridge navigate={navigate} startRouter={startRouter} />,
    );
    await Promise.resolve();
    expect(startRouter).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
