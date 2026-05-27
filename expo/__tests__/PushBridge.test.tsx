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

  it("routes a workout-reminder tap to the live workout screen", () => {
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
    holder.listener?.({
      category: "workout-reminder",
      programId: "p1",
      phaseIndex: 0,
      workoutIndex: 3,
    });
    expect(navigate).toHaveBeenCalledWith(
      "/(tabs)/programming/p1/workout/3/live",
    );
  });

  it("routes a re-engagement tap to the mind tab", () => {
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
    holder.listener?.({ category: "re-engagement" });
    expect(navigate).toHaveBeenCalledWith("/(tabs)/mind");
  });
});
