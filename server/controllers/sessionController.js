import mongoose from 'mongoose'
import Booking from '../models/Booking.js'
import PlaySession, { SESSION_PAYMENT_METHODS } from '../models/PlaySession.js'
import Station from '../models/Station.js'

function validPaymentMethod(value) {
  return SESSION_PAYMENT_METHODS.includes(normalizePaymentMethod(value))
}

function normalizePaymentMethod(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

async function findSession(identifier) {
  if (mongoose.isValidObjectId(identifier)) {
    const session = await PlaySession.findById(identifier)
    if (session) return session
  }
  const escaped = String(identifier).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return PlaySession.findOne({
    stationName: new RegExp(`^${escaped}$`, 'i'),
    status: { $in: ['active', 'paused', 'completed'] }
  }).sort({ startedAt: -1 })
}

export async function listSessions(req, res, next) {
  try {
    const filter = {}
    if (req.query.status) {
      const statuses = String(req.query.status).split(',').map((value) => value.trim())
      const allowed = ['active', 'paused', 'completed', 'cancelled', 'reversed']
      if (statuses.some((status) => !allowed.includes(status))) return res.status(400).json({ message: 'Invalid session status filter.' })
      filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses }
    }
    if (req.query.station) filter.stationName = String(req.query.station)
    return res.json({ sessions: await PlaySession.find(filter).sort({ startedAt: -1 }).limit(500) })
  } catch (error) {
    return next(error)
  }
}

