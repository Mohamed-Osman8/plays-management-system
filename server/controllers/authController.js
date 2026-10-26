import bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Shop from '../models/Shop.js'

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 120000
const RESET_OTP_TTL_MS = 5 * 60 * 1000
const RESET_OTP_COOLDOWN_MS = 60 * 1000
const RESET_OTP_MAX_ATTEMPTS = 5
const GENERIC_RESET_MESSAGE = 'If an account exists for that phone number or username, a verification code has been sent.'
const PENDING_SHOP_MESSAGE = 'Akoonkaaga wali ma firfircona. Fadlan kala xiriir maamulka Mohamed Osman (+251940867287) si loo kordhiyo/loo firfircooneeyo.'
const INACTIVE_SHOP_MESSAGE = 'Akoonka dukaankan lama hawlgelin ama waa la hakiyey. Fadlan kala xiriir Mohamed Osman (+251940867287).'

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase()
}

function identityQuery(identity) {
  const digits = identity.replace(/\D/g, '')
  const conditions = [{ username: identity }]
  if (digits.length >= 7 && digits.length <= 18) {
    const spacedPhonePattern = `^\\+?\\s*${digits.split('').join('\\s*')}\\s*$`
    conditions.push({ phone: { $regex: spacedPhonePattern } })
  }
  return { $or: conditions }
}

async function sendPasswordResetOtp(user, otp) {
  const smsApiUrl = process.env.SMS_API_URL
  const smsApiToken = process.env.SMS_API_TOKEN

  if (!smsApiUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMS_API_URL must be configured before password reset can be used in production.')
    }
    console.info(`[password-reset] Development OTP for ${user.username}: ${otp}`)
    return
  }

  const url = new URL(smsApiUrl)
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('SMS_API_URL must use HTTPS in production.')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(smsApiToken ? { Authorization: `Bearer ${smsApiToken}` } : {})
    },
    body: JSON.stringify({
      to: user.phone,
      message: `Your PLAYA Game Zone password reset code is ${otp}. It expires in 5 minutes.`
    }),
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) throw new Error(`SMS delivery failed with status ${response.status}.`)
}

function clearResetOtp(user) {
  user.resetOtp = null
  user.resetOtpExpires = null
  user.resetOtpRequestedAt = null
  user.resetOtpAttempts = 0
}

function publicUser(user) {
  return {
    id: user._id ? String(user._id) : 'superadmin-id',
    name: user.name || 'Mohamed Osman (Super-Admin)',
    username: user.username,
    role: user.role,
    phone: user.phone || '+251940867287',
    shopId: user.shopId ? String(user.shopId) : null
  }
}

export async function requestPasswordReset(req, res, next) {
  try {
    const identity = normalizeIdentity(req.body?.phone || req.body?.username || req.body?.identifier)
    if (!identity || identity.length > 50) {
      return res.status(400).json({ message: 'Enter a valid phone number or username.' })
    }

    if (process.env.NODE_ENV === 'production' && !process.env.SMS_API_URL) {
      return res.status(503).json({ message: 'Password reset is temporarily unavailable. Please contact your administrator.' })
    }

    const user = await User.findOne(identityQuery(identity))
      .select('+resetOtpRequestedAt')
    if (!user) return res.json({ message: GENERIC_RESET_MESSAGE })

    const now = Date.now()
    const lastRequestedAt = user.resetOtpRequestedAt ? new Date(user.resetOtpRequestedAt).getTime() : 0
    if (lastRequestedAt > now - RESET_OTP_COOLDOWN_MS) {
      return res.json({ message: GENERIC_RESET_MESSAGE })
    }

    const otp = String(randomInt(0, 1000000)).padStart(6, '0')
    user.resetOtp = otp
    user.resetOtpExpires = new Date(now + RESET_OTP_TTL_MS)
    user.resetOtpRequestedAt = new Date(now)
    user.resetOtpAttempts = 0
    await user.save()

    try {
      await sendPasswordResetOtp(user, otp)
    } catch (deliveryError) {
      console.error('Password reset SMS delivery failed.', deliveryError)
      clearResetOtp(user)
      await user.save()
      return res.status(503).json({ message: 'Unable to send a verification code right now. Please try again later.' })
    }

    return res.json({ message: GENERIC_RESET_MESSAGE })
  } catch (error) {
    return next(error)
  }
}

