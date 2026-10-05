import bcrypt from 'bcryptjs'
import User from '../models/User.js'

const phonePattern = /^\+?[0-9 ]{7,18}$/
const pinPattern = /^\d{6}$/

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    username: user.username,
    phone: user.phone,
    role: user.role,
    loginAttempts: user.loginAttempts,
    lockoutUntil: user.lockoutUntil
  }
}

export async function listUsers(_req, res, next) {
  try {
    const filter = _req.user?.shopId ? { shopId: _req.user.shopId } : { shopId: { $exists: false } }
    const users = await User.find(filter).sort({ createdAt: -1 })
    return res.json({ users: users.map(publicUser) })
  } catch (error) {
    return next(error)
  }
}

export async function createUser(req, res, next) {
  try {
    const { name, username, phone, pin, password, role = 'Cashier' } = req.body
    const normalizedUsername = String(username || '').trim().toLowerCase()
    const normalizedPhone = String(phone || '').trim()
    const credential = String(password || pin || '')

    if (!name || !normalizedUsername || !phonePattern.test(normalizedPhone)) {
      return res.status(400).json({ message: 'Name, username, and a valid phone number are required.' })
    }
    if (!pinPattern.test(credential)) {
      return res.status(400).json({ message: 'PIN must contain exactly 6 digits.' })
    }
    if (!['Admin', 'Cashier'].includes(role)) {
      return res.status(400).json({ message: 'Role must be Admin or Cashier.' })
    }

    const existing = await User.findOne({ $or: [{ username: normalizedUsername }, { phone: normalizedPhone }] })
    if (existing) return res.status(409).json({ message: 'Username or phone number is already in use.' })

    const hash = await bcrypt.hash(credential, 12)
    const user = await User.create({
      name,
      username: normalizedUsername,
      phone: normalizedPhone,
      role,
      shopId: req.user?.shopId,
      passwordHash: hash,
      pinHash: hash
    })
    return res.status(201).json({ user: publicUser(user) })
  } catch (error) {
    return next(error)
  }
}

export async function updateUser(req, res, next) {
  try {
    const updates = {}
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim()
    if (req.body.phone !== undefined) {
      updates.phone = String(req.body.phone).trim()
      if (!phonePattern.test(updates.phone)) return res.status(400).json({ message: 'Phone number must contain numbers only.' })
    }
    if (req.body.username !== undefined) updates.username = String(req.body.username).trim().toLowerCase()
    if (req.body.role !== undefined) {
      if (!['Admin', 'Cashier'].includes(req.body.role)) return res.status(400).json({ message: 'Role must be Admin or Cashier.' })
      updates.role = req.body.role
    }
    const newPin = req.body.pin ?? req.body.password
    if (newPin !== undefined) {
      if (!pinPattern.test(String(newPin))) return res.status(400).json({ message: 'PIN must contain exactly 6 digits.' })
      const hash = await bcrypt.hash(String(newPin), 12)
      updates.passwordHash = hash
      updates.pinHash = hash
    }

    const filter = req.user?.shopId ? { _id: req.params.id, shopId: req.user.shopId } : { _id: req.params.id, shopId: { $exists: false } }
    const user = await User.findOneAndUpdate(filter, updates, { new: true, runValidators: true })
    if (!user) return res.status(404).json({ message: 'User not found.' })
    return res.json({ user: publicUser(user) })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Username or phone number is already in use.' })
    return next(error)
  }
}

export async function deleteUser(req, res, next) {
  try {
    if (String(req.user._id) === req.params.id) return res.status(400).json({ message: 'You cannot delete your own account.' })
    const filter = req.user?.shopId ? { _id: req.params.id, shopId: req.user.shopId } : { _id: req.params.id, shopId: { $exists: false } }
    const user = await User.findOne(filter)
    if (!user) return res.status(404).json({ message: 'User not found.' })
    if (user.role !== 'Cashier') return res.status(403).json({ message: 'Only cashier accounts can be deleted.' })
    await user.deleteOne()
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}
