import mongoose from 'mongoose'

const stationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ['PS4', 'PS5'], required: true },
    status: { type: String, enum: ['available', 'playing', 'reserved', 'maintenance'], default: 'available' },
    hourlyRate: { type: Number, min: 0, default: 10 },
    maintenanceReason: { type: String, trim: true, maxlength: 500, default: '' },
    hardware: {
      controller: { type: String, enum: ['healthy', 'needs_attention', 'offline'], default: 'healthy' },
      console: { type: String, enum: ['healthy', 'needs_attention', 'offline'], default: 'healthy' }
    }
  },
  { timestamps: true }
)

export default mongoose.model('Station', stationSchema)
