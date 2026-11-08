import mongoose from 'mongoose'
import Booking from '../models/Booking.js'
import PlaySession from '../models/PlaySession.js'
import Station from '../models/Station.js'

export const blockingBookingStatuses = ['Pending', 'Confirmed', 'Checked In', 'In Progress']
export const legacyBlockingBookingStatuses = ['Pending', 'Approved']
export const bookingLockDurationMs = 5 * 60 * 1000

export function bookingError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function parseLocalDateTime(date, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw bookingError(400, 'Choose a valid booking date and start time.')
  }

  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute)
  const validDate = new Date(targetUtc)
  if (validDate.getUTCFullYear() !== year || validDate.getUTCMonth() !== month - 1 || validDate.getUTCDate() !== day) {
    throw bookingError(400, 'Choose a valid booking date.')
  }

  let candidate = targetUtc
  let formatter
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value }) => [type, value]))
      const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
      const difference = localAsUtc - targetUtc
      if (difference === 0) break
      candidate -= difference
    }
  } catch {
    throw bookingError(400, 'The shop has an invalid time zone configuration.')
  }

  const actual = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value }) => [type, value]))
  if (
    Number(actual.year) !== year ||
    Number(actual.month) !== month ||
    Number(actual.day) !== day ||
    Number(actual.hour) !== hour ||
    Number(actual.minute) !== minute
  ) {
    throw bookingError(400, 'That local time does not exist in the shop time zone.')
  }
  return new Date(candidate)
}

export function createBookingWindow({ date, time, durationMinutes, shop, now = new Date() }) {
  const settings = shop.bookingSettings || {}
  const interval = Number(settings.slotIntervalMinutes || 30)
  const duration = Number(durationMinutes)
  const durations = (settings.durationOptionsMinutes || [30, 60, 90, 120]).map(Number)
  const openTime = settings.openTime || '09:00'
  const closeTime = settings.closeTime || '23:00'

  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw bookingError(400, 'Choose a valid booking date and start time.')
  }
  if (!Number.isInteger(interval) || interval < 1 || closeTime <= openTime) {
    throw bookingError(400, 'The shop has invalid operating hours or booking intervals configured.')
  }
  if (!Number.isInteger(duration) || !durations.includes(duration)) {
    throw bookingError(400, 'Choose one of the booking durations offered by this shop.')
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closeTime)) {
    throw bookingError(400, 'The shop has invalid operating hours configured.')
  }

  const startMinute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  const closeMinute = Number(closeTime.slice(0, 2)) * 60 + Number(closeTime.slice(3, 5))
  const openMinute = Number(openTime.slice(0, 2)) * 60 + Number(openTime.slice(3, 5))
  if (startMinute < openMinute || startMinute % interval !== 0 || startMinute + duration > closeMinute) {
    throw bookingError(400, `Bookings must start on a ${interval}-minute interval and finish within shop hours (${openTime}-${closeTime}).`)
  }

  const startsAt = parseLocalDateTime(date, time, settings.timeZone || 'Africa/Addis_Ababa')
  if (startsAt <= now) throw bookingError(400, 'Bookings cannot be made for a past time.')
  const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000)
  return { startsAt, endsAt, durationMinutes: duration, timeZone: settings.timeZone || 'Africa/Addis_Ababa' }
}

export function getShopHourlyRate(shop, consoleType) {
  const rateKey = { PS4: 'ps4', PS5: 'ps5', VIP: 'vip', Other: 'other' }[consoleType]
  const rate = Number(shop.rates?.[rateKey])
  if (!Number.isFinite(rate) || rate < 0) throw bookingError(400, 'A valid hourly rate is not configured for this station type.')
  return rate
}

export async function acquireStationBookingLock(stationId) {
  const now = new Date()
  const token = new mongoose.Types.ObjectId().toString()
  const station = await Station.findOneAndUpdate(
    {
      _id: stationId,
      $or: [
        { bookingLockExpiresAt: { $lte: now } },
        { bookingLockExpiresAt: null },
        { bookingLockExpiresAt: { $exists: false } }
      ]
    },
    { $set: { bookingLockToken: token, bookingLockExpiresAt: new Date(now.getTime() + bookingLockDurationMs) } },
    { new: true }
  )
  if (!station) throw bookingError(409, 'This station is being booked by another request. Please check availability and try again.')
  return { station, token }
}

export async function releaseStationBookingLock(stationId, token) {
  await Station.updateOne(
    { _id: stationId, bookingLockToken: token },
    { $unset: { bookingLockToken: 1, bookingLockExpiresAt: 1 } }
  )
}

export async function findBookingConflict({ stationId, stationName, date, startsAt, endsAt, excludeBookingId }) {
  const filter = {
    station: stationId,
    status: { $in: [...blockingBookingStatuses, ...legacyBlockingBookingStatuses] },
    startsAt: { $lt: endsAt },
    endsAt: { $gt: startsAt }
  }
  if (excludeBookingId) filter._id = { $ne: excludeBookingId }
  if (await Booking.exists(filter)) return true

  if (!stationName || !date) return false
  const legacyFilter = {
    stationName,
    date,
    status: { $in: legacyBlockingBookingStatuses },
    $or: [
      { station: null },
      { station: { $exists: false } },
      { startsAt: null },
      { startsAt: { $exists: false } }
    ]
  }
  if (excludeBookingId) legacyFilter._id = { $ne: excludeBookingId }
  return Boolean(await Booking.exists(legacyFilter))
}

export async function findActiveSessionConflicts({ stations, startsAt, endsAt }) {
  if (!stations.length) return new Set()
  const sessions = await PlaySession.find({
    station: { $in: stations.map((station) => station._id) },
    status: { $in: ['active', 'paused'] }
  }).select('station startedAt reservedDurationMinutes pausedDurationMs pausedAt').lean()
  const conflictingStations = new Set()
  for (const session of sessions) {
    if (!session.startedAt) {
      conflictingStations.add(String(session.station))
      continue
    }
    if (!session.reservedDurationMinutes) {
      conflictingStations.add(String(session.station))
      continue
    }
    const expectedEnd = new Date(
      new Date(session.startedAt).getTime() +
      Number(session.reservedDurationMinutes) * 60 * 1000 +
      Number(session.pausedDurationMs || 0) +
      (session.status === 'paused' && session.pausedAt ? Math.max(0, Date.now() - new Date(session.pausedAt).getTime()) : 0)
    )
    if (new Date(session.startedAt) < endsAt && expectedEnd > startsAt) {
      conflictingStations.add(String(session.station))
    }
  }
  return conflictingStations
}
