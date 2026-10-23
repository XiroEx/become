/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockLogout = jest.fn();
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Jon Don",
      email: "jon@example.com",
      profileIcon: "summit",
      avatarUrl: null,
    },
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
    logout: mockLogout,
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/nutrition/foodFlags", () => {
  const actual = jest.requireActual("@/lib/nutrition/foodFlags");
  return {
    ...actual,
    loadMyReports: jest.fn(async () => ({
      status: "loaded",
      items: [],
      unreadCount: 2,
    })),
    markReportsRead: jest.fn(async () => ({ status: "marked" })),
    addReportEvidence: jest.fn(),
  };
});

jest.mock("@/lib/media/capture", () => {
  const actual = jest.requireActual("@/lib/media/capture");
  return { ...actual, captureImage: jest.fn() };
});

jest.mock("@/lib/media/upload", () => {
  const actual = jest.requireActual("@/lib/media/upload");
  return { ...actual, uploadFoodFlagImage: jest.fn() };
});

import { PageHeader } from "@/components/navigation/PageHeader";
import {
  subscribeNativeTourHubRequests,
  subscribeNativeTourReplayRequests,
} from "@/lib/tour/nativeTourRequest";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PageHeader", () => {
  it("renders the title and subtitle", () => {
    const { getByTestId, getByText } = render(
      <PageHeader
        title="Become"
        subtitle="Track your fitness journey"
        helpKey="dashboard"
      />,
    );
    expect(getByTestId("page-header-title").props.children).toBe("Become");
    expect(getByText("Track your fitness journey")).toBeTruthy();
  });

  it("shows the unread food-report count as a badge on the avatar", async () => {
    const { getByTestId } = render(
      <PageHeader title="Become" helpKey="dashboard" />,
    );
    await waitFor(() => {
      expect(getByTestId("page-header-reports-badge")).toBeTruthy();
    });
  });

  it("opens a menu with the member items and no Admin Panel", async () => {
    const { getByTestId, queryByText } = render(
      <PageHeader
        title="Become"
        subtitle="Track your fitness journey"
        helpKey="dashboard"
      />,
    );
    fireEvent.press(getByTestId("page-header-avatar-button"));
    await waitFor(() => {
      expect(getByTestId("page-header-menu")).toBeTruthy();
    });
    // The user's name heads the menu, like the web's TopNav.
    expect(getByTestId("page-header-menu-title").props.children).toBe(
      "Jon Don",
    );
    expect(getByTestId("page-header-profile-item")).toBeTruthy();
    expect(getByTestId("page-header-settings-item")).toBeTruthy();
    expect(getByTestId("page-header-food-reports-item")).toBeTruthy();
    expect(getByTestId("page-header-feedback-item")).toBeTruthy();
    expect(getByTestId("page-header-help-item")).toBeTruthy();
    expect(getByTestId("page-header-logout-item")).toBeTruthy();
    // No native admin route exists, so the menu carries no Admin Panel.
    expect(queryByText("Admin Panel")).toBeNull();
  });

  it("Help calls requestNativeTourHub with the helpKey", async () => {
    const seen: string[] = [];
    const unsub = subscribeNativeTourHubRequests((hubId) => {
      seen.push(hubId);
    });
    try {
      const { getByTestId } = render(
        <PageHeader title="Mindset" helpKey="mind" />,
      );
      fireEvent.press(getByTestId("page-header-avatar-button"));
      await waitFor(() => {
        expect(getByTestId("page-header-help-item")).toBeTruthy();
      });
      fireEvent.press(getByTestId("page-header-help-item"));
      await waitFor(() => expect(seen).toEqual(["mind"]));
    } finally {
      unsub();
    }
  });

  it("Help without a helpKey opens the tour replay instead", async () => {
    let replayed = 0;
    const unsub = subscribeNativeTourReplayRequests(() => {
      replayed += 1;
    });
    try {
      const { getByTestId } = render(<PageHeader title="Calendar" />);
      fireEvent.press(getByTestId("page-header-avatar-button"));
      await waitFor(() => {
        expect(getByTestId("page-header-help-item")).toBeTruthy();
      });
      fireEvent.press(getByTestId("page-header-help-item"));
      await waitFor(() => expect(replayed).toBe(1));
    } finally {
      unsub();
    }
  });

  it("Profile, Settings and Log out navigate through the existing paths", async () => {
    const { getByTestId } = render(
      <PageHeader title="Become" helpKey="dashboard" />,
    );
    fireEvent.press(getByTestId("page-header-avatar-button"));
    await waitFor(() => {
      expect(getByTestId("page-header-profile-item")).toBeTruthy();
    });
    fireEvent.press(getByTestId("page-header-profile-item"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/profile");

    fireEvent.press(getByTestId("page-header-avatar-button"));
    await waitFor(() => {
      expect(getByTestId("page-header-settings-item")).toBeTruthy();
    });
    fireEvent.press(getByTestId("page-header-settings-item"));
    expect(mockPush).toHaveBeenCalledWith("/settings");

    fireEvent.press(getByTestId("page-header-avatar-button"));
    await waitFor(() => {
      expect(getByTestId("page-header-logout-item")).toBeTruthy();
    });
    fireEvent.press(getByTestId("page-header-logout-item"));
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
