import { render } from "@testing-library/react-native";
import { Badge } from "@/components/Badge";

describe("Badge", () => {
  it("renders its text child", () => {
    const { getByTestId } = render(<Badge testID="b">New</Badge>);
    expect(getByTestId("b-text").props.children).toBe("New");
  });

  it("default variant renders without crashing and exposes role=text", () => {
    const { getByTestId } = render(<Badge testID="b">Tag</Badge>);
    expect(getByTestId("b").props.accessibilityRole).toBe("text");
  });

  it("applies an accessibilityLabel when provided", () => {
    const { getByTestId } = render(
      <Badge testID="b" accessibilityLabel="Status: active">
        Active
      </Badge>,
    );
    expect(getByTestId("b").props.accessibilityLabel).toBe("Status: active");
  });

  it("supports primary / destructive / accent variants without throwing", () => {
    const { getByTestId, rerender } = render(
      <Badge testID="b" variant="primary">P</Badge>,
    );
    expect(getByTestId("b")).toBeTruthy();
    rerender(<Badge testID="b" variant="destructive">D</Badge>);
    expect(getByTestId("b")).toBeTruthy();
    rerender(<Badge testID="b" variant="accent">A</Badge>);
    expect(getByTestId("b")).toBeTruthy();
  });
});
