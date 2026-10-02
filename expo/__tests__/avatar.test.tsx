import { render } from "@testing-library/react-native";
import { Avatar } from "@/components/Avatar";
import { PRESET_ICONS, presetIcon } from "@/lib/profile/icons";
import {
  PROFILE_ICON_GRADIENTS,
  profileIconGradient,
} from "@become/core/profileIcons";

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

  it("renders every preset on a gradient fill with the web's stops (NP-214)", () => {
    // The shared table must cover the same 10 ids as the native catalog.
    expect(PROFILE_ICON_GRADIENTS.length).toBe(10);
    for (const p of PRESET_ICONS) {
      expect(profileIconGradient(p.id).id).toBe(p.id);
    }

    for (const p of PRESET_ICONS) {
      const { getByLabelText } = render(
        <Avatar icon={p.id} testID={`avatar-${p.id}`} />,
      );
      const circle = getByLabelText(`${p.label} avatar`);
      const expected = profileIconGradient(p.id);
      // Two opaque stops: the circle is never transparent, in light or dark.
      expect(circle.props.colors).toEqual(expected.colors);
      expect(circle.props.colors).toHaveLength(2);
      // Same angle as the web's `bg-gradient-to-br` (top-left → bottom-right).
      expect(circle.props.start).toEqual({ x: 0, y: 0 });
      expect(circle.props.end).toEqual({ x: 1, y: 1 });
    }
  });

  it("falls back to the flame gradient for an unrecognized icon", () => {
    const { getByLabelText } = render(
      <Avatar icon="unknown-icon-id" testID="test-avatar" />,
    );
    const circle = getByLabelText("Flame avatar");
    expect(circle.props.colors).toEqual(profileIconGradient("flame").colors);
  });
});
