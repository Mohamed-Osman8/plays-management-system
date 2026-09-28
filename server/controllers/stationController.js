import Station from '../models/Station.js'
import PlaySession from '../models/PlaySession.js'
import mongoose from 'mongoose'

export async function listStations(_req, res, next) {
  try {
    return res.json({ stations: await Station.find().sort({ name: 1 }) })
  } catch (error) {
    return next(error)
  }
}

export async function updateStationHealth(req, res, next) {
  try {
    const { component = 'controller', status } = req.body
    if (!['controller', 'console'].includes(component)) return res.status(400).json({ message: 'Component must be controller or console.' })
    if (!['healthy', 'needs_attention', 'offline'].includes(status)) return res.status(400).json({ message: 'Invalid hardware status.' })

    const station = await Station.findById(req.params.id)
    if (!station) return res.status(404).json({ message: 'Station not found.' })
    station.hardware[component] = status
    await station.save()
    return res.json({ station, alert: status === 'healthy' ? null : { station: station.name, component, status } })
  } catch (error) {
    return next(error)
  }
}

export async function createStation(req, res, next) {
  try {
    const { name, hourlyRate, status } = req.body
    const rawType = String(req.body.type || '').trim().toLowerCase()
    const type = rawType === 'ps4' || rawType === 'playstation 4' ? 'PS4'
      : rawType === 'ps5' || rawType === 'playstation 5' ? 'PS5' : ''
    if (!String(name || '').trim() || !type) {
      return res.status(400).json({ message: 'A station name and type (PS4 or PS5) are required.' })
    }
    if (status !== undefined && !['available', 'reserved', 'maintenance'].includes(status)) {
      return res.status(400).json({ message: 'New stations must be available, reserved, or in maintenance.' })
    }
    const station = await Station.create({ name, type, hourlyRate, status })
    return res.status(201).json({ station })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A station with this name already exists.' })
    return next(error)
  }
}

export async function updateStation(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid station ID.' })
    const updates = {}
    for (const key of ['name', 'type', 'hourlyRate']) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'At least one station field is required.' })
    if (updates.type !== undefined) {
      const rawType = String(updates.type).trim().toLowerCase()
      updates.type = rawType === 'ps4' || rawType === 'playstation 4' ? 'PS4'
        : rawType === 'ps5' || rawType === 'playstation 5' ? 'PS5' : ''
      if (!updates.type) return res.status(400).json({ message: 'Station type must be PlayStation 4/PS4 or PlayStation 5/PS5.' })
    }
    const station = await Station.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    if (!station) return res.status(404).json({ message: 'Station not found.' })
    return res.json({ station })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A station with this name already exists.' })
    return next(error)
  }
}

export async function updateStationStatus(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid station ID.' })
    const { status, reason = '' } = req.body
    if (!['available', 'reserved', 'maintenance'].includes(status)) {
      return res.status(400).json({ message: 'Status must be available, reserved, or maintenance.' })
    }
    const station = await Station.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: 'playing' } },
      { $set: { status, maintenanceReason: status === 'maintenance' ? String(reason).trim().slice(0, 500) : '' } },
      { new: true, runValidators: true }
    )
    if (!station) {
      const exists = await Station.exists({ _id: req.params.id })
      return exists
        ? res.status(409).json({ message: 'End or cancel the active session before changing station status.' })
        : res.status(404).json({ message: 'Station not found.' })
    }
    return res.json({ station })
  } catch (error) {
    return next(error)
  }
}

export async function deleteStation(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid station ID.' })
    const activeSession = await PlaySession.exists({ station: req.params.id, status: { $in: ['active', 'paused'] } })
    if (activeSession) return res.status(409).json({ message: 'A station with an active session cannot be deleted.' })
    const station = await Station.findOneAndDelete({ _id: req.params.id, status: { $ne: 'playing' } })
    if (!station) {
      const exists = await Station.exists({ _id: req.params.id })
      return exists
        ? res.status(409).json({ message: 'A station with an active session cannot be deleted.' })
        : res.status(404).json({ message: 'Station not found.' })
    }
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}
