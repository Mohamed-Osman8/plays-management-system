import mongoose from 'mongoose'

const shopSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true, maxlength: 120, default: 'Game Zone' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, unique: true, sparse: true },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  address: { type: String, trim: true, maxlength: 240, default: '' },
  ownerPhone: { type: String, trim: true, maxlength: 30 },
  isApproved: { type: Boolean, default: true, index: true },
  status: { type: String, enum: ['pending', 'active', 'inactive', 'rejected'], default: 'active', index: true },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SuperAdmin', default: null },
  approvedByEmail: { type: String, trim: true, lowercase: true, default: '' },
  approvalNotes: { type: String, trim: true, maxlength: 500, default: '' },
  rates: {
    ps4: { type: Number, min: 0, default: 0.12 },
    ps5: { type: Number, min: 0, default: 0.18 },
    vip: { type: Number, min: 0, default: 0.25 },
    other: { type: Number, min: 0, default: 0.1 }
  },
  license: {
    status: { type: String, enum: ['trial', 'active', 'locked', 'suspended'], default: 'active' },
    expiresAt: { type: Date, default: null },
    plan: { type: String, trim: true, default: 'Monthly' }
  }
}, { timestamps: true })

export default mongoose.model('Shop', shopSchema)
