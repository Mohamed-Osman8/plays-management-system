import mongoose from 'mongoose'
import Booking, { normalizeBookingStatus } from '../models/Booking.js'
import PlaySession from '../models/PlaySession.js'
import Shop from '../models/Shop.js'
import Station from '../models/Station.js'
import { runWithTenant } from '../config/tenantContext.js'
import {
  acquireStationBookingLock,
  bookingError,
  createBookingWindow,
  findActiveSessionConflicts,
  findBookingConflict,
  getShopHourlyRate,
  releaseStationBookingLock
} from '../services/bookingService.js'
import { sendBookingNotification } from '../services/emailService.js'

const activeShopFilter = { isApproved: { $ne: false }, status: 'active' }
const transitions = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Checked In', 'Cancelled', 'No Show'],
  'Checked In': ['In Progress', 'Cancelled', 'No Show'],
  'In Progress': [],
  Completed: [],
  Cancelled: [],
  'No Show': []
}

function normalizeConsoleType(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/^PLAYSTATION\s*/, 'PS')
  if (['PS4', 'PS5', 'VIP', 'OTHER'].includes(normalized)) return normalized === 'OTHER' ? 'Other' : normalized
  return ''
}

function currentShopId(req) {
  return req.user?.shopId || req.shop?._id
}

async function findPublicShop(shopId) {
  if (!mongoose.isValidObjectId(shopId)) throw bookingError(400, 'Choose a valid shop.')
  const shop = await Shop.findOne({ _id: shopId, ...activeShopFilter })
  if (!shop) throw bookingError(404, 'The selected shop is not available for bookings.')
  return shop
}

function activeLocalDate(timeZone) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

async function notifyCustomer(booking, shop, event) {
  if (!booking.customerEmail) return null
  const notificationKey = event === 'created' ? 'bookingRequestsEmail' : 'bookingUpdatesEmail'
  if (shop.notificationSettings?.[notificationKey] === false) return null
  try {
    await sendBookingNotification({ booking, shop, event })
    return null
  } catch (error) {
    console.error('[booking] Customer email notification failed:', {
      event,
      confirmation: booking.confirmation,
      message: error.message
    })
    return 'Reservation saved, but the customer email could not be sent.'
  }
}

function bookingFields(req, station, shop) {
  const consoleType = normalizeConsoleType(req.body.consoleType || station.type)
  if (consoleType !== station.type) throw bookingError(400, 'The selected PlayStation type does not match this station.')
  const customerName = String(req.body.customerName || req.body.name || '').trim()
  const phone = String(req.body.phone || '').trim()
  if (customerName.length < 2 || customerName.length > 100) throw bookingError(400, 'Customer name must contain 2 to 100 characters.')
  if (!/^\+?[0-9 ]{7,18}$/.test(phone)) throw bookingError(400, 'Enter a valid phone number using 7 to 18 digits.')
  const customerEmail = String(req.body.customerEmail || req.body.email || '').trim().toLowerCase()
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw bookingError(400, 'Enter a valid customer email address.')
  const notes = String(req.body.notes || '').trim()
  if (notes.length > 1000) throw bookingError(400, 'Notes cannot exceed 1000 characters.')
  const window = createBookingWindow({
    date: String(req.body.date || ''),
    time: String(req.body.startTime || req.body.arrivalTime || ''),
    durationMinutes: req.body.durationMinutes,
    shop
  })
  const hourlyRate = getShopHourlyRate(shop, consoleType)
  const totalPrice = Math.round(hourlyRate * window.durationMinutes / 60 * 100) / 100
  return {
    customerName,
    phone,
    customerEmail,
    consoleType,
    station: station._id,
    stationName: station.name,
    date: String(req.body.date),
    arrivalTime: String(req.body.startTime || req.body.arrivalTime),
    ...window,
    hourlyRate,
    totalPrice,
    notes
  }
}

