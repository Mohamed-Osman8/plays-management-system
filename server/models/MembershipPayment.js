import mongoose from 'mongoose'
import { tenantPlugin } from '../config/tenantContext.js'

const membershipPaymentSchema = new mongoose.Schema(
  {
    membership: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['cash', 'card', 'mobile_money', 'bank', 'other'], required: true },
    paidAt: { type: Date, default: Date.now, index: true },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
)

membershipPaymentSchema.plugin(tenantPlugin)
export default mongoose.model('MembershipPayment', membershipPaymentSchema)
