import mongoose from 'mongoose'
import { tenantPlugin } from '../config/tenantContext.js'

const customerBalanceSchema = new mongoose.Schema({
  customerName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  phone: { type: String, required: true, trim: true, match: /^\+?[0-9 ]{7,18}$/ },
  amount: { type: Number, required: true, min: 0.01 },
  amountPaid: { type: Number, default: 0, min: 0 }
}, { timestamps: true })

customerBalanceSchema.index({ shopId: 1, createdAt: -1 }, { name: 'shop_customer_balances' })
customerBalanceSchema.plugin(tenantPlugin)

export default mongoose.model('CustomerBalance', customerBalanceSchema)
