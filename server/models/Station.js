import mongoose from 'mongoose'
import { tenantPlugin } from '../config/tenantContext.js'

const stationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
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

stationSchema.index({ shopId: 1, name: 1 }, { unique: true, name: 'shop_station_name_unique' })
stationSchema.plugin(tenantPlugin)
export default mongoose.model('Station', stationSchema)
