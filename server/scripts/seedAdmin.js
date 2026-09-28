import 'dotenv/config'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import User from '../models/User.js'

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

function isValidPin(value) {
  return /^\d{6}$/.test(String(value || ''))
}

async function seedAdmin() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!mongoUri) {
    throw new Error('MONGODB_URI or MONGO_URI is not configured.')
  }

  const username = normalizeUsername(process.env.ADMIN_USERNAME)
  const password = String(process.env.ADMIN_PASSWORD || '')
  const pin = String(process.env.ADMIN_PIN || '')
  const phone = String(process.env.ADMIN_PHONE || '')

  if (!username || !password || !pin || !phone) {
    throw new Error('ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_PIN, and ADMIN_PHONE must be configured.')
  }

  if (!isValidPin(pin)) {
    throw new Error('ADMIN_PIN must be a 6-digit number.')
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters long.')
  }
  if (/^(?:123456|654321|000000|111111|222222|333333|444444|555555|666666|777777|888888|999999)$/.test(pin)) {
    throw new Error('ADMIN_PIN cannot be a common or sequential PIN.')
  }

  try {
    await mongoose.connect(mongoUri)
    const passwordHash = await bcrypt.hash(password, 12)
    const pinHash = await bcrypt.hash(pin, 12)
    const user = await User.findOneAndUpdate(
      { username },
      {
        name: 'Mohamed Osman',
        username,
        phone,
        role: 'Admin',
        passwordHash,
        pinHash,
        loginAttempts: 0,
        lockoutUntil: null
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    console.log(`Updated staff admin ready: ${user.username} (Role: ${user.role})`)
  } finally {
    await mongoose.disconnect()
  }
}

seedAdmin()
  .catch((error) => {
    console.error('Admin seed failed:', error.message)
    process.exitCode = 1
  })