async function createBookingForShop(req, shop, status = 'Pending') {
  const stationId = req.body.stationId || req.body.station
  if (!mongoose.isValidObjectId(stationId)) throw bookingError(400, 'Choose a valid gaming station.')
  return runWithTenant(shop._id, async () => {
    const { station: lockedStation, token } = await acquireStationBookingLock(stationId)
    try {
      if (!['available', 'playing'].includes(lockedStation.status)) {
        throw bookingError(409, 'This station is currently unavailable for reservations.')
      }
      const fields = bookingFields(req, lockedStation, shop)
      if (await findBookingConflict({
        stationId: lockedStation._id,
        stationName: lockedStation.name,
        date: fields.date,
        startsAt: fields.startsAt,
        endsAt: fields.endsAt
      })) {
        throw bookingError(409, 'This station is already booked for part of that time. Choose another time or station.')
      }
      const activeConflicts = await findActiveSessionConflicts({
        stations: [lockedStation],
        startsAt: fields.startsAt,
        endsAt: fields.endsAt
      })
      if (activeConflicts.has(String(lockedStation._id))) {
        throw bookingError(409, 'This station has an active gaming session during the selected booking time.')
      }
      return Booking.create({ ...fields, shopId: shop._id, status })
    } finally {
      await releaseStationBookingLock(lockedStation._id, token)
    }
  })
}

export async function listPublicShops(_req, res, next) {
  try {
    const shops = await Shop.find(activeShopFilter)
      .select('name rates bookingSettings')
      .sort({ name: 1 })
      .lean()
    return res.json({ shops })
  } catch (error) {
    return next(error)
  }
}

export async function getPublicAvailability(req, res, next) {
  try {
    const shop = await findPublicShop(req.query.shopId)
    const hasTime = Boolean(req.query.date && req.query.startTime && req.query.durationMinutes)
    const window = hasTime
      ? createBookingWindow({
          date: String(req.query.date),
          time: String(req.query.startTime),
          durationMinutes: req.query.durationMinutes,
          shop
        })
      : null
    const stations = await runWithTenant(shop._id, async () => {
      const rows = await Station.find().sort({ name: 1 }).lean()
      const activeConflicts = window
        ? await findActiveSessionConflicts({ stations: rows, startsAt: window.startsAt, endsAt: window.endsAt })
        : new Set()
      return Promise.all(rows.map(async (station) => {
        const conflict = window && await findBookingConflict({
          stationId: station._id,
          stationName: station.name,
          date: String(req.query.date),
          startsAt: window.startsAt,
          endsAt: window.endsAt
        })
        return {
          _id: station._id,
          name: station.name,
          type: station.type,
          status: station.status,
          hourlyRate: getShopHourlyRate(shop, station.type),
          isAvailable: ['available', 'playing'].includes(station.status) &&
            !conflict &&
            (!window || !activeConflicts.has(String(station._id)))
        }
      }))
    })
    return res.json({ stations, bookingSettings: shop.bookingSettings, rates: shop.rates })
  } catch (error) {
    return next(error)
  }
}

export async function requestBooking(req, res, next) {
  try {
    const shop = await findPublicShop(req.body.shopId)
    const booking = await createBookingForShop(req, shop)
    const emailWarning = await notifyCustomer(booking, shop, 'created')
    return res.status(201).json({ booking, emailWarning })
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Invalid booking details.', errors: Object.values(error.errors).map((item) => item.message) })
    }
    return next(error)
  }
}

export async function createStaffBooking(req, res, next) {
  try {
    const shopId = currentShopId(req)
    if (!shopId) return res.status(403).json({ message: 'This account is not linked to a shop.' })
    const shop = await Shop.findById(shopId)
    if (!shop) return res.status(403).json({ message: 'This account is not linked to an active shop.' })
    const status = req.body.status === 'Confirmed' ? 'Confirmed' : 'Pending'
    const booking = await createBookingForShop(req, shop, status)
    const emailWarning = await notifyCustomer(booking, shop, 'created')
    return res.status(201).json({ booking, emailWarning })
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Invalid booking details.', errors: Object.values(error.errors).map((item) => item.message) })
    }
    return next(error)
  }
}

