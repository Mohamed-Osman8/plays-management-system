import mongoose from 'mongoose'
import { tenantPlugin } from '../config/tenantContext.js'

const paymentMethods = ['cash', 'card', 'mobile_money', 'bank', 'membership', 'other']

const playSessionSchema = new mongoose.Schema(
  {
    station: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', required: true, index: true },
    stationName: { type: String, required: true, trim: true },
    customerName: { type: String, trim: true, maxlength: 100, default: 'Walk-in player' },
    customerPhone: { type: String, trim: true, maxlength: 30 },
    sessionType: { type: String, trim: true, maxlength: 40, default: 'Hourly' },
    hourlyRate: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'paused', 'completed', 'cancelled', 'reversed'], default: 'active', index: true },
    startedAt: { type: Date, required: true, default: Date.now, index: true },
    pausedAt: { type: Date, default: null },
    pausedDurationMs: { type: Number, min: 0, default: 0 },
    endedAt: { type: Date, default: null },
    playedHours: { type: Number, min: 0, default: 0 },
    revenue: { type: Number, min: 0, default: 0 },
    paymentMethod: { type: String, enum: paymentMethods, default: null },
    paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reversalReason: { type: String, trim: true, maxlength: 500, default: '' }
  },
  { timestamps: true }
)

playSessionSchema.index({ station: 1, status: 1 })
playSessionSchema.plugin(tenantPlugin)

export const SESSION_PAYMENT_METHODS = paymentMethods
export default mongoose.model('PlaySession', playSessionSchema)
