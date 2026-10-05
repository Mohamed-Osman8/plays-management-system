import 'dotenv/config'
import mongoose from 'mongoose'
import Station from '../models/Station.js'

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI

const stations = [
  ...Array.from({ length: 5 }, (_, index) => ({
    name: `PS4-${String(index + 1).padStart(2, '0')}`,
    type: 'PS4'
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    name: `PS5-${String(index + 1).padStart(2, '0')}`,
    type: 'PS5'
  }))
]

if (!mongoUri) {
  throw new Error('MONGODB_URI or MONGO_URI is required.')
}

async function seedStations() {
  await mongoose.connect(mongoUri)

  for (const station of stations) {
    await Station.findOneAndUpdate(
      { name: station.name, shopId: { $exists: false } },
      { $setOnInsert: { ...station, status: 'available', hardware: { controller: 'healthy', console: 'healthy' } } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    )
  }

  console.log(`Station seed complete: ${stations.length} stations available.`)
}

try {
  await seedStations()
} catch (error) {
  console.error(`Unable to seed stations: ${error.message}`)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