export async function resetPasswordWithOtp(req, res, next) {
  try {
    const identity = normalizeIdentity(req.body?.phone || req.body?.username || req.body?.identifier)
    const otp = String(req.body?.otp || '').trim()
    const newPassword = String(req.body?.newPassword || '')
    if (!identity || identity.length > 50 || !/^\d{6}$/.test(otp) || newPassword.length < 10 || newPassword.length > 128) {
      return res.status(400).json({ message: 'Enter a valid phone number, 6-digit code, and password (10-128 characters).' })
    }

    const user = await User.findOne(identityQuery(identity))
      .select('+resetOtp +resetOtpExpires +resetOtpAttempts +passwordHash +pinHash')
    if (!user || !user.resetOtp || !(user.resetOtpExpires > Date.now())) {
      if (user?.resetOtp) {
        clearResetOtp(user)
        await user.save()
      }
      return res.status(400).json({ message: 'Invalid or expired verification code. Request a new code and try again.' })
    }

    if (String(user.resetOtp) !== String(otp)) {
      user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1
      if (user.resetOtpAttempts >= RESET_OTP_MAX_ATTEMPTS) clearResetOtp(user)
      await user.save()
      return res.status(400).json({ message: 'Invalid or expired verification code. Request a new code and try again.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    user.passwordHash = passwordHash
    user.pinHash = passwordHash
    user.loginAttempts = 0
    user.lockoutUntil = null
    clearResetOtp(user)
    await user.save()

    return res.json({ message: 'Password-kaaga waa la beddelay si guul leh. Hadda fadlan ku gal.' })
  } catch (error) {
    return next(error)
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
    shop = await Shop.create({
      name,
      phone,
      ownerPhone: phone,
      ownerUsername: username,
      isApproved: false,
      status: 'pending',
      license: { status: 'locked', plan: 'Pending approval', expiresAt: null }
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
      message: 'Diiwaangelintu way guulaysatay. Akoonkaagu wuxuu sugayaa oggolaanshaha maamulka. Fadlan kala xiriir Mohamed Osman (+251940867287).',
      user: publicUser(user),
      shop: { id: String(shop._id), name: shop.name, isApproved: shop.isApproved, license: shop.license }
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

    if (!process.env.JWT_SECRET) {
      return next(new Error('JWT_SECRET is not configured.'))
    }

    // ⚡ 1. SUPER-ADMIN BYPASS (Env Variables Check)
    const envSuperAdminUsername = (process.env.SUPER_ADMIN_USERNAME || 'mohamed').toLowerCase()
    const envSuperAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'mohamed12345'

    if (identity === envSuperAdminUsername && credential === envSuperAdminPassword) {
      const superAdminUser = {
        _id: 'superadmin_static_id',
        name: 'Mohamed Osman (Super-Admin)',
        username: envSuperAdminUsername,
        role: 'superadmin',
        phone: '+251940867287',
        shopId: null
      }

      const token = jwt.sign(
        {
          sub: superAdminUser._id,
          role: 'superadmin',
          username: superAdminUser.username,
          shopId: null
        },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '12h' }
      )

      return res.json({
        token,
        accessToken: token,
        user: publicUser(superAdminUser)
      })
    }

    // ⚡ 2. DUKAAMADA CAADIGA AH (Database Check)
    const identityQuery = [{ username: identity }]
    if (normalizedPhone) {
      identityQuery.push({ username: normalizedPhone }, { phone: identity }, { phone: normalizedPhone })
    }
    const user = await User.findOne({ $or: identityQuery }).select('+passwordHash +pinHash')
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password.' })
    }

    // Super-admin ku jira Database-ka
    if (user.role && user.role.toLowerCase() === 'superadmin') {
      const passwordMatches = user.passwordHash ? await bcrypt.compare(credential, user.passwordHash) : false
      if (passwordMatches) {
        const token = jwt.sign(
          { sub: String(user._id), role: 'superadmin', username: user.username, shopId: null },
          process.env.JWT_SECRET,
          { algorithm: 'HS256', expiresIn: '12h' }
        )
        return res.json({ token, accessToken: token, user: publicUser(user) })
      }
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

    if (user.shopId) {
      const shop = await Shop.findById(user.shopId).select('isApproved status')
      if (!shop) {
        return res.status(403).json({ code: 'SHOP_NOT_ACTIVE', message: 'This account is not linked to an active shop.' })
      }
      if (shop.status === 'inactive' || shop.status === 'rejected') {
        return res.status(403).json({ code: 'SHOP_INACTIVE', message: INACTIVE_SHOP_MESSAGE })
      }
      if (shop.isApproved === false || shop.status === 'pending') {
        return res.status(403).json({ code: 'SHOP_PENDING_APPROVAL', message: PENDING_SHOP_MESSAGE })
      }
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