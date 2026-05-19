import mongoose, { Schema } from 'mongoose'

export interface IProgramImage {
  programId: string
  contentType: string
  data: Buffer
  createdAt?: Date
  updatedAt?: Date
}

const ProgramImageSchema = new Schema<IProgramImage>({
  programId: { type: String, required: true },
  contentType: { type: String, required: true, default: 'image/jpeg' },
  data: { type: Buffer, required: true },
}, {
  timestamps: true,
})

ProgramImageSchema.index({ programId: 1 }, { unique: true })

export default mongoose.models.ProgramImage || mongoose.model<IProgramImage>('ProgramImage', ProgramImageSchema)
