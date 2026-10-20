import { render, fireEvent, act } from "@testing-library/react-native";
import { Linking } from "react-native";
import { FramedVideo } from "@/components/FramedVideo";
import { WEBAPP_BASE_URL } from "@/lib/config";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "mock-member-jwt",
    user: { id: "user-123" },
    isAuthed: true,
  }),
}));

describe("FramedVideo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as any);
  });

  it("(e015c85a) an exercise without a demo shows the placeholder, not a black box", () => {
    const { getByTestId, queryByTestId } = render(
      <FramedVideo
        src={null}
        exerciseName="Bulgarian Split Squat"
        surface="live"
        testID="demo-video"
      />,
    );

    expect(getByTestId("demo-video-placeholder")).toBeTruthy();
    const textEl = getByTestId("demo-video-placeholder-text");
    expect(textEl.props.children).toContain("Bulgarian Split Squat");
    expect(textEl.props.children).toContain("demo is coming");

    // No video player rendered
    expect(queryByTestId("demo-video-player")).toBeNull();
  });

  it("(e015c858) a .mov demo plays with native video player", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://cdn.example.com/exercises/squat.mov"
        exerciseName="Squat"
        surface="live"
        testID="demo-video"
      />,
    );

    const playerView = getByTestId("demo-video-player");
    expect(playerView).toBeTruthy();
  });

  it("(e015c859) a member's own custom-exercise demo sends Authorization header", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://become.redbtn.io/api/blob/custom-exercises/user-123/my-lift.mp4"
        surface="live"
        testID="custom-video"
      />,
    );

    const playerView = getByTestId("custom-video-player");
    expect(playerView).toBeTruthy();
    const player = playerView.props.player;
    expect(player.source).toEqual({
      uri: "https://become.redbtn.io/api/blob/custom-exercises/user-123/my-lift.mp4",
      headers: {
        Authorization: "Bearer mock-member-jwt",
      },
    });
  });

  it("(NP-287) a catalogue demo stored as a relative path resolves against the webapp origin instead of showing the broken-media glyph", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="/exercises/jumping-jacks.mp4"
        exerciseName="Jumping Jacks"
        surface="live"
        testID="relative-video"
      />,
    );

    const player = getByTestId("relative-video-player").props.player;
    expect(player.source).toEqual({
      uri: `${WEBAPP_BASE_URL}/exercises/jumping-jacks.mp4`,
    });
  });

  it("(NP-287) a protocol-relative thumbnail resolves to https", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://cdn.example.test/exercises/jumping-jacks.mp4"
        thumbnailUrl="//cdn.example.test/thumb.jpg"
        exerciseName="Jumping Jacks"
        surface="live"
        isPlaying={false}
        testID="pr-video"
      />,
    );

    expect(
      getByTestId("pr-video-thumbnail-image").props.source,
    ).toEqual({ uri: "https://cdn.example.test/thumb.jpg" });
  });

  it("catalogue demo does not send Authorization header", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://become.redbtn.io/exercises/bench-press.mp4"
        surface="live"
        testID="catalogue-video"
      />,
    );

    const player = getByTestId("catalogue-video-player").props.player;
    expect(player.source.headers).toBeUndefined();
  });

  it("(e015c857) a trimmed demo loops only between its trim points and stays muted", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://cdn.example.com/exercises/deadlift.mp4"
        surface="live"
        videoTrim={{ start: 2.0, end: 6.5 }}
        testID="trimmed-video"
      />,
    );

    const player = getByTestId("trimmed-video-player").props.player;
    expect(player.muted).toBe(true);
    expect(player.loop).toBe(false); // native loop is turned off for trimmed video

    // When time passes the trim end point, seeks back to start
    act(() => {
      player._emit("timeUpdate", { currentTime: 6.6 });
    });
    expect(player.currentTime).toBe(2.0);

    // When playToEnd fires, seeks back to start
    act(() => {
      player._emit("playToEnd");
    });
    expect(player.currentTime).toBe(2.0);
    expect(player.play).toHaveBeenCalled();
  });

  it("an untrimmed demo has native loop enabled", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://cdn.example.com/exercises/deadlift.mp4"
        surface="live"
        videoTrim={null}
        testID="untrimmed-video"
      />,
    );

    const player = getByTestId("untrimmed-video-player").props.player;
    expect(player.loop).toBe(true);
    expect(player.muted).toBe(true);
  });

  // (id: 9d6d32f2 / 9d6d32f3) Demo clips are always silent — muted AND set to
  // mix with other audio, so a member's music never pauses when Live mounts
  // a clip, swaps to the next exercise, or the clip loops.
  it("(id: 9d6d32f2) every demo clip mixes with other audio instead of taking the session", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://cdn.example.com/exercises/squat.mov"
        surface="live"
        testID="mix-video"
      />,
    );

    const player = getByTestId("mix-video-player").props.player;
    expect(player.muted).toBe(true);
    expect(player.audioMixingMode).toBe("mixWithOthers");
  });

  it("(id: 9d6d32f3) every new player the exercise change creates (expo-video's own useVideoPlayer recreates one per distinct source) is muted and mixing, not just the first", () => {
    // Live keeps ONE `FramedVideo`, but `expo-video`'s real `useVideoPlayer`
    // keys the underlying player on `JSON.stringify(source)` — a different
    // exercise's clip is a genuinely new native player, with `setup` rerun
    // from scratch, which is exactly what each of these two mounts stands
    // in for.
    const { getByTestId: squat } = render(
      <FramedVideo
        src="https://cdn.example.com/exercises/squat.mov"
        surface="live"
        testID="squat-video"
      />,
    );
    const { getByTestId: lunge } = render(
      <FramedVideo
        src="https://cdn.example.com/exercises/lunge.mov"
        surface="live"
        testID="lunge-video"
      />,
    );

    const squatPlayer = squat("squat-video-player").props.player;
    const lungePlayer = lunge("lunge-video-player").props.player;
    expect(squatPlayer.muted).toBe(true);
    expect(squatPlayer.audioMixingMode).toBe("mixWithOthers");
    expect(lungePlayer.muted).toBe(true);
    expect(lungePlayer.audioMixingMode).toBe("mixWithOthers");
  });

  it("(id: 9d6d32f3) looping back to the start (playToEnd) never touches audioMixingMode", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://cdn.example.com/exercises/deadlift.mp4"
        surface="live"
        videoTrim={null}
        testID="loop-video"
      />,
    );

    const player = getByTestId("loop-video-player").props.player;
    expect(player.audioMixingMode).toBe("mixWithOthers");

    act(() => {
      player._emit("playToEnd");
    });

    expect(player.audioMixingMode).toBe("mixWithOthers");
  });

  it("shows legacy YouTube demos as a thumbnail that opens YouTube", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        exerciseName="Roll"
        surface="live"
        testID="yt-video"
      />,
    );

    const ytButton = getByTestId("yt-video-youtube");
    expect(ytButton).toBeTruthy();

    fireEvent.press(ytButton);
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });
});
