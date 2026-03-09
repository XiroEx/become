import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import Conversation from '@/models/Conversation';
import Message from '@/models/Message';
import User from '@/models/User';

// GET /api/chat/conversations — list all conversations for the user
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  await dbConnect();

  const userId = new mongoose.Types.ObjectId(auth.userId);

  const conversations = await Conversation.find({ participants: userId })
    .populate('participants', 'name email role')
    .sort({ updatedAt: -1 })
    .lean();

  // Get unread counts for each conversation
  const conversationsWithUnread = await Promise.all(
    conversations.map(async (conv) => {
      const unreadCount = await Message.countDocuments({
        conversationId: conv._id,
        readBy: { $ne: userId },
        senderId: { $ne: userId },
      });
      return { ...conv, unreadCount };
    })
  );

  return NextResponse.json({ conversations: conversationsWithUnread });
}

// POST /api/chat/conversations — create or find direct conversation
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  await dbConnect();

  const body = await request.json();
  const { participantId } = body;

  if (!participantId) {
    return NextResponse.json({ error: 'participantId is required' }, { status: 400 });
  }

  // Verify participant exists
  const participant = await User.findById(participantId).select('name email').lean();
  if (!participant) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const userId = new mongoose.Types.ObjectId(auth.userId);
  const otherUserId = new mongoose.Types.ObjectId(participantId);

  // Check if a direct conversation already exists between these two users
  let conversation = await Conversation.findOne({
    type: 'direct',
    participants: { $all: [userId, otherUserId], $size: 2 },
  })
    .populate('participants', 'name email role')
    .lean();

  if (conversation) {
    return NextResponse.json({ conversation });
  }

  // Create a new conversation
  const newConv = await Conversation.create({
    type: 'direct',
    participants: [userId, otherUserId],
  });

  conversation = await Conversation.findById(newConv._id)
    .populate('participants', 'name email role')
    .lean();

  return NextResponse.json({ conversation }, { status: 201 });
}
