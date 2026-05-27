import { render } from "@testing-library/react-native";
import HomeScreen from "../app/index";
import { resolveToken } from "../lib/theme/tokens";

describe("HomeScreen smoke test", () => {
  it("mounts the root screen", () => {
    const { getByTestId } = render(<HomeScreen />);
    expect(getByTestId("home-screen")).toBeTruthy();
  });

  it("renders the lucide-react-native icon", () => {
    const { getByTestId } = render(<HomeScreen />);
    expect(getByTestId("probe-icon")).toBeTruthy();
  });

  it("renders title and subtitle text", () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText("Become")).toBeTruthy();
    expect(getByText("Native scaffold online")).toBeTruthy();
  });

  it("applies the resolved primary token color to the icon", () => {
    const { getByTestId } = render(<HomeScreen />);
    const wrapper = getByTestId("probe-icon");
    const expectedPrimary = resolveToken("primary", "dark");
    expect(expectedPrimary).toBe("rgb(239 68 68)");
    // The wrapper View exposes the resolved color via accessibilityLabel so
    // jest can verify the token resolved through to the icon without depending
    // on lucide-react-native's internal Svg structure.
    expect(wrapper.props.accessibilityLabel).toBe(`primary-${expectedPrimary}`);
  });

  it("applies the resolved foreground token to the title", () => {
    const { getByTestId } = render(<HomeScreen />);
    const title = getByTestId("probe-title");
    const flatStyle = Array.isArray(title.props.style)
      ? Object.assign({}, ...title.props.style.filter(Boolean))
      : title.props.style;
    expect(flatStyle.color).toBe("rgb(255 255 255)");
  });
});
