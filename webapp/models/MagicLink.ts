import mongoose, { Schema, Document, Model } from 'mongoose'
import crypto from 'crypto'

export interface IMagicLink extends Document {
  email: string
  token: string
  mode: 'login' | 'register'
  name?: string
  expiresAt: Date
  used: boolean
  createdAt: Date
}

type MagicLinkModel = Model<IMagicLink>

const MagicLinkSchema = new Schema<IMagicLink, MagicLinkModel>({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  mode: {
    type: String,
    enum: ['login', 'register'],
    required: true,
  },
  name: {
    type: String,
    trim: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  used: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
})

// Auto-delete expired tokens
MagicLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Generate a secure token
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Create a magic link with 15 minute expiration
export async function createMagicLink(email: string, mode: 'login' | 'register', name?: string): Promise<IMagicLink> {
  const MagicLink = mongoose.models.MagicLink || mongoose.model<IMagicLink, MagicLinkModel>('MagicLink', MagicLinkSchema)
  
  // Invalidate any existing unused tokens for this email
  await MagicLink.updateMany(
    { email, used: false },
    { used: true }
  )
  
  const token = generateToken()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
  
  const magicLink = new MagicLink({
    email,
    token,
    mode,
    name,
    expiresAt,
    used: false,
  })
  
  await magicLink.save()
  return magicLink
}

// Verify and consume a magic link
export async function verifyMagicLink(token: string): Promise<IMagicLink | null> {
  const MagicLink = mongoose.models.MagicLink || mongoose.model<IMagicLink, MagicLinkModel>('MagicLink', MagicLinkSchema)
  
  const magicLink = await MagicLink.findOne({
    token,
    used: false,
    expiresAt: { $gt: new Date() },
  })
  
  if (!magicLink) {
    return null
  }
  
  // Mark as used
  magicLink.used = true
  await magicLink.save()
  
  return magicLink
}

const MagicLink = mongoose.models.MagicLink || mongoose.model<IMagicLink, MagicLinkModel>('MagicLink', MagicLinkSchema)

export default MagicLink
