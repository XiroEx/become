import {
  sortConversationsByLastMessageDesc,
  sortMessagesAsc,
  totalUnreadCount,
  unwrapPostedMessage,
  type ChatMessage,
  type Conversation,
} from "@/lib/chat/chatSelectors";

describe("totalUnreadCount", () => {
  it("sums positive unread values", () => {
    const c: Conversation[] = [
      { id: "1", title: "A", unread: 2 },
      { id: "2", title: "B", unread: 3 },
      { id: "3", title: "C", unread: 0 },
    ];
    expect(totalUnreadCount(c)).toBe(5);
  });

  it("ignores negative or non-finite unread values", () => {
    const c: Conversation[] = [
      { id: "1", title: "A", unread: -1 },
      { id: "2", title: "B", unread: Number.NaN },
      { id: "3", title: "C", unread: 4 },
    ];
    expect(totalUnreadCount(c)).toBe(4);
  });

  it("returns 0 for empty input", () => {
    expect(totalUnreadCount([])).toBe(0);
  });
});

describe("sortMessagesAsc", () => {
  const m: ChatMessage[] = [
    { id: "b", text: "later", sender: "coach", sentAt: "2026-05-27T10:00:00Z" },
    { id: "a", text: "earlier", sender: "user", sentAt: "2026-05-27T08:00:00Z" },
    { id: "c", text: "latest", sender: "user", sentAt: "2026-05-27T12:00:00Z" },
  ];

  it("returns ascending by sentAt", () => {
    expect(sortMessagesAsc(m).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("is non-mutating", () => {
    const before = m.map((x) => x.id);
    sortMessagesAsc(m);
    expect(m.map((x) => x.id)).toEqual(before);
  });
});

describe("sortConversationsByLastMessageDesc", () => {
  it("puts the most recent lastMessageAt first; undefined goes last", () => {
    const c: Conversation[] = [
      { id: "old", title: "A", unread: 0, lastMessageAt: "2026-05-20T00:00:00Z" },
      { id: "new", title: "B", unread: 0, lastMessageAt: "2026-05-27T00:00:00Z" },
      { id: "none", title: "C", unread: 0 },
    ];
    expect(
      sortConversationsByLastMessageDesc(c).map((x) => x.id),
    ).toEqual(["new", "old", "none"]);
  });
});

describe("unwrapPostedMessage", () => {
  const sample: ChatMessage = {
    id: "m1",
    text: "hello",
    sender: "coach",
    sentAt: "2026-05-27T08:00:00Z",
  };

  it("unwraps a { message: ... } payload (canonical POST shape)", () => {
    expect(unwrapPostedMessage({ message: sample })).toEqual(sample);
  });

  it("accepts a bare ChatMessage too", () => {
    expect(unwrapPostedMessage(sample)).toEqual(sample);
  });

  it("returns null for malformed inner payload", () => {
    expect(unwrapPostedMessage({ message: { id: 123 } })).toBeNull();
    expect(unwrapPostedMessage({ message: { id: "m", text: "x", sender: "alien", sentAt: "z" } })).toBeNull();
  });

  it("returns null for non-objects", () => {
    expect(unwrapPostedMessage(null)).toBeNull();
    expect(unwrapPostedMessage(undefined)).toBeNull();
    expect(unwrapPostedMessage("string")).toBeNull();
  });
});
