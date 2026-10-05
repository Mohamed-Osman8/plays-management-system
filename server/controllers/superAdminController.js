import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import Shop from '../models/Shop.js'

function safeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function superAdminLogin(req, res) {
  const username = process.env.SUPER_ADMIN_USERNAME
  const password = process.env.SUPER_ADMIN_PASSWORD
  if (!username || !password) return res.status(503).json({ message: 'Super admin credentials are not configured.' })
  if (!safeEqual(req.body?.username || '', username) || !safeEqual(req.body?.password || '', password)) {
    return res.status(401).json({ message: 'Invalid super admin credentials.' })
  }
  const token = jwt.sign({ role: 'SuperAdmin', username }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '4h' })
  return res.json({ token })
}

export async function listShops(_req, res, next) {
  try {
    const shops = await Shop.find().select('name phone ownerPhone ownerUsername license createdAt').sort({ createdAt: -1 }).lean()
    return res.json({ shops })
  } catch (error) {
    return next(error)
  }
}

export async function extendShopLicense(req, res, next) {
  try {
    const shop = await Shop.findById(req.params.id)
    if (!shop) return res.status(404).json({ message: 'Shop not found.' })
    const base = shop.license.expiresAt && shop.license.expiresAt > new Date() ? shop.license.expiresAt : new Date()
    const expiresAt = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)
    shop.license.expiresAt = expiresAt
    shop.license.status = 'active'
    shop.license.plan = 'Monthly'
    await shop.save()
    return res.json({ shop })
  } catch (error) {
    return next(error)
  }
}

export async function setShopLock(req, res, next) {
  try {
    const { locked } = req.body || {}
    if (typeof locked !== 'boolean') return res.status(400).json({ message: 'locked must be a boolean.' })
    const shop = await Shop.findByIdAndUpdate(
      req.params.id,
      { $set: { 'license.status': locked ? 'locked' : 'active' } },
      { new: true, runValidators: true }
    )
    if (!shop) return res.status(404).json({ message: 'Shop not found.' })
    return res.json({ shop })
  } catch (error) {
    return next(error)
  }
}
