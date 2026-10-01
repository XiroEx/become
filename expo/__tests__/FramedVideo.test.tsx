import { render, fireEvent, act } from "@testing-library/react-native";
import { Linking } from "react-native";
import { FramedVideo } from "@/components/FramedVideo";

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
