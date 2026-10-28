import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../models/User.js'
import Shop from '../models/Shop.js'
import SuperAdmin from '../models/SuperAdmin.js'

async function dropLegacyIndexes(model, legacyFields) {
  const indexes = await model.collection.indexes()
  for (const index of indexes) {
    const [field] = Object.keys(index.key)
    if (index.unique && legacyFields.includes(field)) {
      await model.collection.dropIndex(index.name)
      console.log(`Dropped obsolete ${model.modelName} index ${index.name}.`)
    }
  }
}

async function migrateEmailIdentityIndexes() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!mongoUri) throw new Error('MONGODB_URI or MONGO_URI is not configured.')

  try {
    await mongoose.connect(mongoUri)
    await dropLegacyIndexes(User, ['username', 'phone'])
    await dropLegacyIndexes(Shop, ['ownerUsername'])
    await dropLegacyIndexes(SuperAdmin, ['username'])
    await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true })
    await Shop.collection.createIndex({ email: 1 }, { unique: true, sparse: true })
    await SuperAdmin.collection.createIndex({ email: 1 }, { unique: true, sparse: true })
    console.log('Email identity indexes are ready. Assign email addresses to existing users before they sign in.')
  } finally {
    await mongoose.disconnect()
  }
}

migrateEmailIdentityIndexes().catch((error) => {
  console.error('Email identity migration failed:', error.message)
  process.exitCode = 1
})
