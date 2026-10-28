import 'dotenv/config'
import mongoose from 'mongoose'
import SuperAdmin from './models/SuperAdmin.js'

async function seedSuperAdmin() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI
  const email = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase()
  if (!mongoUri || !email) throw new Error('MONGODB_URI and SUPER_ADMIN_EMAIL must be configured.')

  try {
    await mongoose.connect(mongoUri)
    const superAdmin = await SuperAdmin.findOneAndUpdate(
      { email },
      { $setOnInsert: { email } },
      { upsert: true, new: true, runValidators: true }
    )
    console.log(`Super admin ready: ${superAdmin.email}`)
  } finally {
    await mongoose.disconnect()
  }
}

seedSuperAdmin().catch((error) => {
  console.error('Super admin seed failed:', error.message)
  process.exitCode = 1
})
