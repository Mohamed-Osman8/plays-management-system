import Payment from '../models/Payment.js'
import Shop from '../models/Shop.js'

const MONTHLY_AMOUNT = 3000
const PAYMENT_METHODS = ['Telebirr', 'E-Birr', 'CBE Bank Transfer']

export async function submitPayment(req, res, next) {
  try {
    const shopId = req.user?.shopId
    if (!shopId) return res.status(403).json({ message: 'This account is not linked to a shop.' })

    const paymentMethod = String(req.body?.paymentMethod || '').trim()
    const transactionReference = String(req.body?.transactionReference || '').trim()
    const monthsRequested = Number(req.body?.monthsRequested ?? 1)
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'Choose a supported payment method.' })
    }
    if (!transactionReference || transactionReference.length > 120) {
      return res.status(400).json({ message: 'Enter a transaction reference (up to 120 characters).' })
    }
    if (!Number.isInteger(monthsRequested) || monthsRequested < 1 || monthsRequested > 12) {
      return res.status(400).json({ message: 'Choose a renewal period between 1 and 12 months.' })
    }

    const shop = await Shop.exists({ _id: shopId })
    if (!shop) return res.status(403).json({ message: 'This account is not linked to an active shop.' })

    const duplicate = await Payment.exists({
      transactionReference,
      status: { $in: ['pending', 'approved'] }
    })
    if (duplicate) return res.status(409).json({ message: 'This transaction reference has already been submitted.' })

    const payment = await Payment.create({
      shop: shopId,
      amount: MONTHLY_AMOUNT * monthsRequested,
      paymentMethod,
      transactionReference,
      monthsRequested
    })
    return res.status(201).json({ payment })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'This transaction reference has already been submitted.' })
    }
    return next(error)
  }
}

export async function getShopPaymentHistory(req, res, next) {
  try {
    const shopId = req.user?.shopId
    if (!shopId) return res.status(403).json({ message: 'This account is not linked to a shop.' })
    const payments = await Payment.find({ shop: shopId }).sort({ submittedAt: -1 }).lean()
    return res.json({ payments })
  } catch (error) {
    return next(error)
  }
}
