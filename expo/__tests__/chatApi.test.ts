import {
  toConversations,
  toChatMessage,
  toChatMessages,
} from "@/lib/chat/chatApi";

describe("toConversations", () => {
  it("maps conversation docs → presentational conversations", () => {
    const convos = toConversations({
      conversations: [
        {
          _id: "c1",
          name: "Coach Jon",
          unreadCount: 3,
          lastMessage: { text: "See you Monday", sentAt: "2026-06-01T10:00:00.000Z" },
        },
        {
          _id: "c2",
          participants: [
            { name: "Me", role: "user" },
            { name: "Coach", role: "coach" },
          ],
          updatedAt: "2026-05-30T08:00:00.000Z",
        },
      ],
    });

    expect(convos[0]).toEqual({
      id: "c1",
      title: "Coach Jon",
      unread: 3,
      lastMessage: "See you Monday",
      lastMessageAt: "2026-06-01T10:00:00.000Z",
    });
    // No name → prefers the coach participant; no lastMessage → falls back to updatedAt.
    expect(convos[1]).toEqual({
      id: "c2",
      title: "Coach",
      unread: 0,
      lastMessageAt: "2026-05-30T08:00:00.000Z",
    });
  });

  it("tolerates an empty/absent response", () => {
    expect(toConversations(null)).toEqual([]);
    expect(toConversations({ conversations: [] })).toEqual([]);
  });
});

describe("toChatMessage / toChatMessages", () => {
  it("marks the current user's messages as 'user' and others as 'coach'", () => {
    const mine = toChatMessage(
      { _id: "m1", senderId: { _id: "u1", name: "Jon" }, text: "hi", createdAt: "2026-06-01T10:00:00Z" },
      "u1",
    );
    expect(mine).toEqual({
      id: "m1",
      text: "hi",
      sender: "user",
      sentAt: "2026-06-01T10:00:00Z",
    });
    const theirs = toChatMessage(
      { _id: "m2", senderId: "coach1", text: "welcome", createdAt: "2026-06-01T09:00:00Z" },
      "u1",
    );
    expect(theirs.sender).toBe("coach");
  });

  it("maps a messages list and tolerates empty input", () => {
    const list = toChatMessages(
      {
        messages: [
          { _id: "m1", senderId: "coach1", text: "a" },
          { _id: "m2", senderId: "u1", text: "b" },
        ],
      },
      "u1",
    );
    expect(list.map((m) => m.sender)).toEqual(["coach", "user"]);
    expect(toChatMessages(null, "u1")).toEqual([]);
  });
});
