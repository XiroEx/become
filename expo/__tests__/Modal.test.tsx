import { render, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { Modal } from "@/components/Modal";

describe("Modal", () => {
  it("renders title and children when visible", () => {
    const { getByTestId } = render(
      <Modal testID="m" visible onClose={() => {}} title="Confirm">
        <Text testID="m-body">Body content</Text>
      </Modal>,
    );
    expect(getByTestId("m-title").props.children).toBe("Confirm");
    expect(getByTestId("m-body").props.children).toBe("Body content");
  });

  it("does not render contents when visible=false", () => {
    const { queryByTestId } = render(
      <Modal testID="m" visible={false} onClose={() => {}} title="Confirm">
        <Text testID="m-body">Body</Text>
      </Modal>,
    );
    expect(queryByTestId("m-title")).toBeNull();
    expect(queryByTestId("m-body")).toBeNull();
  });

  it("calls onClose when the backdrop is pressed", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <Modal testID="m" visible onClose={onClose} title="x">
        <Text>x</Text>
      </Modal>,
    );
    fireEvent.press(getByTestId("m-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes accessibilityViewIsModal and accessibilityLabel falls back to title", () => {
    const { getByTestId } = render(
      <Modal testID="m" visible onClose={() => {}} title="Delete account">
        <Text>x</Text>
      </Modal>,
    );
    const card = getByTestId("m-card");
    expect(card.props.accessibilityViewIsModal).toBe(true);
    expect(card.props.accessibilityLabel).toBe("Delete account");
  });
});
