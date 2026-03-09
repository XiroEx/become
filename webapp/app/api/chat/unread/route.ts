import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { verifyAuth } from '@/lib/auth';
import Conversation from '@/models/Conversation';
import Message from '@/models/Message';

// GET /api/chat/unread — total unread count across all conversations
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  await dbConnect();

  const userId = new mongoose.Types.ObjectId(auth.userId);

  // Get all conversation IDs for this user
  const conversations = await Conversation.find({ participants: userId })
    .select('_id')
    .lean();

  const conversationIds = conversations.map((c) => c._id);

  if (conversationIds.length === 0) {
    return NextResponse.json({ unreadCount: 0 });
  }

  // Count unread messages across all conversations
  const unreadCount = await Message.countDocuments({
    conversationId: { $in: conversationIds },
    readBy: { $ne: userId },
    senderId: { $ne: userId },
  });

  return NextResponse.json({ unreadCount });
}
