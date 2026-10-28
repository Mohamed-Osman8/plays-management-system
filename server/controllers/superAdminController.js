import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import Payment from '../models/Payment.js'
import Shop from '../models/Shop.js'
import SuperAdmin from '../models/SuperAdmin.js'

function safeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function superAdminLogin(req, res, next) {
  const email = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase()
  const password = process.env.SUPER_ADMIN_PASSWORD
  if (!email || !password) return res.status(503).json({ message: 'Super admin credentials are not configured.' })
  if (!safeEqual(String(req.body?.email || '').trim().toLowerCase(), email) || !safeEqual(req.body?.password || '', password)) {
    return res.status(401).json({ message: 'Invalid super admin credentials.' })
  }
  try {
    const superAdmin = await SuperAdmin.findOneAndUpdate(
      { email },
      { $setOnInsert: { email } },
      { new: true, upsert: true, runValidators: true }
    )
    const token = jwt.sign(
      { sub: String(superAdmin._id), role: 'SuperAdmin', email },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '4h' }
    )
    return res.json({ token })
  } catch (error) {
    return next(error)
  }
}

export async function listShops(_req, res, next) {
  try {
    const shops = await Shop.find().select('name email phone ownerPhone isApproved status approvedAt approvedByEmail approvalNotes license createdAt').sort({ createdAt: -1 }).lean()
    return res.json({ shops })
  } catch (error) {
    return next(error)
  }
}

export async function getPendingShops(_req, res, next) {
  try {
    const shops = await Shop.find({
      $and: [
        { $or: [{ isApproved: false }, { status: 'pending' }] },
        { status: { $nin: ['inactive', 'rejected'] } }
      ]
    }).select('name email phone ownerPhone isApproved status createdAt approvalNotes').sort({ createdAt: 1 }).lean()
    return res.json({ shops })
  } catch (error) {
    return next(error)
  }
}

export async function getActiveShops(_req, res, next) {
  try {
    const shops = await Shop.find({
      status: { $nin: ['pending', 'rejected'] }
    }).select('name email phone ownerPhone isApproved status approvedAt approvedByEmail license createdAt').sort({ createdAt: -1 }).lean()
    return res.json({
      shops: shops.map((shop) => ({
        ...shop,
        licenseExpiresAt: shop.license?.expiresAt || null,
        remainingDays: shop.license?.expiresAt
          ? Math.max(0, Math.ceil((new Date(shop.license.expiresAt).getTime() - Date.now()) / 86400000))
          : null
      }))
    })
  } catch (error) {
    return next(error)
  }
}

export async function activateShop(req, res, next) {
  try {
    if (req.body?.paymentVerified !== true || Number(req.body?.amount) !== 3000) {
      return res.status(400).json({ message: 'Confirm that the 3,000 ETB payment has been verified before activation.' })
    }

    const now = new Date()
    const shopId = req.params.shopId || req.params.id
    const update = {
      isApproved: true,
      approvedAt: now,
      approvedByEmail: String(req.superAdmin?.email || ''),
      'license.status': 'active',
      'license.plan': 'Monthly'
    }
    if (mongoose.isValidObjectId(req.superAdmin?.sub)) {
      update.approvedBy = new mongoose.Types.ObjectId(req.superAdmin.sub)
    }

    const shop = await Shop.findOneAndUpdate(
      {
        _id: shopId,
        $and: [
          { $or: [{ isApproved: false }, { status: 'pending' }] },
          { status: { $nin: ['inactive', 'rejected'] } }
        ]
      },
      [{
        $set: {
          isApproved: true,
          status: 'active',
          approvedAt: now,
          approvedBy: update.approvedBy || null,
          approvedByUsername: update.approvedByUsername,
          'license.expiresAt': {
            $dateAdd: { startDate: now, unit: 'day', amount: 30 }
          },
          'license.status': 'active',
          'license.plan': 'Monthly'
        }
      }],
      { new: true, runValidators: true }
    )
    if (!shop) {
      const exists = await Shop.exists({ _id: shopId })
      return exists
        ? res.status(409).json({ message: 'This shop is already active or awaiting a different status change.' })
        : res.status(404).json({ message: 'Shop not found.' })
    }
    return res.json({ shop })
  } catch (error) {
    return next(error)
  }
}

export async function rejectShop(req, res, next) {
  try {
    const notes = String(req.body?.notes || '').trim()
    if (notes.length > 500) return res.status(400).json({ message: 'Rejection reason must be 500 characters or fewer.' })
    const shop = await Shop.findOneAndUpdate(
      {
        _id: req.params.id,
        $and: [
          { $or: [{ isApproved: false }, { status: 'pending' }] },
          { status: { $nin: ['inactive', 'rejected'] } }
        ]
      },
      {
        $set: {
          isApproved: false,
          status: 'rejected',
          approvalNotes: notes,
          'license.status': 'locked'
        }
      },
      { new: true, runValidators: true }
    )
    if (!shop) return res.status(404).json({ message: 'Pending shop not found or already processed.' })
    return res.json({ shop })
  } catch (error) {
    return next(error)
  }
}

