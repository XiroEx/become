import { render } from "@testing-library/react-native";
import { ThreadView } from "@/components/chat/ThreadView";
import type { ChatMessage } from "@/lib/chat/chatSelectors";

const messages: ChatMessage[] = [
  {
    id: "c",
    text: "Latest",
    sender: "user",
    sentAt: "2026-05-27T12:00:00Z",
  },
  {
    id: "a",
    text: "Earliest",
    sender: "user",
    sentAt: "2026-05-27T08:00:00Z",
  },
  {
    id: "b",
    text: "Middle",
    sender: "coach",
    sentAt: "2026-05-27T10:00:00Z",
  },
];

describe("ThreadView", () => {
  it("renders empty state with zero messages", () => {
    const { getByTestId } = render(<ThreadView messages={[]} />);
    expect(getByTestId("thread-view-empty")).toBeTruthy();
  });

  it("renders messages in ascending chronological order", () => {
    const { getByTestId } = render(<ThreadView messages={messages} />);
    expect(getByTestId("thread-view-message-a-text").props.children).toBe(
      "Earliest",
    );
    expect(getByTestId("thread-view-message-b-text").props.children).toBe(
      "Middle",
    );
    expect(getByTestId("thread-view-message-c-text").props.children).toBe(
      "Latest",
    );
  });
});
