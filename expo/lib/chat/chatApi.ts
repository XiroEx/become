import type {
  ConversationsResponse,
  MessagesResponse,
  ChatMessageDoc,
} from "@become/api-client";
import type { Conversation, ChatMessage } from "@/lib/chat/chatSelectors";

interface RawParticipant {
  name?: string;
  role?: string;
}

/** Map the conversations response into the presentational Conversation list. */
export function toConversations(
  response: ConversationsResponse | null | undefined,
): Conversation[] {
  if (!response?.conversations) return [];
  return response.conversations.map((c) => {
    const participants = (c.participants ?? []) as RawParticipant[];
    const title =
      c.name ??
      participants.find((p) => p?.role === "coach" || p?.role === "admin")
        ?.name ??
      participants[0]?.name ??
      "Conversation";
    const conv: Conversation = {
      id: c._id ?? c.id ?? "",
      title,
      unread: c.unreadCount ?? 0,
    };
    if (c.lastMessage?.text !== undefined) conv.lastMessage = c.lastMessage.text;
    const lastAt = c.lastMessage?.sentAt ?? c.updatedAt;
    if (lastAt !== undefined) conv.lastMessageAt = lastAt;
    return conv;
  });
}

function senderIdOf(doc: ChatMessageDoc): string | undefined {
  const s = doc.senderId;
  if (typeof s === "string") return s;
  if (s && typeof s === "object") {
    const id = (s as { _id?: unknown; id?: unknown })._id ?? (s as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

/** Map a message doc → presentational ChatMessage (sender relative to me). */
export function toChatMessage(
  doc: ChatMessageDoc,
  currentUserId?: string,
): ChatMessage {
  const senderId = senderIdOf(doc);
  return {
    id: doc._id ?? doc.id ?? "",
    text: doc.text,
    sender: currentUserId && senderId === currentUserId ? "user" : "coach",
    sentAt: doc.createdAt ?? "",
  };
}

/** Map the messages-list response → ChatMessage[]. */
export function toChatMessages(
  response: MessagesResponse | null | undefined,
  currentUserId?: string,
): ChatMessage[] {
  if (!response?.messages) return [];
  return response.messages.map((m) => toChatMessage(m, currentUserId));
}
