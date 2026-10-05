import Shop from '../models/Shop.js'
import { runWithTenant } from '../config/tenantContext.js'

export async function verifyLicense(req, res, next) {
  try {
    const shop = req.user?.shopId
      ? await Shop.findById(req.user.shopId).lean()
      : await Shop.findOne({ ownerUsername: { $exists: false } }).lean()
    if (req.user?.shopId && !shop) {
      return res.status(403).json({ message: 'This account is not linked to an active shop.' })
    }
    const envExpiry = process.env.LICENSE_EXPIRES_AT ? new Date(process.env.LICENSE_EXPIRES_AT) : null
    const expiresAt = shop?.license?.expiresAt || envExpiry
    const expired = expiresAt && !Number.isNaN(new Date(expiresAt).getTime()) && new Date(expiresAt) < new Date()
    const suspended = ['locked', 'suspended'].includes(shop?.license?.status)
    if (expired || suspended) {
      return res.status(402).json({ code: 'LICENSE_REQUIRED', message: 'Fadlan la xiriir maamulaha si loo cusboonaysiiyo liisankaaga.' })
    }
    req.shop = shop
    return runWithTenant(shop?._id || null, next)
  } catch (error) {
    return next(error)
  }
}
