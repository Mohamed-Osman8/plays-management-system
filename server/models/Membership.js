import mongoose from 'mongoose'
import { tenantPlugin } from '../config/tenantContext.js'

const membershipSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 30, index: true },
    plan: { type: String, enum: ['monthly', 'yearly'], required: true },
    price: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, trim: true, maxlength: 40, default: '' },
    startsAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active', index: true },
    notes: { type: String, trim: true, maxlength: 500, default: '' }
  },
  { timestamps: true }
)

membershipSchema.index({ expiresAt: 1, status: 1 })
membershipSchema.plugin(tenantPlugin)

export default mongoose.model('Membership', membershipSchema)
