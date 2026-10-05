import mongoose from 'mongoose'

const phonePattern = /^\+?[0-9 ]{7,18}$/
const pinPattern = /^\d{6}$/

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 50 },
    phone: { type: String, required: true, unique: true, trim: true, match: phonePattern },
    role: { type: String, enum: ['Admin', 'Cashier'], required: true, default: 'Cashier' },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', index: true },
    passwordHash: { type: String, required: true, select: false },
    pinHash: { type: String, required: true, select: false },
    loginAttempts: { type: Number, default: 0, min: 0 },
    lockoutUntil: { type: Date, default: null }
  },
  { timestamps: true }
)

userSchema.statics.validatePin = (pin) => pinPattern.test(pin)

export default mongoose.model('User', userSchema)
