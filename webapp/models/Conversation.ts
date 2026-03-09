import mongoose, { Schema } from 'mongoose';

export interface IConversation {
  _id?: string;
  type: 'direct' | 'group';
  participants: mongoose.Types.ObjectId[];
  name?: string;
  lastMessage?: {
    text: string;
    senderId: mongoose.Types.ObjectId;
    sentAt: Date;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const ConversationSchema = new Schema<IConversation>({
  type: { type: String, enum: ['direct', 'group'], default: 'direct' },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  name: { type: String },
  lastMessage: {
    text: String,
    senderId: { type: Schema.Types.ObjectId, ref: 'User' },
    sentAt: Date,
  },
}, { timestamps: true });

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ updatedAt: -1 });

export default mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);
