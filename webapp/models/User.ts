import mongoose, { Schema, Model } from 'mongoose';
import bcrypt from 'bcrypt';

export type UserRole = 'user' | 'trainer' | 'admin';

export interface ISavedProgram {
  programId: string;
  savedAt: Date;
  order: number;
}

export interface IUser {
  _id?: string
  email: string
  password: string
  name: string
  role: UserRole
  trainerId?: mongoose.Types.ObjectId | string
  savedPrograms?: ISavedProgram[];
  createdAt?: Date
  updatedAt?: Date
}

interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>
}

type UserModel = Model<IUser, object, IUserMethods>

const SavedProgramSchema = new Schema({
  programId: { type: String, required: true },
  savedAt: { type: Date, default: Date.now },
  order: { type: Number, default: 0 },
}, { _id: false });

const UserSchema = new Schema<IUser, UserModel, IUserMethods>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  role: { type: String, enum: ['user', 'trainer', 'admin'], default: 'user' },
  trainerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  savedPrograms: [SavedProgramSchema],
}, {
  timestamps: true,
})

// Hash password before saving
UserSchema.pre('save', async function() {
  if (!this.isModified('password')) return
  
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
})

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword: string) {
  return bcrypt.compare(candidatePassword, this.password)
}

export default mongoose.models.User || mongoose.model<IUser, UserModel>('User', UserSchema)