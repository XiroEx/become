import { render, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";

describe("BottomSheet", () => {
  it("renders title and children when visible", () => {
    const { getByTestId } = render(
      <BottomSheet testID="s" visible onClose={() => {}} title="Pick a unit">
        <Text testID="s-body">Sheet body</Text>
      </BottomSheet>,
    );
    expect(getByTestId("s-title").props.children).toBe("Pick a unit");
    expect(getByTestId("s-body").props.children).toBe("Sheet body");
  });

  it("shows a drag handle for affordance", () => {
    const { getByTestId } = render(
      <BottomSheet testID="s" visible onClose={() => {}} title="Pick">
        <Text>x</Text>
      </BottomSheet>,
    );
    expect(getByTestId("s-handle")).toBeTruthy();
    expect(getByTestId("s-handle").props.accessibilityLabel).toBe("Drag handle");
  });

  it("calls onClose when backdrop is pressed", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <BottomSheet testID="s" visible onClose={onClose}>
        <Text>x</Text>
      </BottomSheet>,
    );
    fireEvent.press(getByTestId("s-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render sheet content when visible=false", () => {
    const { queryByTestId } = render(
      <BottomSheet testID="s" visible={false} onClose={() => {}} title="Pick">
        <Text testID="s-body">x</Text>
      </BottomSheet>,
    );
    expect(queryByTestId("s-title")).toBeNull();
    expect(queryByTestId("s-body")).toBeNull();
  });
});
