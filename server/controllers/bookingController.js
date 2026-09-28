import Booking from '../models/Booking.js'
import Station from '../models/Station.js'

export async function requestBooking(req, res, next) {
  try {
    const { customerName, name, phone, consoleType, stationName, station, date, arrivalTime, time } = req.body
    const normalizedConsole = String(consoleType || '').replace('PlayStation ', 'PS')
    const booking = await Booking.create({
      customerName: customerName || name,
      phone: String(phone || '').trim(),
      consoleType: normalizedConsole,
      stationName: stationName || station,
      date,
      arrivalTime: arrivalTime || time,
      status: 'Pending'
    })
    return res.status(201).json({ booking })
  } catch (error) {
    if (error.name === 'ValidationError') return res.status(400).json({ message: 'Invalid booking details.', errors: Object.values(error.errors).map((item) => item.message) })
    return next(error)
  }
}

export async function listBookings(_req, res, next) {
  try {
    return res.json({ bookings: await Booking.find().sort({ createdAt: -1 }) })
  } catch (error) {
    return next(error)
  }
}

async function setBookingStatus(req, res, next, status) {
  try {
    const booking = await Booking.findById(req.params.id)
    if (!booking) return res.status(404).json({ message: 'Booking not found.' })
    booking.status = status
    await booking.save()
    if (status === 'Approved') {
      await Station.findOneAndUpdate({ name: booking.stationName }, { status: 'reserved' })
    }
    return res.json({ booking, message: status === 'Approved' ? 'Booking approved.' : 'Booking rejected.' })
  } catch (error) {
    return next(error)
  }
}

export const approveBooking = (req, res, next) => setBookingStatus(req, res, next, 'Approved')
export const rejectBooking = (req, res, next) => setBookingStatus(req, res, next, 'Rejected')
