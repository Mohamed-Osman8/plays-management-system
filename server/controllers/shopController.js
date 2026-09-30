import Shop from '../models/Shop.js'

const defaultShop = {
  name: process.env.SHOP_NAME || 'Game Zone',
  phone: process.env.SHOP_PHONE || '',
  address: process.env.SHOP_ADDRESS || ''
}

export async function getShopSettings(_req, res, next) {
  try {
    const shop = await Shop.findOneAndUpdate({}, { $setOnInsert: defaultShop }, { new: true, upsert: true, setDefaultsOnInsert: true })
    return res.json({ shop })
  } catch (error) {
    return next(error)
  }
}

export async function updateShopSettings(req, res, next) {
  try {
    const allowed = ['name', 'phone', 'address']
    const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)))
    if (updates.name !== undefined && !String(updates.name).trim()) return res.status(400).json({ message: 'Shop name is required.' })
    for (const key of ['name', 'phone', 'address']) if (updates[key] !== undefined) updates[key] = String(updates[key]).trim()
    if (req.body.rates && typeof req.body.rates === 'object') {
      updates.rates = {}
      for (const key of ['ps4', 'ps5', 'vip', 'other']) {
        if (req.body.rates[key] !== undefined) {
          const value = Number(req.body.rates[key])
          if (!Number.isFinite(value) || value < 0) return res.status(400).json({ message: 'Rates must be non-negative numbers.' })
          updates.rates[key] = value
        }
      }
    }
    const shop = await Shop.findOneAndUpdate({}, { $set: updates }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true })
    return res.json({ shop })
  } catch (error) {
    return next(error)
  }
}
