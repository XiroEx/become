import { act, fireEvent, render } from "@testing-library/react-native";
import { IconPicker } from "@/components/profile/IconPicker";
import { PRESET_ICONS } from "@/lib/profile/icons";
import { captureImage } from "@/lib/media/capture";
import { uploadAvatarImage } from "@/lib/media/upload";
import { apiFetch } from "@become/api-client";

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "test-token",
    user: { id: "user-1", name: "Alex" },
  }),
}));

jest.mock("@/lib/media/capture", () => {
  const actual = jest.requireActual("@/lib/media/capture");
  return {
    ...actual,
    captureImage: jest.fn(),
  };
});

jest.mock("@/lib/media/upload", () => {
  const actual = jest.requireActual("@/lib/media/upload");
  return {
    ...actual,
    uploadAvatarImage: jest.fn(),
  };
});

describe("<IconPicker />", () => {
  const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
  const mockCaptureImage = captureImage as jest.MockedFunction<typeof captureImage>;
  const mockUploadAvatarImage = uploadAvatarImage as jest.MockedFunction<typeof uploadAvatarImage>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders all 10 presets and the upload button", () => {
    const { getByTestId } = render(<IconPicker currentIcon="flame" />);

    for (const preset of PRESET_ICONS) {
      expect(getByTestId(`icon-preset-${preset.id}`)).toBeTruthy();
    }
    expect(getByTestId("icon-upload-custom")).toBeTruthy();
    expect(getByTestId("icon-preset-flame-check")).toBeTruthy();
  });

  it("the upload hint matches the web's copy exactly (NP-306)", () => {
    const { getByText } = render(<IconPicker currentIcon="flame" />);

    // Web: `webapp/components/profile/IconPicker.tsx` — "Or upload your own —
    // position and zoom it to fit." Native previously said "choose a photo
    // from your library", which described a different (native-only) flow —
    // the photo picker itself stays native, only the copy changes.
    expect(
      getByText("Or upload your own — position and zoom it to fit."),
    ).toBeTruthy();
  });

  it("a member can change their icon natively via PATCH /api/profile (acceptance criterion e015ca53)", async () => {
    mockApiFetch.mockResolvedValueOnce({
      profileIcon: "strength",
    });
    const onIconChange = jest.fn();

    const { getByTestId } = render(
      <IconPicker currentIcon="flame" onIconChange={onIconChange} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId("icon-preset-strength"));
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/profile",
      expect.anything(),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ profileIcon: "strength" }),
      }),
    );
    expect(onIconChange).toHaveBeenCalledWith("strength");
    expect(getByTestId("icon-preset-strength-check")).toBeTruthy();
  });

  it("reverts optimistic icon change when PATCH /api/profile fails", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network failure"));
    const onIconChange = jest.fn();

    const { getByTestId, queryByTestId, findByTestId } = render(
      <IconPicker currentIcon="flame" onIconChange={onIconChange} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId("icon-preset-bolt"));
    });

    expect(onIconChange).not.toHaveBeenCalled();
    const errorEl = await findByTestId("icon-picker-error");
    expect(errorEl).toBeTruthy();
    expect(queryByTestId("icon-preset-bolt-check")).toBeNull();
    expect(getByTestId("icon-preset-flame-check")).toBeTruthy();
  });

  it("uploads a custom avatar through the media library picker", async () => {
    mockCaptureImage.mockResolvedValueOnce({
      status: "captured",
      image: {
        uri: "file://avatar.jpg",
        dataUrl: "data:image/jpeg;base64,abc",
        width: 512,
        height: 512,
        mimeType: "image/jpeg",
        fileName: "photo.jpg",
      },
    });

    mockUploadAvatarImage.mockResolvedValueOnce({
      status: "uploaded",
      imageUrl: "/api/blob/avatars/user-1/rand.jpg",
    });

    const onAvatarChange = jest.fn();
    const onIconChange = jest.fn();

    const { getByTestId } = render(
      <IconPicker
        currentIcon="flame"
        onAvatarChange={onAvatarChange}
        onIconChange={onIconChange}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId("icon-upload-custom"));
    });

    expect(mockCaptureImage).toHaveBeenCalledWith("library", expect.anything());
    expect(mockUploadAvatarImage).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file://avatar.jpg" }),
    );
    expect(onAvatarChange).toHaveBeenCalledWith(
      "/api/blob/avatars/user-1/rand.jpg",
    );
    expect(onIconChange).toHaveBeenCalledWith("custom");
  });

  it("displays PermissionDeniedNotice when photo access is refused", async () => {
    mockCaptureImage.mockResolvedValueOnce({
      status: "permission-denied",
      source: "library",
      canAskAgain: true,
      message: "Become needs access to your photos to use one here.",
    });

    const { getByTestId, findByTestId } = render(
      <IconPicker currentIcon="flame" />,
    );

    await act(async () => {
      fireEvent.press(getByTestId("icon-upload-custom"));
    });

    const notice = await findByTestId("permission-denied-notice");
    expect(notice).toBeTruthy();
    expect(
      getByTestId("permission-denied-notice-message").props.children,
    ).toContain("Become needs access to your photos");
  });
});