export async function listBookings(req, res, next) {
  try {
    const filter = {}
    if (req.query.status && req.query.status !== 'All') {
      const statuses = [...new Set(String(req.query.status).split(',').map((status) => normalizeBookingStatus(status.trim())))]
      filter.status = { $in: [...new Set(statuses.flatMap((status) => [status, ...legacyStatusAliases(status)]))] }
    }
    if (req.query.date) filter.date = String(req.query.date)
    if (req.query.from || req.query.to) {
      filter.date = { ...(req.query.from ? { $gte: String(req.query.from) } : {}), ...(req.query.to ? { $lte: String(req.query.to) } : {}) }
    }
    if (req.query.consoleType) filter.consoleType = normalizeConsoleType(req.query.consoleType)
    if (req.query.station) filter.station = req.query.station
    if (req.query.q) {
      const escaped = String(req.query.q).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const expression = new RegExp(escaped, 'i')
      filter.$or = [{ customerName: expression }, { phone: expression }, { confirmation: expression }]
    }
    const bookings = await Booking.find(filter).sort({ startsAt: 1 }).limit(500).lean()
    return res.json({ bookings: bookings.map((booking) => ({
      ...booking,
      status: normalizeBookingStatus(booking.status),
      confirmation: booking.confirmation || `LEGACY-${String(booking._id).slice(-8).toUpperCase()}`,
      paymentStatus: booking.paymentStatus || 'Unpaid',
      amountPaid: Number(booking.amountPaid || 0)
    })) })
  } catch (error) {
    return next(error)
  }
}

export async function getBookingSummary(req, res, next) {
  try {
    const shopId = currentShopId(req)
    if (!shopId) return res.status(403).json({ message: 'This account is not linked to a shop.' })
    const shop = req.shop || await Shop.findById(shopId).lean()
    if (!shop) return res.status(403).json({ message: 'This account is not linked to an active shop.' })
    const today = activeLocalDate(shop.bookingSettings?.timeZone || 'Africa/Addis_Ababa')
    const now = new Date()
    const [todayCount, upcomingCount, pendingCount, activeCount, completedCount, cancelledCount, revenue] = await Promise.all([
      Booking.countDocuments({ date: today }),
      Booking.countDocuments({
        status: { $in: ['Pending', 'Confirmed', 'Checked In', 'Approved'] },
        $or: [
          { startsAt: { $gt: now } },
          { startsAt: null, date: { $gt: today } },
          { startsAt: { $exists: false }, date: { $gt: today } }
        ]
      }),
      Booking.countDocuments({ status: { $in: ['Pending'] } }),
      PlaySession.countDocuments({ booking: { $ne: null }, status: { $in: ['active', 'paused'] } }),
      Booking.countDocuments({ status: 'Completed' }),
      Booking.countDocuments({ status: { $in: ['Cancelled', 'No Show'] } }),
      Booking.aggregate([
        { $match: { paymentStatus: { $in: ['Paid', 'Partially Paid'] }, amountPaid: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } }
      ])
    ])
    return res.json({
      summary: {
        today: todayCount,
        upcoming: upcomingCount,
        pending: pendingCount,
        active: activeCount,
        completed: completedCount,
        cancelled: cancelledCount,
        reservationRevenue: revenue[0]?.total || 0
      }
    })
  } catch (error) {
    return next(error)
  }
}

export async function getBooking(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid booking ID.' })
    const booking = await Booking.findById(req.params.id).lean()
    if (!booking) return res.status(404).json({ message: 'Booking not found.' })
    return res.json({ booking })
  } catch (error) {
    return next(error)
  }
}

