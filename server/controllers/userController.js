import bcrypt from 'bcryptjs'
import User from '../models/User.js'

const pinPattern = /^\d{6}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email || '',
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
    const { name, phone = '', pin, password, role = 'Cashier' } = req.body
    const email = String(req.body.email || '').trim().toLowerCase()
    const credential = String(password || pin || '')

    if (!name || email.length > 254 || !emailPattern.test(email)) {
      return res.status(400).json({ message: 'Name and a valid email address are required.' })
    }
    if (!pinPattern.test(credential)) {
      return res.status(400).json({ message: 'PIN must contain exactly 6 digits.' })
    }
    if (!['Admin', 'Cashier'].includes(role)) {
      return res.status(400).json({ message: 'Role must be Admin or Cashier.' })
    }

    if (await User.exists({ email })) return res.status(409).json({ message: 'Email address is already in use.' })

    const hash = await bcrypt.hash(credential, 12)
    const user = await User.create({
      name,
      email,
      phone: String(phone || '').trim(),
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
    if (req.body.email !== undefined) {
      updates.email = String(req.body.email).trim().toLowerCase()
      if (updates.email.length > 254 || !emailPattern.test(updates.email)) return res.status(400).json({ message: 'Enter a valid email address.' })
    }
    if (req.body.phone !== undefined) {
      updates.phone = String(req.body.phone).trim()
      if (updates.phone.length > 30) return res.status(400).json({ message: 'Phone number must be 30 characters or fewer.' })
    }
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
    if (updates.email) {
      const existing = await User.findOne({ email: updates.email, _id: { $ne: req.params.id } })
      if (existing) return res.status(409).json({ message: 'Email address is already in use.' })
    }
    const user = await User.findOneAndUpdate(filter, updates, { new: true, runValidators: true })
    if (!user) return res.status(404).json({ message: 'User not found.' })
    return res.json({ user: publicUser(user) })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Email address is already in use.' })
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
