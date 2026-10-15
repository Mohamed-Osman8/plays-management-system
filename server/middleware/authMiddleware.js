import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Shop from '../models/Shop.js'

const PENDING_SHOP_MESSAGE = 'Akoonkaaga wali ma firfircona. Fadlan kala xiriir maamulka Mohamed Osman (+251940867287) si loo kordhiyo/loo firfircooneeyo.'
const INACTIVE_SHOP_MESSAGE = 'Akoonka dukaankan lama hawlgelin ama waa la hakiyey. Fadlan kala xiriir Mohamed Osman (+251940867287).'

function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (normalized === 'admin' || normalized === 'owner/admin' || normalized === 'owneradmin') return 'Admin'
  if (normalized === 'cashier' || normalized === 'cashier/staff' || normalized === 'cashierstaff') return 'Cashier'
  return ''
}

export async function verifyStaff(req, res, next) {
  const authorization = req.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(\S+)$/i)
  if (!match) {
    return res.status(401).json({ message: 'Staff authentication is required.' })
  }

  let claims
  try {
    claims = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return res.status(401).json({ message: 'Invalid or expired staff token.' })
  }

  try {
    const user = await User.findById(claims.sub)
    if (!user || !normalizeRole(user.role)) return res.status(401).json({ message: 'Invalid staff identity.' })
    if (user.shopId) {
      const shop = await Shop.findById(user.shopId).select('isApproved status')
      if (!shop) return res.status(403).json({ code: 'SHOP_NOT_ACTIVE', message: 'This account is not linked to an active shop.' })
      if (shop.status === 'inactive' || shop.status === 'rejected') {
        return res.status(403).json({ code: 'SHOP_INACTIVE', message: INACTIVE_SHOP_MESSAGE })
      }
      if (shop.isApproved === false || shop.status === 'pending') {
        return res.status(403).json({ code: 'SHOP_PENDING_APPROVAL', message: PENDING_SHOP_MESSAGE })
      }
    }
    req.user = user
    req.auth = claims
    return next()
  } catch (error) {
    return next(error)
  }
}

export function verifyAdmin(req, res, next) {
  const role = normalizeRole(req.user?.role)
  if (role !== 'Admin') {
    return res.status(403).json({ message: 'Admin access is required.' })
  }
  return next()
}

export function verifyCashierOrAdmin(req, res, next) {
  const role = normalizeRole(req.user?.role)
  if (!['Admin', 'Cashier'].includes(role)) {
    return res.status(403).json({ message: 'Staff access is required.' })
  }
  return next()
}