export async function updateBooking(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid booking ID.' })
    const booking = await Booking.findById(req.params.id)
    if (!booking) return res.status(404).json({ message: 'Booking not found.' })
    if (!['Pending', 'Confirmed'].includes(booking.status)) return res.status(409).json({ message: 'Only pending or confirmed reservations can be edited.' })
    const updates = req.body || {}
    const stationId = updates.stationId || String(booking.station)
    if (!mongoose.isValidObjectId(stationId)) return res.status(400).json({ message: 'Choose a valid gaming station.' })
    const shop = await Shop.findById(booking.shopId)
    if (!shop) return res.status(404).json({ message: 'Shop not found.' })
    const result = await runWithTenant(booking.shopId, async () => {
      const { station: lockedStation, token } = await acquireStationBookingLock(stationId)
      try {
        if (!['available', 'playing'].includes(lockedStation.status)) {
          throw bookingError(409, 'This station is currently unavailable for reservations.')
        }
        const merged = {
          ...booking.toObject(),
          ...updates,
          stationId,
          date: updates.date || booking.date,
          startTime: updates.startTime || updates.arrivalTime || booking.arrivalTime,
          durationMinutes: updates.durationMinutes ?? booking.durationMinutes,
          consoleType: updates.consoleType || lockedStation.type
        }
        const fields = bookingFields({ body: merged }, lockedStation, shop)
        if (await findBookingConflict({
          stationId: lockedStation._id,
          stationName: lockedStation.name,
          date: fields.date,
          startsAt: fields.startsAt,
          endsAt: fields.endsAt,
          excludeBookingId: booking._id
        })) throw bookingError(409, 'This station is already booked for part of that time.')
        const activeConflicts = await findActiveSessionConflicts({
          stations: [lockedStation],
          startsAt: fields.startsAt,
          endsAt: fields.endsAt
        })
        if (activeConflicts.has(String(lockedStation._id))) {
          throw bookingError(409, 'This station has an active gaming session during the selected booking time.')
        }
        Object.assign(booking, fields)
        await booking.save()
        return booking
      } finally {
        await releaseStationBookingLock(lockedStation._id, token)
      }
    })
    const emailWarning = await notifyCustomer(result, shop, 'updated')
    return res.json({ booking: result, emailWarning })
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Invalid booking details.', errors: Object.values(error.errors).map((item) => item.message) })
    }
    return next(error)
  }
}

export async function setBookingStatus(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid booking ID.' })
    const status = String(req.body.status || '')
    const booking = await Booking.findById(req.params.id)
    if (!booking) return res.status(404).json({ message: 'Booking not found.' })
    booking.status = normalizeBookingStatus(booking.status)
    const normalizedStatus = normalizeBookingStatus(status)
    if (!transitions[booking.status]?.includes(normalizedStatus)) return res.status(409).json({ message: `A reservation cannot move from ${booking.status} to ${normalizedStatus || 'that status'}.` })
    if (normalizedStatus === 'In Progress' || normalizedStatus === 'Completed') {
      return res.status(409).json({ message: 'Start and complete the reservation using its linked gaming session.' })
    }
    if (normalizedStatus === 'Checked In') {
      let station = booking.station ? await Station.findById(booking.station) : null
      if (!station && booking.stationName) station = await Station.findOne({ name: booking.stationName })
      if (!station || !['available', 'reserved'].includes(station.status)) {
        return res.status(409).json({ message: 'The reserved station is currently unavailable for check-in.' })
      }
      const updatedBooking = await Booking.findOneAndUpdate(
        { _id: booking._id, status: { $in: ['Confirmed', 'Approved'] }, session: null },
        { $set: { status: 'Checked In', station: station._id, stationName: station.name } },
        { new: true, runValidators: true }
      )
      if (!updatedBooking) return res.status(409).json({ message: 'The reservation changed before check-in. Refresh and try again.' })
      return res.json({ booking: updatedBooking })
    }
    booking.status = normalizedStatus
    await booking.save()
    const shop = await Shop.findById(booking.shopId)
    const emailEvent = normalizedStatus === 'Cancelled' ? 'cancelled' : normalizedStatus === 'Confirmed' ? 'confirmed' : 'updated'
    const emailWarning = await notifyCustomer(booking, shop, emailEvent)
    return res.json({ booking, emailWarning })
  } catch (error) {
    return next(error)
  }
}

