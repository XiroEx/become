/**
 * Jon, 2026-10-29: the Live workout's demo video froze after leaving the app
 * and coming back, and never played again. iOS pauses the player in the
 * background; FramedVideo now plays it again when the app is active.
 */
import { act, render } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { FramedVideo } from "@/components/FramedVideo";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "t", user: null, loading: false, isAuthed: true }),
}));

describe("FramedVideo resumes when the app comes back", () => {
  it("plays again on returning to the foreground", () => {
    const handlers: ((s: AppStateStatus) => void)[] = [];
    const spy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, handler) => {
        handlers.push(handler as (s: AppStateStatus) => void);
        return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
    const { getByTestId } = render(
      <FramedVideo
        src="https://cdn.example.com/exercises/leg-press.mp4"
        exerciseName="Leg Press"
        surface="live"
        fill
        testID="demo-video"
      />,
    );
    const player = getByTestId("demo-video-player").props.player as {
      play: jest.Mock;
      pause: () => void;
      playing: boolean;
    };
    // The OS paused it while the app was in the background.
    act(() => player.pause());
    player.play.mockClear();
    act(() => {
      for (const h of handlers) h("background");
    });
    expect(player.play).not.toHaveBeenCalled();
    act(() => {
      for (const h of handlers) h("active");
    });
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.playing).toBe(true);
    spy.mockRestore();
  });
});
