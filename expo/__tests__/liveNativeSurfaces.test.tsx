import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { renderHook } from "@testing-library/react-native";
import { useLiveNativeSurfaces } from "@/lib/live/useLiveNativeSurfaces";
import type { WorkoutLiveActivityFactory } from "@/lib/live/liveActivity/workoutLiveActivity";
import type { WorkoutNotificationNative } from "@/lib/live/liveActivity/workoutNotification";

/**
 * A quick session shipped with no keep-awake, no Lock Screen Live Activity and
 * no ongoing notification: the native pieces were loaded by the program-day
 * route only, and `LiveWorkoutClient` quietly skips a null factory. Found on a
 * real iPhone on 2026-10-22. These tests hold every Live route to the one hook.
 */

const APP_DIR = join(__dirname, "..", "app");

function routeFilesRenderingLiveClient(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...routeFilesRenderingLiveClient(full));
    } else if (/\.tsx$/.test(name) && readFileSync(full, "utf8").includes("<LiveWorkoutClient")) {
      out.push(full);
    }
  }
  return out;
}

describe("useLiveNativeSurfaces", () => {
  it("hands back injected surfaces as-is", () => {
    const factory: WorkoutLiveActivityFactory = { start: () => null };
    const native = {} as WorkoutNotificationNative;
    const { result } = renderHook(() =>
      useLiveNativeSurfaces({
        workoutLiveActivityFactory: factory,
        workoutNotificationNative: native,
      }),
    );
    expect(result.current.workoutLiveActivityFactory).toBe(factory);
    expect(result.current.workoutNotificationNative).toBe(native);
  });

  it("an injected null stays null (no real module is loaded over it)", () => {
    const { result } = renderHook(() =>
      useLiveNativeSurfaces({
        workoutLiveActivityFactory: null,
        workoutNotificationNative: null,
      }),
    );
    expect(result.current.workoutLiveActivityFactory).toBeNull();
    expect(result.current.workoutNotificationNative).toBeNull();
  });
});

describe("every Live route wires the native surfaces", () => {
  const routes = routeFilesRenderingLiveClient(APP_DIR);

  it("finds both Live routes (program day and quick session)", () => {
    const names = routes.map((r) => r.replace(APP_DIR, ""));
    expect(names.some((n) => n.includes("[idx]/live.tsx"))).toBe(true);
    expect(names.some((n) => n.includes("quick/live.tsx"))).toBe(true);
  });

  it.each(routes.map((r) => [r.replace(APP_DIR, ""), r]))(
    "%s calls useLiveNativeSurfaces and passes both surfaces on",
    (_name, file) => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("useLiveNativeSurfaces(");
      expect(src).toMatch(/workoutLiveActivityFactory=\{workoutLiveActivityFactory\}/);
      expect(src).toMatch(/workoutNotificationNative=\{workoutNotificationNative\}/);
    },
  );
});
