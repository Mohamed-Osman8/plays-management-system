import jwt from 'jsonwebtoken'

export function requireSuperAdmin(req, res, next) {
  const authorization = req.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(\S+)$/i)
  if (!match) return res.status(401).json({ message: 'Super admin authentication is required.' })
  try {
    const claims = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] })
    if (claims.role !== 'SuperAdmin') return res.status(403).json({ message: 'Super admin access is required.' })
    req.superAdmin = claims
    return next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired super admin token.' })
  }
}
