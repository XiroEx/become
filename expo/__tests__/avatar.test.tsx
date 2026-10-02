import { render } from "@testing-library/react-native";
import { Avatar } from "@/components/Avatar";
import { PRESET_ICONS, presetIcon } from "@/lib/profile/icons";

jest.mock("@/components/media/AuthedImage", () => {
  const { View } = require("react-native");
  return {
    AuthedImage: (props: Record<string, unknown>) => (
      <View testID="authed-image" {...props} />
    ),
  };
});

describe("<Avatar />", () => {
  it("renders a preset icon with its label and glyph", () => {
    const { getByTestId, getByLabelText } = render(
      <Avatar icon="bolt" testID="test-avatar" />,
    );
    expect(getByTestId("test-avatar")).toBeTruthy();
    expect(getByLabelText("Bolt avatar")).toBeTruthy();
  });

  it("falls back to the default preset (Flame) when icon is undefined or unrecognized", () => {
    const { getByLabelText } = render(
      <Avatar icon="unknown-icon-id" testID="test-avatar" />,
    );
    expect(getByLabelText("Flame avatar")).toBeTruthy();
  });

  it("renders AuthedImage for same-origin custom blob avatar", () => {
    const { getByTestId } = render(
      <Avatar
        icon="custom"
        imageUrl="/api/blob/avatars/user-1/photo.jpg"
        testID="test-avatar"
      />,
    );
    const authedImg = getByTestId("authed-image");
    expect(authedImg.props.source).toBe("/api/blob/avatars/user-1/photo.jpg");
  });

  it("renders Image for remote http avatar URL", () => {
    const { getByLabelText } = render(
      <Avatar
        icon="custom"
        imageUrl="https://example.com/avatar.jpg"
        testID="test-avatar"
      />,
    );
    const img = getByLabelText("Profile avatar");
    expect(img.props.source).toEqual({ uri: "https://example.com/avatar.jpg" });
  });

  it("renders neutral silhouette when custom avatar has no imageUrl", () => {
    const { getByTestId, getByLabelText } = render(
      <Avatar icon="custom" imageUrl={null} testID="test-avatar" />,
    );
    expect(getByTestId("test-avatar")).toBeTruthy();
    expect(getByLabelText("Profile avatar")).toBeTruthy();
  });

  it("covers all 10 preset icons in catalog", () => {
    expect(PRESET_ICONS.length).toBe(10);
    for (const p of PRESET_ICONS) {
      expect(presetIcon(p.id).id).toBe(p.id);
    }
  });
});
