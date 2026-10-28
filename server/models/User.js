import mongoose from 'mongoose'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const pinPattern = /^\d{6}$/

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, unique: true, sparse: true, trim: true, lowercase: true, maxlength: 254, match: emailPattern },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    role: { type: String, enum: ['Admin', 'Cashier'], required: true, default: 'Cashier' },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', index: true },
    passwordHash: { type: String, required: true, select: false },
    pinHash: { type: String, required: true, select: false },
    resetOtp: { type: String, default: null, select: false },
    resetOtpExpires: { type: Date, default: null, select: false },
    resetOtpRequestedAt: { type: Date, default: null, select: false },
    resetOtpAttempts: { type: Number, default: 0, min: 0, select: false },
    loginAttempts: { type: Number, default: 0, min: 0 },
    lockoutUntil: { type: Date, default: null }
  },
  { timestamps: true }
)

userSchema.statics.validatePin = (pin) => pinPattern.test(pin)

export default mongoose.model('User', userSchema)
