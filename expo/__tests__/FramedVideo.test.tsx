import { render, fireEvent, act } from "@testing-library/react-native";
import { Linking } from "react-native";
import { FramedVideo } from "@/components/FramedVideo";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mockPlayers } = require("expo-video");

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "auth-context-token" }),
}));

describe("FramedVideo", () => {
  beforeEach(() => {
    __mockPlayers.length = 0;
    jest.clearAllMocks();
  });

  // Acceptance Criterion e015c857:
  // A trimmed demo loops only between its trim points on a real iPhone and a real Android phone
  it("(id: e015c857) a trimmed demo loops only between its trim points", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://cdn.become.test/exercises/bench.mp4"
        exerciseName="Bench Press"
        surface="live"
        videoTrim={{ start: 1.5, end: 4.0 }}
        testID="bench-video"
      />,
    );

    expect(getByTestId("bench-video-player")).toBeTruthy();
    const player = __mockPlayers[__mockPlayers.length - 1];
    expect(player).toBeTruthy();

    // Muted is enforced
    expect(player.muted).toBe(true);
    // Native loop is disabled because the trimmed window is looped by hand
    expect(player.loop).toBe(false);
    // Initial start seek
    expect(player.currentTime).toBe(1.5);

    // Simulate playback reaching end of trim window
    act(() => {
      player.currentTime = 4.1;
      player.emit("timeUpdate", { currentTime: 4.1 });
    });
    // Looped back to trim start
    expect(player.currentTime).toBe(1.5);
    expect(player.playing).toBe(true);

    // Simulate position drifting before trim start
    act(() => {
      player.currentTime = 1.0;
      player.emit("timeUpdate", { currentTime: 1.0 });
    });
    expect(player.currentTime).toBe(1.5);

    // Simulate reaching physical end of file
    act(() => {
      player.currentTime = 10.0;
      player.emit("playToEnd");
    });
    expect(player.currentTime).toBe(1.5);
    expect(player.playing).toBe(true);
  });

  // Acceptance Criterion e015c858:
  // A .mov demo plays on Android
  it("(id: e015c858) a .mov demo plays without web transcoding/Chrome bug", () => {
    const movUrl = "https://cdn.become.test/exercises/squat.mov";
    const { getByTestId } = render(
      <FramedVideo
        src={movUrl}
        exerciseName="Squat"
        surface="live"
        testID="mov-video"
      />,
    );

    expect(getByTestId("mov-video-player")).toBeTruthy();
    const player = __mockPlayers[__mockPlayers.length - 1];
    expect(player).toBeTruthy();
    expect(player.source).toBe(movUrl);
    expect(player.playing).toBe(true);
    expect(player.muted).toBe(true);
  });

  // Acceptance Criterion e015c859:
  // A member's own custom-exercise demo plays for them
  it("(id: e015c859) a member's own custom-exercise demo sends Authorization header", () => {
    const customVideoUrl =
      "https://become.redbtn.io/api/blob/custom-exercises/user-123/my-lift/demo.mp4";
    const memberToken = "member-secret-jwt";

    const { getByTestId } = render(
      <FramedVideo
        src={customVideoUrl}
        exerciseName="My Custom Lift"
        surface="live"
        token={memberToken}
        testID="custom-video"
      />,
    );

    expect(getByTestId("custom-video-player")).toBeTruthy();
    const player = __mockPlayers[__mockPlayers.length - 1];
    expect(player).toBeTruthy();

    expect(player.source).toEqual({
      uri: customVideoUrl,
      headers: {
        Authorization: `Bearer ${memberToken}`,
      },
    });
  });

  it("public catalogue demos do not send Authorization header", () => {
    const catalogueUrl = "https://become.redbtn.io/api/blob/exercises/bench/demo.mp4";
    render(
      <FramedVideo
        src={catalogueUrl}
        exerciseName="Bench Press"
        surface="live"
        token="some-token"
      />,
    );

    const player = __mockPlayers[__mockPlayers.length - 1];
    expect(player.source).toBe(catalogueUrl);
  });

  // Acceptance Criterion e015c85a:
  // An exercise without a demo shows the placeholder, not a black box
  it("(id: e015c85a) an exercise without a demo shows the placeholder, not a black box", () => {
    const { getByTestId, queryByTestId } = render(
      <FramedVideo
        src={null}
        exerciseName="Romanian Deadlift"
        surface="live"
        testID="rdl"
      />,
    );

    // Placeholder is displayed
    const placeholder = getByTestId("rdl-placeholder");
    expect(placeholder).toBeTruthy();

    // Contains exercise name and demo coming message
    expect(getByTestId("rdl-placeholder-title").props.children).toBe(
      "Romanian Deadlift",
    );
    expect(getByTestId("rdl-placeholder-message").props.children).toBe(
      "Demo coming soon",
    );

    // Does not show an empty video player / black box
    expect(queryByTestId("rdl-player")).toBeNull();
  });

  it("shows legacy YouTube demos as a thumbnail that opens YouTube", () => {
    const openUrlSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    const { getByTestId, queryByTestId } = render(
      <FramedVideo
        src={youtubeUrl}
        exerciseName="Barbell Row"
        surface="preview"
        thumbnailUrl="https://cdn.example.test/thumb.jpg"
        testID="yt-row"
      />,
    );

    // Shows YouTube thumbnail card, not VideoView
    const ytButton = getByTestId("yt-row-youtube");
    expect(ytButton).toBeTruthy();
    expect(queryByTestId("yt-row-player")).toBeNull();

    // Tapping opens YouTube via Linking.openURL
    fireEvent.press(ytButton);
    expect(openUrlSpy).toHaveBeenCalledWith(youtubeUrl);
  });

  it("applies framing crop and zoom per surface", () => {
    const { getByTestId } = render(
      <FramedVideo
        src="https://cdn.become.test/demo.mp4"
        surface="live"
        videoFraming={{ zoom: 125, fit: "cover" }}
        testID="framed"
      />,
    );

    const playerView = getByTestId("framed-player");
    expect(playerView.props.contentFit).toBe("cover");
    expect(playerView.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transform: [{ scale: 1.25 }],
        }),
      ]),
    );
  });
});
