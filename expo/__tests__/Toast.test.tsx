import { render } from "@testing-library/react-native";
import { Toast } from "@/components/Toast";

describe("Toast", () => {
  it("renders nothing when there is no toast", () => {
    const { queryByTestId } = render(<Toast toast={null} testID="t" />);
    expect(queryByTestId("t")).toBeNull();
  });

  it("renders the message as a floating pill, not plain scroll-flow text", () => {
    const { getByTestId } = render(
      <Toast toast={{ message: "Saved to your Foods — tap again to log it", type: "success" }} testID="t" />,
    );
    expect(getByTestId("t")).toBeTruthy();
    expect(getByTestId("t-message").props.children).toBe(
      "Saved to your Foods — tap again to log it",
    );
    expect(getByTestId("t").props.accessibilityRole).toBe("alert");
  });

  it.each(["success", "error", "neutral", "info"] as const)(
    "renders the %s type without throwing",
    (type) => {
      const { getByTestId } = render(<Toast toast={{ message: "x", type }} testID="t" />);
      expect(getByTestId("t")).toBeTruthy();
    },
  );
});
