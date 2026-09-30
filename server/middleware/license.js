import Shop from '../models/Shop.js'

export async function verifyLicense(req, res, next) {
  try {
    const shop = await Shop.findOne().lean()
    const envExpiry = process.env.LICENSE_EXPIRES_AT ? new Date(process.env.LICENSE_EXPIRES_AT) : null
    const expiresAt = shop?.license?.expiresAt || envExpiry
    const expired = expiresAt && !Number.isNaN(new Date(expiresAt).getTime()) && new Date(expiresAt) < new Date()
    const suspended = shop?.license?.status === 'suspended'
    if (expired || suspended) {
      return res.status(402).json({ code: 'LICENSE_REQUIRED', message: 'Fadlan la xiriir maamulaha si loo cusboonaysiiyo liisankaaga.' })
    }
    req.shop = shop
    return next()
  } catch (error) {
    return next(error)
  }
}
