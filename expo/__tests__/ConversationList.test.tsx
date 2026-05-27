import { render, fireEvent } from "@testing-library/react-native";
import { ConversationList } from "@/components/chat/ConversationList";
import type { Conversation } from "@/lib/chat/chatSelectors";

const sample: Conversation[] = [
  {
    id: "older",
    title: "Coach Jon",
    unread: 0,
    lastMessage: "Last sent earlier",
    lastMessageAt: "2026-05-25T10:00:00Z",
  },
  {
    id: "newer",
    title: "Mentor",
    unread: 2,
    lastMessage: "Hi, how was your week?",
    lastMessageAt: "2026-05-27T10:00:00Z",
  },
];

describe("ConversationList", () => {
  it("renders empty state when there are no conversations", () => {
    const { getByTestId } = render(<ConversationList conversations={[]} />);
    expect(getByTestId("conversation-list-empty")).toBeTruthy();
  });

  it("renders one row per conversation, sorted by most-recent first", () => {
    const { getByTestId, getAllByText } = render(
      <ConversationList conversations={sample} />,
    );
    expect(getByTestId("conversation-list-item-newer")).toBeTruthy();
    expect(getByTestId("conversation-list-item-older")).toBeTruthy();
    expect(getAllByText("Coach Jon").length).toBeGreaterThan(0);
  });

  it("renders an unread badge for conversations with unread > 0", () => {
    const { getByTestId, queryByTestId } = render(
      <ConversationList conversations={sample} />,
    );
    expect(getByTestId("conversation-list-unread-newer")).toBeTruthy();
    expect(queryByTestId("conversation-list-unread-older")).toBeNull();
  });

  it("fires onSelectConversation with the id when a row is tapped", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <ConversationList
        conversations={sample}
        onSelectConversation={onSelect}
      />,
    );
    fireEvent.press(getByTestId("conversation-list-item-newer"));
    expect(onSelect).toHaveBeenCalledWith("newer");
  });
});
