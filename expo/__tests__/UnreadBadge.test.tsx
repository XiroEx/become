import { render } from "@testing-library/react-native";
import { UnreadBadge } from "@/components/chat/UnreadBadge";

describe("UnreadBadge", () => {
  it("renders the count", () => {
    const { getByText } = render(<UnreadBadge count={3} />);
    expect(getByText("3")).toBeTruthy();
  });

  it("hides when count is 0", () => {
    const { queryByTestId } = render(<UnreadBadge count={0} />);
    expect(queryByTestId("unread-badge")).toBeNull();
  });

  it("hides when count is negative", () => {
    const { queryByTestId } = render(<UnreadBadge count={-1} />);
    expect(queryByTestId("unread-badge")).toBeNull();
  });

  it("renders '99+' when count exceeds 99", () => {
    const { getByText } = render(<UnreadBadge count={123} />);
    expect(getByText("99+")).toBeTruthy();
  });

  it("exposes an accessibilityLabel describing the unread count", () => {
    const { getByTestId } = render(<UnreadBadge count={5} />);
    expect(getByTestId("unread-badge").props.accessibilityLabel).toBe(
      "5 unread",
    );
  });
});
