import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema({
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  amount: { type: Number, required: true, min: 0, default: 3000 },
  paymentMethod: { type: String, required: true, trim: true, enum: ['Telebirr', 'E-Birr', 'CBE Bank Transfer'] },
  transactionReference: { type: String, required: true, trim: true, maxlength: 120, unique: true },
  monthsRequested: { type: Number, required: true, min: 1, max: 12, default: 1 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  submittedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SuperAdmin', default: null },
  approvedByUsername: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, maxlength: 500, default: '' }
}, { timestamps: true })

paymentSchema.index({ shop: 1, submittedAt: -1 })
paymentSchema.index({ status: 1, submittedAt: -1 })

export default mongoose.model('Payment', paymentSchema)
