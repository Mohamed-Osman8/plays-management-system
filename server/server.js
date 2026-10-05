import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import mongoose from 'mongoose'
import { connectDatabase } from './config/db.js'
import { ensureTenantIndexes } from './config/tenantIndexes.js'
import authRoutes from './routes/authRoutes.js'
import userRoutes from './routes/userRoutes.js'
import bookingRoutes from './routes/bookingRoutes.js'
import stationRoutes from './routes/stationRoutes.js'
import productRoutes from './routes/productRoutes.js'
import sessionRoutes from './routes/sessionRoutes.js'
import reportRoutes from './routes/reportRoutes.js'
import membershipRoutes from './routes/membershipRoutes.js'
import salesRoutes from './routes/salesRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'
import shopRoutes from './routes/shopRoutes.js'
import superAdminRoutes from './routes/superAdminRoutes.js'

const app = express()
const DEFAULT_PORT = Number.parseInt(process.env.PORT || '5001', 10) || 5001
let port = DEFAULT_PORT

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured')
}
if (Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
  throw new Error('JWT_SECRET must be at least 32 bytes. Generate a unique, random secret before starting the server.')
}

const configuredOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedOrigins = new Set([
  ...configuredOrigins,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
])

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true)
    return callback(new Error('Origin is not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '1mb' }))

const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 10 * 30 * 1000),
  limit: Number(process.env.RATE_LIMIT_MAX || 100),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' }
})
const authLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 10 * 30 * 1000),
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again later.' }
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'playstation-game-zone-server' })
})

app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/super-admin', authLimiter, superAdminRoutes)
app.use('/api', apiLimiter)
app.use('/api/shop', shopRoutes)
app.use('/api/users', userRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/stations', stationRoutes)
app.use('/api/products', productRoutes)
app.use('/api/sales', salesRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/sessions', sessionRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/memberships', membershipRoutes)

app.use((error, _req, res, _next) => {
  if (error && error.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({ message: 'Origin is not allowed.' })
  }
  if (error?.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Request validation failed.',
      errors: Object.values(error.errors || {}).map((item) => item.message)
    })
  }
  if (error?.name === 'CastError') return res.status(400).json({ message: 'Invalid identifier or field value.' })
  if (error?.code === 11000) return res.status(409).json({ message: 'A record with those details already exists.' })
  console.error(error)
  res.status(500).json({ message: 'Internal server error.' })
})

let server
let shuttingDown = false

async function shutdown(reason, error) {
  if (shuttingDown) return
  shuttingDown = true
  if (error) console.error(`${reason}:`, error)
  else console.warn(reason)

  try {
    if (server) await new Promise((resolve) => server.close(resolve))
    await mongoose.disconnect()
  } finally {
    process.exitCode = error ? 1 : 0
  }
}

process.on('unhandledRejection', (error) => {
  void shutdown('Unhandled promise rejection', error)
})
process.on('uncaughtException', (error) => {
  void shutdown('Uncaught exception', error)
})
process.once('SIGTERM', () => {
  void shutdown('SIGTERM received')
})
process.once('SIGINT', () => {
  void shutdown('SIGINT received')
})

function listenOnPort(candidatePort) {
  return new Promise((resolve, reject) => {
    const candidate = app.listen(candidatePort)

    const handleListening = () => {
      candidate.removeListener('error', handleError)
      resolve(candidate)
    }

    const handleError = (error) => {
      candidate.removeListener('listening', handleListening)
      candidate.close()
      reject(error)
    }

    candidate.once('listening', handleListening)
    candidate.once('error', handleError)
  })
}

async function tryListen(startPort, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    const candidatePort = startPort + i

    try {
      server = await listenOnPort(candidatePort)
      console.log(`Server listening on http://localhost:${candidatePort}`)
      return candidatePort
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        console.warn(`Port ${candidatePort} is in use, trying ${candidatePort + 1}...`)
        continue
      }
      throw error
    }
  }

  throw new Error(`Unable to bind to a port in range ${startPort}-${startPort + attempts - 1}`)
}

async function startServer() {
  await connectDatabase()
  await ensureTenantIndexes()

  // Attempt to bind to requested port; fall back to next ports if in use.
  const boundPort = await tryListen(port)

  // Persist chosen port
  port = boundPort
}

startServer().catch((error) => {
  console.error('Unable to start server:', error)
  void shutdown('Unable to start server', error)
})
