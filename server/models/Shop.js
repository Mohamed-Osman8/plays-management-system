import mongoose from 'mongoose'

const shopSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true, maxlength: 120, default: 'Game Zone' },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  address: { type: String, trim: true, maxlength: 240, default: '' },
  rates: {
    ps4: { type: Number, min: 0, default: 0.12 },
    ps5: { type: Number, min: 0, default: 0.18 },
    vip: { type: Number, min: 0, default: 0.25 },
    other: { type: Number, min: 0, default: 0.1 }
  },
  license: {
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    expiresAt: { type: Date, default: null },
    plan: { type: String, trim: true, default: 'Monthly' }
  }
}, { timestamps: true })

export default mongoose.model('Shop', shopSchema)
