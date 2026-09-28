import jwt from 'jsonwebtoken'
import User from '../models/User.js'

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
