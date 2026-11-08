import Shop from '../models/Shop.js'

const defaultShop = {
  name: process.env.SHOP_NAME || 'Game Zone',
  phone: process.env.SHOP_PHONE || '',
  address: process.env.SHOP_ADDRESS || ''
}

export async function getShopSettings(_req, res, next) {
  try {
    const filter = _req.user?.shopId ? { _id: _req.user.shopId } : { email: { $exists: false } }
    const shop = await Shop.findOneAndUpdate(
      filter,
      { $setOnInsert: defaultShop },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
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
    if (req.body.bookingSettings && typeof req.body.bookingSettings === 'object') {
      const settings = req.body.bookingSettings
      updates.bookingSettings = {}
      for (const key of ['openTime', 'closeTime', 'timeZone']) {
        if (settings[key] !== undefined) updates.bookingSettings[key] = String(settings[key]).trim()
      }
      if (settings.slotIntervalMinutes !== undefined) {
        const interval = Number(settings.slotIntervalMinutes)
        if (!Number.isInteger(interval) || interval < 5 || interval > 240) {
          return res.status(400).json({ message: 'Booking interval must be a whole number from 5 to 240 minutes.' })
        }
        updates.bookingSettings.slotIntervalMinutes = interval
      }
      if (settings.durationOptionsMinutes !== undefined) {
        const durations = settings.durationOptionsMinutes
        if (!Array.isArray(durations) || durations.length < 1 || durations.length > 12 ||
          durations.some((duration) => !Number.isInteger(Number(duration)) || Number(duration) < 5 || Number(duration) > 720)) {
          return res.status(400).json({ message: 'Provide between 1 and 12 valid booking durations from 5 to 720 minutes.' })
        }
        updates.bookingSettings.durationOptionsMinutes = [...new Set(durations.map(Number))].sort((a, b) => a - b)
      }
      const currentSettings = req.shop?.bookingSettings?.toObject?.() || req.shop?.bookingSettings || {}
      const mergedSettings = { ...currentSettings, ...updates.bookingSettings }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(mergedSettings.openTime || '') ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(mergedSettings.closeTime || '') ||
        mergedSettings.closeTime <= mergedSettings.openTime) {
        return res.status(400).json({ message: 'Shop closing time must be after its valid opening time.' })
      }
      try {
        new Intl.DateTimeFormat('en', { timeZone: mergedSettings.timeZone }).format(new Date())
      } catch {
        return res.status(400).json({ message: 'Provide a valid IANA shop time zone.' })
      }
      updates.bookingSettings = mergedSettings
    }
    if (req.body.notificationSettings && typeof req.body.notificationSettings === 'object') {
      updates.notificationSettings = {}
      for (const key of ['bookingRequestsEmail', 'bookingUpdatesEmail']) {
        if (req.body.notificationSettings[key] !== undefined) {
          if (typeof req.body.notificationSettings[key] !== 'boolean') {
            return res.status(400).json({ message: 'Booking email preferences must be enabled or disabled.' })
          }
          updates.notificationSettings[key] = req.body.notificationSettings[key]
        }
      }
    }
    const filter = req.user?.shopId ? { _id: req.user.shopId } : { email: { $exists: false } }
    const shop = await Shop.findOneAndUpdate(
      filter,
      { $set: updates },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    )
    return res.json({ shop })
  } catch (error) {
    return next(error)
  }
}
