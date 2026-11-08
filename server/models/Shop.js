import mongoose from 'mongoose'

const shopSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true, maxlength: 120, default: 'Game Zone' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, unique: true, sparse: true },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  address: { type: String, trim: true, maxlength: 240, default: '' },
  ownerPhone: { type: String, trim: true, maxlength: 30 },
  isApproved: { type: Boolean, default: true, index: true },
  status: { type: String, enum: ['unverified', 'pending', 'active', 'inactive', 'rejected'], default: 'active', index: true },
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
  bookingSettings: {
    openTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '09:00' },
    closeTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '23:00' },
    timeZone: { type: String, trim: true, default: 'Africa/Addis_Ababa' },
    slotIntervalMinutes: { type: Number, min: 5, max: 240, default: 30 },
    durationOptionsMinutes: { type: [Number], default: [30, 60, 90, 120] }
  },
  notificationSettings: {
    bookingRequestsEmail: { type: Boolean, default: true },
    bookingUpdatesEmail: { type: Boolean, default: true }
  },
  license: {
    status: { type: String, enum: ['trial', 'active', 'locked', 'suspended'], default: 'active' },
    expiresAt: { type: Date, default: null },
    plan: { type: String, trim: true, default: 'Monthly' }
  }
}, { timestamps: true })

export default mongoose.model('Shop', shopSchema)
