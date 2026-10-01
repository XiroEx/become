import { render, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";
import { FramedVideo } from "@/components/FramedVideo";

describe("FramedVideo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as any);
  });

  describe("Placeholder (criterion e015c85a)", () => {
    it("renders the placeholder with exercise name and demo coming text when src is null", () => {
      const { getByTestId, queryByTestId } = render(
        <FramedVideo
          src={null}
          surface="live"
          exerciseName="Barbell Squat"
          testID="squat-video"
        />,
      );

      expect(getByTestId("squat-video-placeholder")).toBeTruthy();
      expect(getByTestId("squat-video-placeholder-name").props.children).toBe(
        "Barbell Squat",
      );
      expect(getByTestId("squat-video-placeholder-text").props.children).toBe(
        "Demo is coming soon",
      );
      // Ensure it is not a black box or unhandled video player
      expect(queryByTestId("squat-video-player")).toBeNull();
    });

    it("renders the placeholder when src is empty string", () => {
      const { getByTestId } = render(
        <FramedVideo
          src=""
          surface="preview"
          exerciseName="Push Up"
          testID="pushup-video"
        />,
      );

      expect(getByTestId("pushup-video-placeholder")).toBeTruthy();
      expect(getByTestId("pushup-video-placeholder-name").props.children).toBe(
        "Push Up",
      );
    });
  });

  describe("Legacy YouTube demos", () => {
    it("renders YouTube thumbnail and opens YouTube link on press", () => {
      const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const { getByTestId } = render(
        <FramedVideo
          src={youtubeUrl}
          surface="form"
          exerciseName="Rickroll Press"
          testID="yt-demo"
        />,
      );

      const button = getByTestId("yt-demo-youtube");
      expect(button).toBeTruthy();

      fireEvent.press(button);
      expect(Linking.openURL).toHaveBeenCalledWith(youtubeUrl);
    });
  });

  describe(".mov direct playback on Android/iOS (criterion e015c858)", () => {
    it("passes .mov directly to native video player without web workarounds", () => {
      const movUrl = "https://cdn.example.com/exercises/bench/demo.mov";
      const { getByTestId } = render(
        <FramedVideo
          src={movUrl}
          surface="live"
          exerciseName="Bench Press"
          testID="bench-video"
        />,
      );

      const playerView = getByTestId("bench-video");
      expect(playerView).toBeTruthy();
      expect(playerView.props["data-source"]).toEqual({ uri: movUrl });
    });
  });

  describe("Custom exercise demo authorization (criterion e015c859)", () => {
    it("sends Authorization: Bearer in headers for custom-exercise demos", () => {
      const customUrl =
        "https://become.redbtn.io/api/blob/custom-exercises/user-123/my-lift/video.mp4";
      const userToken = "test-jwt-token";

      const { getByTestId } = render(
        <FramedVideo
          src={customUrl}
          surface="live"
          exerciseName="My Custom Lift"
          token={userToken}
          testID="custom-video"
        />,
      );

      const playerView = getByTestId("custom-video");
      expect(playerView.props["data-source"]).toEqual({
        uri: customUrl,
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });
    });

    it("does not send Authorization headers for public catalogue demos", () => {
      const catalogUrl =
        "https://become.redbtn.io/api/blob/exercises/squat/demo.mp4";

      const { getByTestId } = render(
        <FramedVideo
          src={catalogUrl}
          surface="live"
          exerciseName="Catalogue Squat"
          token="token-should-not-be-sent"
          testID="cat-video"
        />,
      );

      const playerView = getByTestId("cat-video");
      expect(playerView.props["data-source"]).toEqual({
        uri: catalogUrl,
      });
    });
  });

  describe("Trimmed demo looping (criterion e015c857)", () => {
    it("configures trim points and seeks to start", () => {
      const videoUrl = "https://cdn.example.com/exercises/deadlift/demo.mp4";
      const { getByTestId } = render(
        <FramedVideo
          src={videoUrl}
          surface="live"
          exerciseName="Deadlift"
          videoTrim={{ start: 2.0, end: 6.0 }}
          testID="deadlift-video"
        />,
      );

      const playerView = getByTestId("deadlift-video");
      expect(playerView).toBeTruthy();
    });
  });

  describe("Per-surface framing", () => {
    it("applies contentFit cover for portrait demo on live surface", () => {
      const { getByTestId } = render(
        <FramedVideo
          src="https://cdn.example.com/demo.mp4"
          surface="live"
          videoWidth={1080}
          videoHeight={1920}
          testID="portrait-video"
        />,
      );

      const playerView = getByTestId("portrait-video");
      expect(playerView.props["data-content-fit"]).toBe("cover");
    });

    it("applies zoom scale transform when configured", () => {
      const { getByTestId } = render(
        <FramedVideo
          src="https://cdn.example.com/demo.mp4"
          surface="form"
          videoFraming={{ zoom: 150 }}
          testID="zoomed-video"
        />,
      );

      const playerView = getByTestId("zoomed-video");
      expect(playerView.props.style).toEqual(
        expect.arrayContaining([{ transform: [{ scale: 1.5 }] }]),
      );
    });
  });
});