export async function startSession(req, res, next) {
  let station
  let stationReserved = false
  let previousStationStatus
  let createdSession
  try {
    const { stationName, stationId, customerName, customer, customerPhone, sessionType = 'Hourly', hourlyRate, rate, paymentMethod, bookingId } = req.body
    const stationKey = String(stationName || stationId || '').trim()
    if (!stationKey && !bookingId) return res.status(400).json({ message: 'stationName is required.' })
    if (paymentMethod !== undefined && !validPaymentMethod(paymentMethod)) return res.status(400).json({ message: 'Unsupported payment method.' })

    let booking = null
    if (bookingId) {
      if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: 'Invalid booking ID.' })
      booking = await Booking.findById(bookingId)
      if (!booking) return res.status(404).json({ message: 'Reservation not found.' })
      if (booking.status !== 'Checked In') return res.status(409).json({ message: 'Check in the reservation before starting its gaming session.' })
      if (stationKey && stationKey !== String(booking.station) && stationKey !== booking.stationName) {
        return res.status(400).json({ message: 'The gaming station must match the checked-in reservation.' })
      }
      station = booking.station
        ? await Station.findById(booking.station)
        : await Station.findOne({ name: booking.stationName })
    } else {
      const isId = mongoose.isValidObjectId(stationKey)
      station = isId
        ? await Station.findById(stationKey)
        : await Station.findOne({ name: new RegExp(`^${stationKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
    }
    if (!station) return res.status(404).json({ message: 'Station not found.' })
    if (station.status === 'maintenance') return res.status(409).json({ message: 'Station is in maintenance.' })
    if (!['available', 'reserved'].includes(station.status)) return res.status(409).json({ message: 'Station is not available.' })

    const chargeRate = Number(booking ? booking.hourlyRate : hourlyRate ?? rate ?? station.hourlyRate ?? process.env.DEFAULT_HOURLY_RATE ?? 10)
    if (!Number.isFinite(chargeRate) || chargeRate < 0) return res.status(400).json({ message: 'Hourly rate must be a non-negative number.' })
    if (typeof sessionType !== 'string' || !sessionType.trim() || sessionType.length > 40) {
      return res.status(400).json({ message: 'Session type must contain 1 to 40 characters.' })
    }

    const now = new Date()
    const reservedStation = await Station.findOneAndUpdate(
      {
        _id: station._id,
        status: { $in: ['available', 'reserved'] },
        $or: [
          { bookingLockExpiresAt: { $lte: now } },
          { bookingLockExpiresAt: null },
          { bookingLockExpiresAt: { $exists: false } }
        ]
      },
      { $set: { status: 'playing' }, $unset: { bookingLockToken: 1, bookingLockExpiresAt: 1 } },
      { new: true }
    )
    if (!reservedStation) return res.status(409).json({ message: 'Station is no longer available.' })
    stationReserved = true
    previousStationStatus = station.status
    createdSession = await PlaySession.create({
      station: station._id,
      stationName: station.name,
      booking: booking?._id || null,
      reservedDurationMinutes: booking?.durationMinutes || null,
      customerName: String(booking?.customerName || customerName || customer || 'Walk-in player').trim().slice(0, 100),
      customerPhone: booking?.phone || (customerPhone ? String(customerPhone).trim().slice(0, 30) : undefined),
      sessionType: booking ? 'Reservation' : sessionType.trim(),
      hourlyRate: chargeRate,
      paymentMethod: paymentMethod ? normalizePaymentMethod(paymentMethod) : null
    })
    if (booking) {
      const claimedBooking = await Booking.findOneAndUpdate(
        { _id: booking._id, status: 'Checked In', session: null },
        { $set: { status: 'In Progress', session: createdSession._id, station: station._id, stationName: station.name } },
        { new: true, runValidators: true }
      )
      if (!claimedBooking) {
        const conflict = new Error('The reservation was already started or changed. Refresh reservations before retrying.')
        conflict.status = 409
        throw conflict
      }
      booking = claimedBooking
    }
    return res.status(201).json({ session: createdSession, booking })
  } catch (error) {
    if (createdSession) {
      try {
        await PlaySession.deleteOne({ _id: createdSession._id })
      } catch (cleanupError) {
        console.error('[session] Failed to remove a session after reservation start failed:', cleanupError)
      }
    }
    if (stationReserved && station) {
      try {
        await Station.updateOne(
          { _id: station._id, status: 'playing' },
          { $set: { status: previousStationStatus || 'available' } }
        )
      } catch (cleanupError) {
        console.error('[session] Failed to release station after session start failed:', cleanupError)
      }
    }
    if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
      return res.status(error.status).json({ message: error.message })
    }
    return next(error)
  }
}

export async function pauseSession(req, res, next) {
  try {
    const session = await findSession(req.params.id)
    if (!session) return res.status(404).json({ message: 'Session not found.' })
    if (session.status !== 'active') return res.status(409).json({ message: 'Only an active session can be paused.' })
    session.status = 'paused'
    session.pausedAt = new Date()
    await session.save()
    return res.json({ session })
  } catch (error) {
    return next(error)
  }
}

export async function resumeSession(req, res, next) {
  try {
    const session = await findSession(req.params.id)
    if (!session) return res.status(404).json({ message: 'Session not found.' })
    if (session.status !== 'paused' || !session.pausedAt) return res.status(409).json({ message: 'Only a paused session can be resumed.' })
    session.pausedDurationMs += Math.max(0, Date.now() - session.pausedAt.getTime())
    session.pausedAt = null
    session.status = 'active'
    await session.save()
    return res.json({ session })
  } catch (error) {
    return next(error)
  }
}

export async function transferSession(req, res, next) {
  let targetStation
  let reservedTarget = false
  let movedSession
  try {
    const { stationId } = req.body || {}
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid session ID.' })
    if (!mongoose.isValidObjectId(stationId)) return res.status(400).json({ message: 'Select a valid destination station.' })

    const session = await PlaySession.findById(req.params.id)
    if (!session) return res.status(404).json({ message: 'Session not found.' })
    if (!['active', 'paused'].includes(session.status)) return res.status(409).json({ message: 'Only an active or paused session can be transferred.' })
    if (String(session.station) === String(stationId)) return res.status(400).json({ message: 'Choose a different station.' })

    const sourceStation = await Station.findById(session.station)
    if (!sourceStation) return res.status(404).json({ message: 'The current station for this session was not found.' })
    targetStation = await Station.findById(stationId)
    if (!targetStation) return res.status(404).json({ message: 'Destination station not found.' })
    if (targetStation.status !== 'available') return res.status(409).json({ message: 'Destination station is no longer free.' })

    const lockedTarget = await Station.findOneAndUpdate(
      { _id: targetStation._id, status: 'available' },
      { $set: { status: 'playing' } },
      { new: true }
    )
    if (!lockedTarget) return res.status(409).json({ message: 'Destination station is no longer free.' })
    reservedTarget = true

    movedSession = await PlaySession.findOneAndUpdate(
      { _id: session._id, station: sourceStation._id, status: { $in: ['active', 'paused'] } },
      { $set: { station: lockedTarget._id, stationName: lockedTarget.name } },
      { new: true, runValidators: true }
    )
    if (!movedSession) {
      await Station.updateOne({ _id: lockedTarget._id, status: 'playing' }, { $set: { status: 'available' } })
      reservedTarget = false
      return res.status(409).json({ message: 'This session changed before it could be transferred. Refresh the floor plan and try again.' })
    }

    await Station.updateOne({ _id: sourceStation._id, status: 'playing' }, { $set: { status: 'available' } })
    return res.json({ session: movedSession })
  } catch (error) {
    if (movedSession) {
      return res.json({ session: movedSession, warning: 'The session moved, but the previous station status could not be updated. Refresh the floor plan.' })
    }
    if (reservedTarget && targetStation) {
      await Station.updateOne({ _id: targetStation._id, status: 'playing' }, { $set: { status: 'available' } })
    }
    return next(error)
  }
}

export async function endSession(req, res, next) {
  try {
    const session = await findSession(req.params.id)
    if (!session) return res.status(404).json({ message: 'Session not found.' })
    if (!['active', 'paused'].includes(session.status)) return res.status(409).json({ message: 'Session is not active.' })
    const endedAt = new Date()
    let pausedDurationMs = session.pausedDurationMs
    if (session.status === 'paused' && session.pausedAt) pausedDurationMs += Math.max(0, endedAt.getTime() - session.pausedAt.getTime())
    const playedMs = Math.max(0, endedAt.getTime() - session.startedAt.getTime() - pausedDurationMs)
    const playedHours = playedMs / (60 * 60 * 1000)
    session.status = 'completed'
    session.pausedAt = null
    session.pausedDurationMs = pausedDurationMs
    session.endedAt = endedAt
    session.playedHours = Math.round(playedHours * 1000000) / 1000000
    session.revenue = Math.round(playedHours * session.hourlyRate * 100) / 100
    session.paymentMethod = null
    session.paymentStatus = 'unpaid'
    session.reason = String(req.body.reason || '').trim().slice(0, 500)
    await session.save()
    await Station.findByIdAndUpdate(session.station, { $set: { status: 'available' } })
    if (session.booking) {
      const booking = await Booking.findOne({ _id: session.booking, session: session._id, status: 'In Progress' })
      if (!booking) {
        return res.status(409).json({ message: 'The gaming session ended, but its reservation status could not be updated. Refresh reservations and reconcile it.' })
      }
      booking.status = 'Completed'
      booking.finalPrice = session.revenue
      if (booking.paymentStatus === 'Paid' && booking.amountPaid < session.revenue) booking.paymentStatus = 'Partially Paid'
      if (booking.paymentStatus === 'Partially Paid' && booking.amountPaid >= session.revenue) booking.paymentStatus = 'Paid'
      await booking.save()
      if (booking.paymentStatus === 'Paid') {
        session.paymentStatus = 'paid'
        session.paymentMethod = booking.paymentMethod || null
        await session.save()
      }
    }
    return res.json({ session })
  } catch (error) {
    return next(error)
  }
}

export async function updateSessionPayment(req, res, next) {
  try {
    const session = await findSession(req.params.id)
    if (!session) return res.status(404).json({ message: 'Session not found.' })
    if (session.status !== 'completed') return res.status(409).json({ message: 'Only a completed session can have its payment confirmed.' })
    const paymentStatus = String(req.body.paymentStatus || '')
    if (!['paid', 'unpaid'].includes(paymentStatus)) return res.status(400).json({ message: 'Payment status must be paid or unpaid.' })
    const paymentMethod = paymentStatus === 'paid' ? normalizePaymentMethod(req.body.paymentMethod) : null
    if (paymentStatus === 'paid' && !SESSION_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'Choose a supported payment method to confirm payment.' })
    }
    session.paymentStatus = paymentStatus
    session.paymentMethod = paymentMethod
    await session.save()
    if (session.booking) {
      const booking = await Booking.findOne({ _id: session.booking, session: session._id })
      if (booking) {
        booking.paymentStatus = paymentStatus === 'paid' ? 'Paid' : 'Unpaid'
        booking.amountPaid = paymentStatus === 'paid' ? Number(booking.finalPrice ?? booking.totalPrice) : 0
        booking.paymentMethod = paymentMethod || ''
        booking.paidAt = paymentStatus === 'paid' ? new Date() : null
        await booking.save()
      }
    }
    return res.json({ session })
  } catch (error) {
    return next(error)
  }
}

export async function cancelSession(req, res, next) {
  try {
    const session = await findSession(req.params.id)
    if (!session) return res.status(404).json({ message: 'Session not found.' })
    if (!['active', 'paused'].includes(session.status)) return res.status(409).json({ message: 'Only an active or paused session can be cancelled.' })
    const reason = String(req.body?.reason || '').trim()
    if (!reason) return res.status(400).json({ message: 'A cancellation reason is required.' })
    session.status = 'cancelled'
    session.endedAt = new Date()
    session.pausedAt = null
    session.reason = reason.slice(0, 500)
    await session.save()
    await Station.findByIdAndUpdate(session.station, { $set: { status: 'available' } })
    return res.json({ session })
  } catch (error) {
    return next(error)
  }
}

export async function reverseSession(req, res, next) {
  try {
    const session = await findSession(req.params.id)
    if (!session) return res.status(404).json({ message: 'Session not found.' })
    if (session.status !== 'completed') return res.status(409).json({ message: 'Only a completed session can be reversed.' })
    session.status = 'reversed'
    session.paymentStatus = 'refunded'
    session.reversedAt = new Date()
    session.reversedBy = req.user?._id || null
    session.reversalReason = String(req.body.reason || '').trim().slice(0, 500)
    await session.save()
    return res.json({ session })
  } catch (error) {
    return next(error)
  }
}