export async function updateBookingPayment(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid booking ID.' })
    const booking = await Booking.findById(req.params.id)
    if (!booking) return res.status(404).json({ message: 'Booking not found.' })
    if (booking.session) {
      return res.status(409).json({ message: 'This reservation is linked to a gaming session. Confirm its payment through the session payment controls.' })
    }
    const paymentStatus = String(req.body.paymentStatus || '')
    const amountDue = Number(booking.finalPrice ?? booking.totalPrice)
    if (!['Unpaid', 'Partially Paid', 'Paid', 'Refunded'].includes(paymentStatus)) {
      return res.status(400).json({ message: 'Choose a valid reservation payment status.' })
    }
    const amountPaid = Number(req.body.amountPaid)
    if (!Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > amountDue) {
      return res.status(400).json({ message: 'Paid amount must be between zero and the reservation total.' })
    }
    if (paymentStatus === 'Partially Paid' && !(amountPaid > 0 && amountPaid < amountDue)) {
      return res.status(400).json({ message: 'A partial payment must be greater than zero and less than the reservation total.' })
    }
    if (paymentStatus === 'Paid' && amountPaid !== amountDue) {
      return res.status(400).json({ message: 'Confirm the full reservation total before marking it paid.' })
    }
    if (paymentStatus === 'Unpaid' && amountPaid !== 0) {
      return res.status(400).json({ message: 'An unpaid reservation cannot have a paid amount.' })
    }
    if (paymentStatus === 'Refunded' && booking.paymentStatus !== 'Paid') {
      return res.status(409).json({ message: 'Only a fully paid reservation can be marked refunded.' })
    }
    if (paymentStatus === 'Refunded' && req.user?.role !== 'Admin') {
      return res.status(403).json({ message: 'Only an administrator can mark a reservation refunded.' })
    }
    booking.paymentStatus = paymentStatus
    booking.amountPaid = paymentStatus === 'Refunded' ? 0 : amountPaid
    booking.paymentMethod = String(req.body.paymentMethod || '').trim().slice(0, 40)
    booking.paidAt = paymentStatus === 'Paid' ? new Date() : null
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, __v: booking.__v },
      {
        $set: {
          paymentStatus: booking.paymentStatus,
          amountPaid: booking.amountPaid,
          paymentMethod: booking.paymentMethod,
          paidAt: booking.paidAt
        },
        $inc: { __v: 1 }
      },
      { new: true, runValidators: true }
    )
    if (!updated) return res.status(409).json({ message: 'The reservation payment was updated by another request. Refresh before trying again.' })
    return res.json({ booking: updated })
  } catch (error) {
    return next(error)
  }
}

export async function listPlatformBookings(req, res, next) {
  try {
    const status = normalizeBookingStatus(String(req.query.status || ''))
    const filter = req.query.status ? { status: { $in: [status, ...legacyStatusAliases(status)] } } : {}
    const bookings = await Booking.find(filter).sort({ startsAt: -1 }).limit(1000).populate('shopId', 'name').lean()
    return res.json({ bookings: bookings.map((booking) => ({
      ...booking,
      status: normalizeBookingStatus(booking.status),
      confirmation: booking.confirmation || `LEGACY-${String(booking._id).slice(-8).toUpperCase()}`,
      paymentStatus: booking.paymentStatus || 'Unpaid',
      amountPaid: Number(booking.amountPaid || 0)
    })) })
  } catch (error) {
    return next(error)
  }
}

function legacyStatusAliases(status) {
  if (status === 'Confirmed') return ['Approved']
  if (status === 'Cancelled') return ['Rejected']
  return []
}

export const approveBooking = (req, res, next) => {
  req.body = { ...req.body, status: 'Confirmed' }
  return setBookingStatus(req, res, next)
}

export const rejectBooking = (req, res, next) => {
  req.body = { ...req.body, status: 'Cancelled' }
  return setBookingStatus(req, res, next)
}
