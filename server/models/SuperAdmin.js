import mongoose from 'mongoose'

const superAdminSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, sparse: true }
}, { timestamps: true })

export default mongoose.model('SuperAdmin', superAdminSchema)
