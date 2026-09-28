import mongoose from 'mongoose'

const phonePattern = /^\+?[0-9 ]{7,18}$/

const bookingSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    phone: { type: String, required: true, trim: true, match: phonePattern },
    consoleType: { type: String, enum: ['PS4', 'PS5'], required: true },
    stationName: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true },
    arrivalTime: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' }
  },
  { timestamps: true }
)

export default mongoose.model('Booking', bookingSchema)
