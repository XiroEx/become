import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import Conversation from '@/models/Conversation';
import Message from '@/models/Message';
import UserProgress from '@/models/UserProgress';
import { sendPushToUser } from '@/lib/pushNotification';

// GET /api/chat/conversations/[conversationId]/messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  await dbConnect();

  const { conversationId } = await params;
  const userId = new mongoose.Types.ObjectId(auth.userId);

  // Verify user is a participant
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  }).lean();

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Build query for pagination
  const { searchParams } = new URL(request.url);
  const before = searchParams.get('before');

  const query: Record<string, unknown> = { conversationId: new mongoose.Types.ObjectId(conversationId) };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('senderId', 'name email')
    .lean();

  // Mark all unread messages in this conversation as read by this user
  await Message.updateMany(
    {
      conversationId: new mongoose.Types.ObjectId(conversationId),
      readBy: { $ne: userId },
      senderId: { $ne: userId },
    },
    { $addToSet: { readBy: userId } }
  );

  return NextResponse.json({ messages: messages.reverse() });
}

// POST /api/chat/conversations/[conversationId]/messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  await dbConnect();

  const { conversationId } = await params;
  const userId = new mongoose.Types.ObjectId(auth.userId);

  // Verify user is a participant
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const body = await request.json();
  const { text, imageUrl } = body as { text?: string; imageUrl?: string };

  const hasText = typeof text === 'string' && text.trim().length > 0;
  // Only accept our own blob URLs as attachments (no arbitrary external URLs).
  const hasImage = typeof imageUrl === 'string' && imageUrl.startsWith('/api/blob/');

  if (!hasText && !hasImage) {
    return NextResponse.json({ error: 'Message text or image is required' }, { status: 400 });
  }
  if (hasText && text!.length > 5000) {
    return NextResponse.json({ error: 'Message too long (max 5000 characters)' }, { status: 400 });
  }

  const cleanText = hasText ? text!.trim() : '';

  // Create the message
  const message = await Message.create({
    conversationId: new mongoose.Types.ObjectId(conversationId),
    senderId: userId,
    text: cleanText,
    ...(hasImage ? { imageUrl } : {}),
    readBy: [userId], // sender has read their own message
  });

  // Update conversation's lastMessage (photo placeholder when image-only)
  const lastText = cleanText ? cleanText.substring(0, 100) : '📷 Photo';
  conversation.lastMessage = {
    text: lastText,
    senderId: userId,
    sentAt: new Date(),
  };
  await conversation.save();

  // Populate sender info for response
  const populated = await Message.findById(message._id)
    .populate('senderId', 'name email')
    .lean();

  // Notify the other participants (push), respecting their chatMessage pref.
  try {
    const senderName =
      (populated?.senderId as unknown as { name?: string })?.name || 'New message'
    const recipientIds: string[] = conversation.participants
      .map((p: mongoose.Types.ObjectId) => String(p))
      .filter((id: string) => id !== String(auth.userId))
    if (recipientIds.length > 0) {
      // chatMessage defaults ON — only skip users who explicitly opted out.
      const optedOut = await UserProgress.find({
        userId: { $in: recipientIds },
        'notificationPrefs.chatMessage': false,
      })
        .select('userId')
        .lean()
      const optedOutIds = new Set(optedOut.map((p: { userId: unknown }) => String(p.userId)))
      const targets = recipientIds.filter((id: string) => !optedOutIds.has(id))
      const preview = cleanText
        ? (cleanText.length > 120 ? cleanText.slice(0, 117) + '…' : cleanText)
        : '📷 Photo'
      await Promise.allSettled(
        targets.map((id: string) =>
          sendPushToUser(id, {
            title: senderName,
            body: preview,
            url: '/dashboard/chat',
            tag: `chat-${conversationId}`,
          }),
        ),
      )
    }
  } catch (err) {
    console.error('chat push error:', err) // best-effort; never block the send
  }

  return NextResponse.json({ message: populated }, { status: 201 });
}
