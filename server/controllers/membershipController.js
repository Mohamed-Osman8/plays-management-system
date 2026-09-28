import mongoose from 'mongoose'
import Membership from '../models/Membership.js'
import MembershipPayment from '../models/MembershipPayment.js'

const paymentMethods = ['cash', 'card', 'mobile_money', 'bank', 'other']
const validPhone = /^\+?[0-9 ()-]{7,30}$/

function normalizePaymentMethod(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function periodEnd(start, plan) {
  const end = new Date(start)
  const day = end.getDate()
  end.setDate(1)
  if (plan === 'monthly') end.setMonth(end.getMonth() + 1)
  else end.setFullYear(end.getFullYear() + 1)
  const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
  end.setDate(Math.min(day, lastDay))
  return end
}

export async function listMemberships(_req, res, next) {
  try {
    const memberships = await Membership.find().sort({ createdAt: -1 }).lean()
    return res.json({ memberships })
  } catch (error) {
    return next(error)
  }
}

export async function createMembership(req, res, next) {
  let membership
  try {
    const customerName = String(req.body.customerName || req.body.name || '').trim()
    const phone = String(req.body.phone || '').trim()
    const plan = String(req.body.plan || req.body.type || req.body.duration || '').toLowerCase()
    const price = Number(req.body.price ?? req.body.amount)
    const rawPaymentMethod = req.body.paymentMethod || 'cash'
    const paymentMethod = normalizePaymentMethod(rawPaymentMethod)
    const startsAt = req.body.startsAt ? new Date(req.body.startsAt) : new Date()
    if (customerName.length < 2 || customerName.length > 100 || !validPhone.test(phone)) {
      return res.status(400).json({ message: 'A valid customer name and phone number are required.' })
    }
    if (!['monthly', 'yearly'].includes(plan)) return res.status(400).json({ message: 'Membership plan must be monthly or yearly.' })
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Membership price must be a non-negative number.' })
    if (!paymentMethods.includes(paymentMethod)) return res.status(400).json({ message: 'Unsupported payment method.' })
    if (Number.isNaN(startsAt.getTime())) return res.status(400).json({ message: 'Invalid membership start date.' })

    membership = await Membership.create({
      customerName, phone, plan, price, amount: price, paymentMethod: String(rawPaymentMethod).trim(),
      startsAt, expiresAt: periodEnd(startsAt, plan),
      notes: req.body.notes
    })
    const payment = await MembershipPayment.create({
      membership: membership._id,
      amount: price,
      paymentMethod,
      paidAt: startsAt,
      receivedBy: req.user?._id || null
    })
    return res.status(201).json({ membership, payment })
  } catch (error) {
    if (membership) {
      await Promise.all([
        Membership.deleteOne({ _id: membership._id }).catch(() => {}),
        MembershipPayment.deleteMany({ membership: membership._id }).catch(() => {})
      ])
    }
    return next(error)
  }
}

export async function updateMembership(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid membership ID.' })
    const updates = {}
    if (req.body.customerName !== undefined || req.body.name !== undefined) {
      updates.customerName = String(req.body.customerName || req.body.name).trim()
    }
    if (req.body.phone !== undefined) {
      updates.phone = String(req.body.phone).trim()
      if (!validPhone.test(updates.phone)) return res.status(400).json({ message: 'A valid phone number is required.' })
    }
    if (req.body.plan !== undefined || req.body.type !== undefined || req.body.duration !== undefined) {
      updates.plan = String(req.body.plan || req.body.type || req.body.duration).toLowerCase()
      if (!['monthly', 'yearly'].includes(updates.plan)) return res.status(400).json({ message: 'Membership plan must be monthly or yearly.' })
    }
    if (req.body.price !== undefined) {
      updates.price = Number(req.body.price)
      if (!Number.isFinite(updates.price) || updates.price < 0) return res.status(400).json({ message: 'Membership price must be a non-negative number.' })
      updates.amount = updates.price
    } else if (req.body.amount !== undefined) {
      updates.amount = Number(req.body.amount)
      if (!Number.isFinite(updates.amount) || updates.amount < 0) return res.status(400).json({ message: 'Membership amount must be a non-negative number.' })
      updates.price = updates.amount
    }
    if (req.body.paymentMethod !== undefined) updates.paymentMethod = String(req.body.paymentMethod).trim()
    if (req.body.status !== undefined) {
      if (!['active', 'expired', 'cancelled'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid membership status.' })
      updates.status = req.body.status
    }
    if (req.body.notes !== undefined) updates.notes = String(req.body.notes).trim()
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'At least one membership field is required.' })
    if (updates.plan) {
      const existing = await Membership.findById(req.params.id).select('startsAt')
      if (!existing) return res.status(404).json({ message: 'Membership not found.' })
      updates.expiresAt = periodEnd(existing.startsAt, updates.plan)
    }
    const membership = await Membership.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    if (!membership) return res.status(404).json({ message: 'Membership not found.' })
    return res.json({ membership })
  } catch (error) {
    return next(error)
  }
}

export async function deleteMembership(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid membership ID.' })
    const membership = await Membership.findByIdAndDelete(req.params.id)
    if (!membership) return res.status(404).json({ message: 'Membership not found.' })
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

export async function recordMembershipPayment(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid membership ID.' })
    const amount = Number(req.body.amount)
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod)
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ message: 'Payment amount must be a non-negative number.' })
    if (!paymentMethods.includes(paymentMethod)) return res.status(400).json({ message: 'Unsupported payment method.' })
    const membership = await Membership.findById(req.params.id)
    if (!membership) return res.status(404).json({ message: 'Membership not found.' })
    const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date()
    if (Number.isNaN(paidAt.getTime())) return res.status(400).json({ message: 'Invalid payment date.' })
    const payment = await MembershipPayment.create({
      membership: membership._id, amount, paymentMethod, paidAt, receivedBy: req.user?._id || null
    })
    const startsAt = membership.expiresAt > paidAt ? membership.expiresAt : paidAt
    membership.startsAt = membership.expiresAt > paidAt ? membership.startsAt : paidAt
    membership.expiresAt = periodEnd(startsAt, membership.plan)
    membership.status = 'active'
    await membership.save()
    return res.status(201).json({ membership, payment })
  } catch (error) {
    return next(error)
  }
}
