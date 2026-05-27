import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { MessageComposer } from "@/components/chat/MessageComposer";

describe("MessageComposer", () => {
  it("send button is disabled while the input is empty", () => {
    const onSend = jest.fn();
    const { getByTestId } = render(<MessageComposer onSend={onSend} />);
    const send = getByTestId("composer-send");
    expect(send.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(send);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("fires onSend with the trimmed text when send is pressed", async () => {
    const onSend = jest.fn(async () => undefined);
    const { getByTestId } = render(<MessageComposer onSend={onSend} />);
    fireEvent.changeText(getByTestId("composer-input"), "  hello   ");
    fireEvent.press(getByTestId("composer-send"));
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("hello");
    });
  });

  it("does not fire onSend when text is only whitespace", () => {
    const onSend = jest.fn();
    const { getByTestId } = render(<MessageComposer onSend={onSend} />);
    fireEvent.changeText(getByTestId("composer-input"), "    ");
    const send = getByTestId("composer-send");
    expect(send.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(send);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears the input after a successful send", async () => {
    const onSend = jest.fn(async () => undefined);
    const { getByTestId } = render(<MessageComposer onSend={onSend} />);
    const input = getByTestId("composer-input");
    fireEvent.changeText(input, "hi");
    fireEvent.press(getByTestId("composer-send"));
    await waitFor(() => {
      expect(onSend).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(input.props.value).toBe("");
    });
  });
});
