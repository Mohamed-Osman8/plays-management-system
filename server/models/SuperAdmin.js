import mongoose from 'mongoose'

const superAdminSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, lowercase: true, unique: true }
}, { timestamps: true })

export default mongoose.model('SuperAdmin', superAdminSchema)
