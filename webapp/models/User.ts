import mongoose, { Schema, Model } from 'mongoose';
import bcrypt from 'bcrypt';

export type UserRole = 'user' | 'trainer' | 'admin';
export type FitnessGoal = 'lose_weight' | 'gain_muscle' | 'maintain' | 'improve_performance' | 'general_health';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say';
export type EquipmentType = 'none' | 'dumbbells' | 'barbell' | 'cables' | 'full_gym';

export interface ISavedProgram {
  programId: string;
  savedAt: Date;
  order: number;
}

export interface IUserProfile {
  fitnessGoal?: FitnessGoal;
  experienceLevel?: ExperienceLevel;
  age?: number;
  biologicalSex?: BiologicalSex;
  heightCm?: number;
  currentWeightKg?: number;
  targetWeightKg?: number;
  equipmentAccess?: EquipmentType[];
  injuryNotes?: string;
  weeklyAvailability?: number;
}

export interface IUser {
  _id?: string
  email: string
  password: string
  name: string
  role: UserRole
  trainerId?: mongoose.Types.ObjectId | string
  savedPrograms?: ISavedProgram[];
  profile?: IUserProfile;
  onboardingCompleted?: boolean;
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

const UserProfileSchema = new Schema({
  fitnessGoal: { type: String, enum: ['lose_weight', 'gain_muscle', 'maintain', 'improve_performance', 'general_health'] },
  experienceLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
  age: { type: Number },
  biologicalSex: { type: String, enum: ['male', 'female', 'prefer_not_to_say'] },
  heightCm: { type: Number },
  currentWeightKg: { type: Number },
  targetWeightKg: { type: Number },
  equipmentAccess: [{ type: String, enum: ['none', 'dumbbells', 'barbell', 'cables', 'full_gym'] }],
  injuryNotes: { type: String },
  weeklyAvailability: { type: Number, min: 1, max: 7 },
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
  profile: { type: UserProfileSchema, default: {} },
  onboardingCompleted: { type: Boolean, default: false },
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