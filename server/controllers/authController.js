import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 120000

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username,
    role: user.role,
    phone: user.phone
  }
}

function getCredential(body = {}) {
  if (body.password !== undefined) return String(body.password)
  if (body.pin !== undefined) return String(body.pin)
  if (body.passwordOrPin !== undefined) return String(body.passwordOrPin)
  return ''
}

export async function login(req, res, next) {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase()
    const credential = getCredential(req.body).trim()

    if (!username || !credential) {
      return res.status(400).json({
        message: 'Username and password or 6-digit PIN are required.'
      })
    }

    const user = await User.findOne({ username }).select('+passwordHash +pinHash')
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password.' })
    }

    const now = Date.now()
    const lockoutUntil = user.lockoutUntil ? new Date(user.lockoutUntil).getTime() : 0

    if (lockoutUntil > now) {
      const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000)
      return res.status(423).json({
        message: 'Account locked for 120 seconds.',
        lockoutUntil: new Date(lockoutUntil).toISOString(),
        remainingSeconds
      })
    }

    const passwordMatches = user.passwordHash
      ? await bcrypt.compare(credential, user.passwordHash)
      : false
    const pinMatches = user.pinHash
      ? await bcrypt.compare(credential, user.pinHash)
      : false

    if (!passwordMatches && !pinMatches) {
      user.loginAttempts = (user.loginAttempts || 0) + 1
      const shouldLock = user.loginAttempts >= LOCKOUT_THRESHOLD

      if (shouldLock) {
        user.lockoutUntil = new Date(now + LOCKOUT_DURATION_MS)
      }

      await user.save()

      if (shouldLock) {
        return res.status(423).json({
          message: 'Too many failed attempts. Account locked for 120 seconds.',
          lockoutUntil: user.lockoutUntil.toISOString(),
          remainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000)
        })
      }

      return res.status(401).json({
        message: 'Invalid username or password.',
        attemptsRemaining: LOCKOUT_THRESHOLD - user.loginAttempts
      })
    }

    user.loginAttempts = 0
    user.lockoutUntil = null
    await user.save()

    if (!process.env.JWT_SECRET) {
      return next(new Error('JWT_SECRET is not configured.'))
    }

    const token = jwt.sign(
      {
        sub: String(user._id),
        role: user.role,
        username: user.username
      },
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '8h'
      }
    )

    return res.json({
      token,
      accessToken: token,
      user: publicUser(user)
    })
  } catch (error) {
    return next(error)
  }
}
