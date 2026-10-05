import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Shop from '../models/Shop.js'

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 120000

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username,
    role: user.role,
    phone: user.phone,
    shopId: user.shopId ? String(user.shopId) : null
  }
}

export async function registerShop(req, res, next) {
  let shop
  try {
    const name = String(req.body?.storeName || '').trim()
    const phone = String(req.body?.phone || '').trim()
    const usernameInput = String(req.body?.username || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const username = usernameInput || phone.replace(/\D/g, '')
    if (!name || name.length > 120 || !/^\+?[0-9 ]{7,18}$/.test(phone) ||
      !/^[a-z0-9._-]{3,50}$/.test(username) || password.length < 10 || password.length > 128) {
      return res.status(400).json({ message: 'Enter a store name, valid phone number, and password (10-128 characters).' })
    }
    if (await User.exists({ $or: [{ username }, { phone }] })) {
      return res.status(409).json({ message: 'That username or phone number is already registered.' })
    }
    const passwordHash = await bcrypt.hash(password, 12)
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    shop = await Shop.create({
      name,
      phone,
      ownerPhone: phone,
      ownerUsername: username,
      license: { status: 'trial', plan: 'Free trial', expiresAt }
    })
    const user = await User.create({
      name,
      username,
      phone,
      role: 'Admin',
      shopId: shop._id,
      passwordHash,
      pinHash: passwordHash
    })
    return res.status(201).json({
      message: 'Your shop is registered with a 2-month free trial.',
      user: publicUser(user),
      shop: { id: String(shop._id), name: shop.name, license: shop.license }
    })
  } catch (error) {
    if (shop?._id) await Shop.deleteOne({ _id: shop._id }).catch(() => {})
    if (error.code === 11000) return res.status(409).json({ message: 'That username or phone number is already registered.' })
    return next(error)
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
    const identity = String(req.body?.username || req.body?.phone || '').trim().toLowerCase()
    const normalizedPhone = identity.replace(/\D/g, '')
    const credential = getCredential(req.body).trim()

    if (!identity || !credential) {
      return res.status(400).json({
        message: 'Phone number or username and password or 6-digit PIN are required.'
      })
    }

    const identityQuery = [{ username: identity }]
    if (normalizedPhone) {
      identityQuery.push({ username: normalizedPhone }, { phone: identity }, { phone: normalizedPhone })
    }
    const user = await User.findOne({ $or: identityQuery }).select('+passwordHash +pinHash')
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
        username: user.username,
        shopId: user.shopId ? String(user.shopId) : null
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
