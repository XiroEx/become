import { z } from 'zod';

/**
 * Chat. Mirrors webapp/app/api/chat/* + models/Conversation.ts + models/Message.ts.
 * NOTE: POST /api/chat/.../messages returns the WRAPPED shape { message: {...} }
 * (see PostMessageResponseSchema), distinct from GET which returns { messages }.
 */

export const ChatParticipantSchema = z
  .object({
    _id: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    role: z.string().optional(),
  })
  .passthrough();

export const ChatLastMessageSchema = z
  .object({
    text: z.string().optional(),
    senderId: z.string().optional(),
    sentAt: z.string().optional(),
  })
  .passthrough();

export const ConversationDocSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string().nullable().optional(),
    participants: z.array(z.unknown()).optional(),
    lastMessage: ChatLastMessageSchema.optional(),
    updatedAt: z.string().optional(),
    unreadCount: z.number().optional(),
  })
  .passthrough();

export const ConversationsResponseSchema = z
  .object({
    conversations: z.array(ConversationDocSchema).default([]),
  })
  .passthrough();

export const UnreadResponseSchema = z
  .object({
    unreadCount: z.number(),
  })
  .passthrough();

export const ChatMessageDocSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    conversationId: z.string().optional(),
    // senderId may be a raw id string or a populated user object.
    senderId: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    text: z.string(),
    readBy: z.array(z.string()).optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();

export const MessagesResponseSchema = z
  .object({
    messages: z.array(ChatMessageDocSchema).default([]),
  })
  .passthrough();

/** POST /api/chat/conversations/[id]/messages → wrapped { message }. */
export const PostMessageResponseSchema = z
  .object({
    message: ChatMessageDocSchema,
  })
  .passthrough();

export type ChatParticipant = z.infer<typeof ChatParticipantSchema>;
export type ConversationDoc = z.infer<typeof ConversationDocSchema>;
export type ConversationsResponse = z.infer<typeof ConversationsResponseSchema>;
export type UnreadResponse = z.infer<typeof UnreadResponseSchema>;
export type ChatMessageDoc = z.infer<typeof ChatMessageDocSchema>;
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;
export type PostMessageResponse = z.infer<typeof PostMessageResponseSchema>;
