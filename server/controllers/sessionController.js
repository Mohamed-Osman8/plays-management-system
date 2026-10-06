import mongoose from 'mongoose'
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
  try {
    const { stationName, stationId, customerName, customer, customerPhone, sessionType = 'Hourly', hourlyRate, rate, paymentMethod } = req.body
    const stationKey = String(stationName || stationId || '').trim()
    if (!stationKey) return res.status(400).json({ message: 'stationName is required.' })
    if (paymentMethod !== undefined && !validPaymentMethod(paymentMethod)) return res.status(400).json({ message: 'Unsupported payment method.' })

    const isId = mongoose.isValidObjectId(stationKey)
    station = isId
      ? await Station.findById(stationKey)
      : await Station.findOne({ name: new RegExp(`^${stationKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
    if (!station) return res.status(404).json({ message: 'Station not found.' })
    if (station.status === 'maintenance') return res.status(409).json({ message: 'Station is in maintenance.' })
    if (!['available', 'reserved'].includes(station.status)) return res.status(409).json({ message: 'Station is not available.' })

    const chargeRate = Number(hourlyRate ?? rate ?? station.hourlyRate ?? process.env.DEFAULT_HOURLY_RATE ?? 10)
    if (!Number.isFinite(chargeRate) || chargeRate < 0) return res.status(400).json({ message: 'Hourly rate must be a non-negative number.' })
    if (typeof sessionType !== 'string' || !sessionType.trim() || sessionType.length > 40) {
      return res.status(400).json({ message: 'Session type must contain 1 to 40 characters.' })
    }

    const reservedStation = await Station.findOneAndUpdate(
      { _id: station._id, status: { $in: ['available', 'reserved'] } },
      { $set: { status: 'playing' } },
      { new: true }
    )
    if (!reservedStation) return res.status(409).json({ message: 'Station is no longer available.' })
    stationReserved = true
    const session = await PlaySession.create({
      station: station._id,
      stationName: station.name,
      customerName: String(customerName || customer || 'Walk-in player').trim().slice(0, 100),
      customerPhone: customerPhone ? String(customerPhone).trim().slice(0, 30) : undefined,
      sessionType: sessionType.trim(),
      hourlyRate: chargeRate,
      paymentMethod: paymentMethod ? normalizePaymentMethod(paymentMethod) : null
    })
    return res.status(201).json({ session })
  } catch (error) {
    if (stationReserved && station) await Station.updateOne({ _id: station._id, status: 'playing' }, { $set: { status: 'available' } }).catch(() => {})
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

export async function endSession(req, res, next) {
  try {
    const session = await findSession(req.params.id)
    if (!session) return res.status(404).json({ message: 'Session not found.' })
    if (!['active', 'paused'].includes(session.status)) return res.status(409).json({ message: 'Session is not active.' })
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod || session.paymentMethod || 'cash')
    if (!SESSION_PAYMENT_METHODS.includes(paymentMethod)) return res.status(400).json({ message: 'Unsupported payment method.' })
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
    session.paymentMethod = paymentMethod
    session.paymentStatus = 'paid'
    session.reason = String(req.body.reason || '').trim().slice(0, 500)
    await session.save()
    await Station.findByIdAndUpdate(session.station, { $set: { status: 'available' } })
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
