import mongoose, { Schema } from 'mongoose';

export interface IMessage {
  _id?: string;
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  text: string;
  /** Same-origin blob URL (/api/blob/...) for an image or GIF attachment. */
  imageUrl?: string;
  readBy: mongoose.Types.ObjectId[];
  createdAt?: Date;
}

const MessageSchema = new Schema<IMessage>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // text is optional — a message may be image-only (route enforces text || imageUrl).
  text: { type: String, default: '', maxlength: 5000 },
  imageUrl: { type: String },
  readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

MessageSchema.index({ conversationId: 1, createdAt: -1 });

export default mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
