import mongoose from 'mongoose'
import CustomerBalance from '../models/CustomerBalance.js'

function serializeBalance(balance) {
  return {
    ...balance,
    id: String(balance._id),
    customer: balance.customerName,
    total: Number(balance.amount),
    paid: Number(balance.amountPaid || 0)
  }
}

export async function listCustomerBalances(_req, res, next) {
  try {
    const balances = await CustomerBalance.find().sort({ createdAt: -1 }).limit(500).lean()
    return res.json({ balances: balances.map(serializeBalance) })
  } catch (error) {
    return next(error)
  }
}

export async function createCustomerBalance(req, res, next) {
  try {
    const customerName = String(req.body.customerName || '').trim()
    const phone = String(req.body.phone || '').trim()
    const rawAmount = Number(req.body.amount)
    const amount = Math.round(rawAmount * 100) / 100
    if (customerName.length < 2 || customerName.length > 100) {
      return res.status(400).json({ message: 'Customer name must contain 2 to 100 characters.' })
    }
    if (!/^\+?[0-9 ]{7,18}$/.test(phone)) {
      return res.status(400).json({ message: 'Enter a valid phone number using 7 to 18 digits.' })
    }
    if (!Number.isFinite(rawAmount) || amount <= 0 || Math.abs(rawAmount - amount) > 0.000001) {
      return res.status(400).json({ message: 'Balance amount must be greater than zero and use no more than two decimal places.' })
    }

    const balance = await CustomerBalance.create({ customerName, phone, amount, amountPaid: 0 })
    return res.status(201).json({ balance: serializeBalance(balance.toObject()) })
  } catch (error) {
    return next(error)
  }
}

export async function recordCustomerBalancePayment(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid customer balance ID.' })
    const rawAmount = Number(req.body.amount)
    const amount = Math.round(rawAmount * 100) / 100
    if (!Number.isFinite(rawAmount) || amount <= 0 || Math.abs(rawAmount - amount) > 0.000001) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero and use no more than two decimal places.' })
    }
    const balance = await CustomerBalance.findById(req.params.id)
    if (!balance) return res.status(404).json({ message: 'Customer balance not found.' })
    const remaining = Number((balance.amount - balance.amountPaid).toFixed(2))
    if (amount > remaining) {
      return res.status(400).json({ message: 'Payment cannot exceed the remaining customer balance.' })
    }

    const updated = await CustomerBalance.findOneAndUpdate(
      { _id: balance._id, amountPaid: balance.amountPaid },
      { $inc: { amountPaid: amount } },
      { new: true, runValidators: true }
    )
    if (!updated) return res.status(409).json({ message: 'The customer balance changed. Refresh and try again.' })
    return res.json({ balance: serializeBalance(updated.toObject()) })
  } catch (error) {
    return next(error)
  }
}
