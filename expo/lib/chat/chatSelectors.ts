/**
 * Pure selectors + helpers for chat. The webapp's POST /api/chat/.../messages
 * returns `{ message: { ... } }` (wrapped) per project memory — `unwrapPostedMessage`
 * exists so the native client doesn't have to handle that surprise inline.
 */
export type MessageSender = "user" | "coach";

export interface ChatMessage {
  id: string;
  text: string;
  sender: MessageSender;
  /** ISO-8601 timestamp (e.g. 2026-05-27T14:25:00Z). */
  sentAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  unread: number;
  lastMessage?: string;
  lastMessageAt?: string;
}

export function totalUnreadCount(conversations: Conversation[]): number {
  let total = 0;
  for (const c of conversations) {
    if (Number.isFinite(c.unread) && c.unread > 0) total += c.unread;
  }
  return total;
}

export function sortMessagesAsc(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) =>
    a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0,
  );
}

export function sortConversationsByLastMessageDesc(
  conversations: Conversation[],
): Conversation[] {
  return [...conversations].sort((a, b) => {
    const aDate = a.lastMessageAt ?? "";
    const bDate = b.lastMessageAt ?? "";
    if (aDate === bDate) return 0;
    return aDate < bDate ? 1 : -1;
  });
}

/**
 * The chat POST returns `{ message: { ... } }`. Accepts either the wrapped
 * shape or a bare ChatMessage so callers can be lazy. Returns null on
 * unrecognized payloads.
 */
export function unwrapPostedMessage(payload: unknown): ChatMessage | null {
  if (!payload || typeof payload !== "object") return null;
  if ("message" in payload) {
    const inner = (payload as { message: unknown }).message;
    if (isChatMessage(inner)) return inner;
    return null;
  }
  if (isChatMessage(payload)) return payload;
  return null;
}

function isChatMessage(v: unknown): v is ChatMessage {
  if (!v || typeof v !== "object") return false;
  const o = v as Partial<ChatMessage>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.sentAt === "string" &&
    (o.sender === "user" || o.sender === "coach")
  );
}
