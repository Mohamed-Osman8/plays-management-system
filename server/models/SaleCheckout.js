import mongoose from 'mongoose'
import { tenantPlugin } from '../config/tenantContext.js'

const tenderSchema = new mongoose.Schema(
  {
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'mobile_money', 'bank', 'membership', 'other'],
      required: true
    },
    amount: { type: Number, required: true, min: 0.01 }
  },
  { _id: false }
)

const saleCheckoutSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    grossTotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['cash', 'card', 'mobile_money', 'bank', 'membership', 'other', 'mixed'], required: true },
    payments: { type: [tenderSchema], required: true, validate: (items) => items.length > 0 },
    soldAt: { type: Date, default: Date.now, index: true },
    soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'PlaySession', default: null }
  },
  { timestamps: true }
)

saleCheckoutSchema.plugin(tenantPlugin)
export default mongoose.model('SaleCheckout', saleCheckoutSchema)