export async function deactivateShop(req, res, next) {
  try {
    const shopId = req.params.shopId || req.params.id
    const shop = await Shop.findOneAndUpdate(
      { _id: shopId, isApproved: { $ne: false } },
      {
        $set: {
          isApproved: false,
          status: 'inactive',
          'license.status': 'locked'
        }
      },
      { new: true, runValidators: true }
    )
    if (!shop) return res.status(404).json({ message: 'Active shop not found.' })
    return res.json({ shop })
  } catch (error) {
    return next(error)
  }
}

export async function extendShopLicense(req, res, next) {
  try {
    const shop = await Shop.findById(req.params.id)
    if (!shop) return res.status(404).json({ message: 'Shop not found.' })
    const base = shop.license.expiresAt && shop.license.expiresAt > new Date() ? shop.license.expiresAt : new Date()
    const expiresAt = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)
    shop.license.expiresAt = expiresAt
    shop.license.status = 'active'
    shop.license.plan = 'Monthly'
    shop.status = 'active'
    shop.isApproved = true
    await shop.save()
    return res.json({ shop })
  } catch (error) {
    return next(error)
  }
}

export async function setShopLock(req, res, next) {
  try {
    const { locked } = req.body || {}
    if (typeof locked !== 'boolean') return res.status(400).json({ message: 'locked must be a boolean.' })
    const filter = locked
      ? { _id: req.params.id, status: { $nin: ['pending', 'rejected'] } }
      : { _id: req.params.id, status: 'inactive', isApproved: false }
    const shop = await Shop.findOneAndUpdate(
      filter,
      {
        $set: {
          isApproved: !locked,
          status: locked ? 'inactive' : 'active',
          'license.status': locked ? 'locked' : 'active'
        }
      },
      { new: true, runValidators: true }
    )
    if (!shop) {
      const exists = await Shop.exists({ _id: req.params.id })
      return exists
        ? res.status(409).json({ message: locked ? 'This shop cannot be blocked in its current state.' : 'This shop is not blocked.' })
        : res.status(404).json({ message: 'Shop not found.' })
    }
    return res.json({ shop })
  } catch (error) {
    return next(error)
  }
}

export async function getAllPendingPayments(_req, res, next) {
  try {
    const payments = await Payment.find({ status: 'pending' })
      .populate('shop', 'name email phone ownerPhone')
      .sort({ submittedAt: 1 })
      .lean()
    return res.json({ payments })
  } catch (error) {
    return next(error)
  }
}

export const getPaymentRequests = getAllPendingPayments

export async function approvePaymentRequest(req, res, next) {
  try {
    const approvedAt = new Date()
    const approval = {
      status: 'approved',
      approvedAt,
      approvedByEmail: String(req.superAdmin?.email || '')
    }
    if (mongoose.isValidObjectId(req.superAdmin?.sub)) {
      approval.approvedBy = new mongoose.Types.ObjectId(req.superAdmin.sub)
    }

    const payment = await Payment.findOneAndUpdate(
      { _id: req.params.paymentId, status: 'pending' },
      { $set: approval },
      { new: true, runValidators: true }
    )
    if (!payment) return res.status(404).json({ message: 'Pending payment not found or already processed.' })

    let shop
    try {
      const now = approvedAt
      const baseDate = {
        $cond: [
          { $gt: [{ $ifNull: ['$license.expiresAt', now] }, now] },
          '$license.expiresAt',
          now
        ]
      }
      shop = await Shop.findByIdAndUpdate(
        payment.shop,
        [{
          $set: {
            'license.expiresAt': {
              $dateAdd: {
                startDate: baseDate,
                unit: 'day',
                amount: 30 * payment.monthsRequested
              }
            },
            'license.status': 'active',
            'license.plan': `${payment.monthsRequested} month${payment.monthsRequested === 1 ? '' : 's'}`,
            isApproved: true,
            status: 'active'
          }
        }],
        { new: true }
      )
    } catch (error) {
      await Payment.updateOne(
        { _id: payment._id, status: 'approved', approvedAt },
        { $set: { status: 'pending', approvedAt: null, approvedBy: null, approvedByUsername: '' } }
      )
      return next(error)
    }

    if (!shop) {
      await Payment.updateOne(
        { _id: payment._id, status: 'approved', approvedAt },
        { $set: { status: 'pending', approvedAt: null, approvedBy: null, approvedByUsername: '' } }
      )
      return res.status(404).json({ message: 'The shop linked to this payment no longer exists.' })
    }
    return res.json({ payment, shop })
  } catch (error) {
    return next(error)
  }
}

export async function rejectPaymentRequest(req, res, next) {
  try {
    const notes = String(req.body?.notes || '').trim()
    if (!notes || notes.length > 500) {
      return res.status(400).json({ message: 'Enter a rejection reason (up to 500 characters).' })
    }
    const payment = await Payment.findOneAndUpdate(
      { _id: req.params.paymentId, status: 'pending' },
      { $set: { status: 'rejected', notes } },
      { new: true, runValidators: true }
    )
    if (!payment) return res.status(404).json({ message: 'Pending payment not found or already processed.' })
    return res.json({ payment })
  } catch (error) {
    return next(error)
  }
}

export const approvePayment = approvePaymentRequest
export const rejectPayment = rejectPaymentRequest
