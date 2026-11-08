import mongoose from 'mongoose'
import { randomBytes } from 'node:crypto'
import { tenantPlugin } from '../config/tenantContext.js'

const phonePattern = /^\+?[0-9 ]{7,18}$/
const bookingStatuses = ['Pending', 'Confirmed', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show']
const paymentStatuses = ['Unpaid', 'Partially Paid', 'Paid', 'Refunded']

export function normalizeBookingStatus(status) {
  if (status === 'Approved') return 'Confirmed'
  if (status === 'Rejected') return 'Cancelled'
  return status
}

const bookingSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    phone: { type: String, required: true, trim: true, match: phonePattern },
    customerEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    consoleType: { type: String, enum: ['PS4', 'PS5', 'VIP', 'Other'], required: true },
    station: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', default: null, index: true },
    stationName: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true },
    arrivalTime: { type: String, required: true, trim: true },
    startsAt: { type: Date, default: null, index: true },
    endsAt: { type: Date, default: null },
    timeZone: { type: String, default: '' },
    durationMinutes: { type: Number, min: 1, default: null },
    hourlyRate: { type: Number, min: 0, default: null },
    totalPrice: { type: Number, min: 0, default: null },
    finalPrice: { type: Number, min: 0, default: null },
    status: { type: String, enum: bookingStatuses, default: 'Pending', index: true, set: normalizeBookingStatus },
    paymentStatus: { type: String, enum: paymentStatuses, default: 'Unpaid' },
    amountPaid: { type: Number, min: 0, default: 0 },
    paymentMethod: { type: String, trim: true, default: '' },
    paidAt: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'PlaySession', default: null },
    confirmation: { type: String, required: true }
  },
  { timestamps: true }
)

bookingSchema.plugin(tenantPlugin)
bookingSchema.index({ shopId: 1, station: 1, startsAt: 1, endsAt: 1, status: 1 }, { name: 'shop_station_booking_window' })
bookingSchema.index({ confirmation: 1 }, {
  unique: true,
  partialFilterExpression: { confirmation: { $type: 'string' } },
  name: 'unique_booking_confirmation'
})
bookingSchema.pre('validate', function setConfirmation() {
  this.status = normalizeBookingStatus(this.status)
  if (!this.confirmation) this.confirmation = `PGZ-${randomBytes(5).toString('hex').toUpperCase()}`
})

export { bookingStatuses, paymentStatuses }
export default mongoose.model('Booking', bookingSchema)
