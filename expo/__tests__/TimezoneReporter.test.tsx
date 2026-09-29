import { render } from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";
import { TimezoneReporter } from "@/components/TimezoneReporter";
import type { ReportTimezoneResult } from "@/lib/timezone/reportTimezone";

// The two moments the card asks for: LAUNCH, and the first FOREGROUND of a new
// local day. The day gate itself lives in lib/timezone/reportTimezone.ts (see
// timezoneReport.test.ts) — this pins that the reporter is actually driven at
// both, and that it stops when the app unmounts.

function reporter() {
  const calls: number[] = [];
  const report = async (): Promise<ReportTimezoneResult> => {
    calls.push(Date.now());
    return "reported";
  };
  return { report, calls };
}

describe("TimezoneReporter", () => {
  it("reports on launch and unsubscribes on unmount", () => {
    const { report, calls } = reporter();
    const unsubscribe = jest.fn();
    const subscribeToAppState = jest.fn(() => unsubscribe);

    const { unmount } = render(
      <TimezoneReporter report={report} subscribeToAppState={subscribeToAppState} />,
    );

    expect(calls).toHaveLength(1);
    expect(subscribeToAppState).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("reports again when the app comes back to the foreground", () => {
    const { report, calls } = reporter();
    const holder: { listener: ((s: AppStateStatus) => void) | null } = { listener: null };

    render(
      <TimezoneReporter
        report={report}
        subscribeToAppState={(fn) => {
          holder.listener = fn;
          return () => {};
        }}
      />,
    );
    expect(calls).toHaveLength(1);

    holder.listener?.("background");
    expect(calls).toHaveLength(1);

    holder.listener?.("active");
    expect(calls).toHaveLength(2);
  });
});
