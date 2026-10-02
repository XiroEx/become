import { fireEvent, render } from "@testing-library/react-native";
import { PlanRow } from "@/components/profile/PlanRow";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockEntitlementsData: { enforced: boolean; tier: string } | null = null;

jest.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({
    data: mockEntitlementsData,
    loading: false,
    enforced: mockEntitlementsData?.enforced ?? false,
    refresh: jest.fn(),
    feature: jest.fn(),
    canCreate: jest.fn(),
  }),
  tierLabel: (tier: string) => (tier === "plus" ? "Plus" : "Free"),
}));

describe("<PlanRow />", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockEntitlementsData = null;
  });

  it("renders NOTHING when data is null", () => {
    mockEntitlementsData = null;
    const { queryByTestId } = render(<PlanRow />);
    expect(queryByTestId("profile-plan-row")).toBeNull();
  });

  it("renders NOTHING when enforced is false (rules that travel)", () => {
    mockEntitlementsData = { enforced: false, tier: "free" };
    const { queryByTestId } = render(<PlanRow />);
    expect(queryByTestId("profile-plan-row")).toBeNull();
  });

  it("renders Free tier badge and opens /plan when enforced is true", () => {
    mockEntitlementsData = { enforced: true, tier: "free" };
    const { getByTestId, getByText } = render(<PlanRow />);
    expect(getByTestId("profile-plan-row")).toBeTruthy();
    expect(getByText("Free")).toBeTruthy();

    fireEvent.press(getByTestId("profile-plan-row"));
    expect(mockPush).toHaveBeenCalledWith("/plan");
  });

  it("renders Plus tier badge when tier is plus", () => {
    mockEntitlementsData = { enforced: true, tier: "plus" };
    const { getByTestId, getByText } = render(<PlanRow />);
    expect(getByTestId("profile-plan-row")).toBeTruthy();
    expect(getByText("Plus")).toBeTruthy();
  });

  it("supports custom onPress callback", () => {
    mockEntitlementsData = { enforced: true, tier: "plus" };
    const onPress = jest.fn();
    const { getByTestId } = render(<PlanRow onPress={onPress} />);
    fireEvent.press(getByTestId("profile-plan-row"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
