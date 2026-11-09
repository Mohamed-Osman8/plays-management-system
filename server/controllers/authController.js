import bcrypt from 'bcryptjs'
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Shop from '../models/Shop.js'
import {
  reportCriticalError,
  sendNewShopNotification,
  sendPasswordResetEmail,
  sendVerificationEmail
} from '../services/emailService.js'

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 30000
const RESET_OTP_TTL_MS = 5 * 60 * 1000
const RESET_OTP_COOLDOWN_MS = 60 * 1000
const RESET_OTP_MAX_ATTEMPTS = 5
const GENERIC_RESET_MESSAGE = 'If an account exists for that email address, a verification code has been sent.'
const PENDING_SHOP_MESSAGE = 'Your email is verified, and your shop is waiting for administrator approval. Dashboard access will be available after approval.'
const INACTIVE_SHOP_MESSAGE = 'Akoonka dukaankan lama hawlgelin ama waa la hakiyey. Fadlan kala xiriir Mohamed Osman (+251940867287).'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const EMAIL_VERIFICATION_COOLDOWN_MS = 60 * 1000
const EMAIL_VERIFICATION_MESSAGE = 'Check your email and follow the verification link before signing in.'
const GENERIC_RESEND_MESSAGE = 'If an unverified account exists for that email, the request has been processed. Wait a minute before trying again.'

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase()
}

function hashEmailVerificationToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function hashResetOtp(otp) {
  return createHmac('sha256', process.env.JWT_SECRET).update(otp).digest('hex')
}

function resetOtpMatches(storedHash, otp) {
  if (!/^[a-f\d]{64}$/i.test(String(storedHash || ''))) return false
  const expected = Buffer.from(storedHash, 'hex')
  const actual = Buffer.from(hashResetOtp(otp), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function clearResetOtp(user) {
  user.resetOtp = null
  user.resetOtpExpires = null
  user.resetOtpAttempts = 0
}

function publicUser(user) {
  return {
    id: user._id ? String(user._id) : 'superadmin-id',
    name: user.name || 'Mohamed Osman (Super-Admin)',
    role: user.role,
    email: user.email,
    phone: user.phone || '+251940867287',
    shopId: user.shopId ? String(user.shopId) : null
  }
}

export async function requestPasswordReset(req, res, next) {
  try {
    const email = normalizeIdentity(req.body?.email)
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' })
    }

    const user = await User.findOne({ email }).select('+resetOtpRequestedAt')
    if (!user) return res.json({ message: GENERIC_RESET_MESSAGE })

    const now = Date.now()
    const lastRequestedAt = user.resetOtpRequestedAt ? new Date(user.resetOtpRequestedAt).getTime() : 0
    if (lastRequestedAt > now - RESET_OTP_COOLDOWN_MS) {
      return res.json({ message: GENERIC_RESET_MESSAGE })
    }

    const otp = String(randomInt(0, 1000000)).padStart(6, '0')
    user.resetOtp = hashResetOtp(otp)
    user.resetOtpExpires = new Date(now + RESET_OTP_TTL_MS)
    user.resetOtpRequestedAt = new Date(now)
    user.resetOtpAttempts = 0
    await user.save()

    try {
      const recipientEmail = normalizeIdentity(user.email)
      await sendPasswordResetEmail({ email: recipientEmail, otp })
    } catch (deliveryError) {
      clearResetOtp(user)
      try {
        await user.save()
      } catch (cleanupError) {
        await reportCriticalError(cleanupError, { source: 'Password reset OTP cleanup after delivery failure' })
      }
      await reportCriticalError(deliveryError, { source: 'Password reset email delivery' })
      return res.status(503).json({ message: 'Unable to send a password reset code right now. Please try again later.' })
    }

    return res.json({ message: GENERIC_RESET_MESSAGE })
  } catch (error) {
    return next(error)
  }
}

export async function resetPasswordWithOtp(req, res, next) {
  try {
    const email = normalizeIdentity(req.body?.email)
    const otp = String(req.body?.otp || '').trim()
    const newPassword = String(req.body?.newPassword || '')
    if (email.length > 254 || !EMAIL_PATTERN.test(email) || !/^\d{6}$/.test(otp) || newPassword.length < 10 || newPassword.length > 128) {
      return res.status(400).json({ message: 'Enter a valid email address, 6-digit code, and password (10-128 characters).' })
    }

    const user = await User.findOne({ email }).select('+resetOtp +resetOtpExpires +resetOtpAttempts +passwordHash +pinHash')
    if (!user || !user.resetOtp || !(user.resetOtpExpires > Date.now())) {
      if (user?.resetOtp) {
        clearResetOtp(user)
        await user.save()
      }
      return res.status(400).json({ message: 'Invalid or expired verification code. Request a new code and try again.' })
    }

    if (!resetOtpMatches(user.resetOtp, otp)) {
      user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1
      if (user.resetOtpAttempts >= RESET_OTP_MAX_ATTEMPTS) clearResetOtp(user)
      await user.save()
      return res.status(400).json({ message: 'Invalid or expired verification code. Request a new code and try again.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    user.passwordHash = passwordHash
    user.pinHash = passwordHash
    user.tokenVersion = (user.tokenVersion || 0) + 1
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
    const ownerName = String(req.body?.name || '').trim()
    const email = normalizeIdentity(req.body?.email)
    const password = String(req.body?.password || '')
    if (name.length < 2 || name.length > 120 || ownerName.length < 2 || ownerName.length > 100 || email.length > 254 || !EMAIL_PATTERN.test(email) || password.length < 10 || password.length > 128) {
      return res.status(400).json({ message: 'Enter a store name, owner name, valid email address, and password (10-128 characters).' })
    }
    if (await User.exists({ email })) {
      return res.status(409).json({ message: 'That email address is already registered.' })
    }
    const passwordHash = await bcrypt.hash(password, 12)
    const now = Date.now()
    shop = await Shop.create({
      name,
      email,
      isApproved: false,
      status: 'unverified',
      license: { status: 'locked', plan: 'Pending approval', expiresAt: null }
    })
    const verificationToken = randomBytes(32).toString('hex')
    const user = await User.create({
      name: ownerName,
      email,
      role: 'Admin',
      shopId: shop._id,
      emailVerified: false,
      emailVerificationTokenHash: hashEmailVerificationToken(verificationToken),
      emailVerificationExpiresAt: new Date(now + EMAIL_VERIFICATION_TTL_MS),
      emailVerificationRequestedAt: new Date(now),
      passwordHash,
      pinHash: passwordHash
    })

    try {
      await sendVerificationEmail({ email, shopName: name, ownerName, token: verificationToken })
    } catch (deliveryError) {
      await reportCriticalError(deliveryError, { source: 'Registration verification email delivery' })
      return res.status(503).json({
        code: 'VERIFICATION_EMAIL_FAILED',
        message: 'Your account was created, but we could not send the verification email. Wait a minute, then use the resend option to try again.'
      })
    }

    return res.status(201).json({
      message: 'Registration started. Check your email and follow the verification link to continue.'
    })
  } catch (error) {
    if (shop?._id) {
      try {
        await Shop.deleteOne({ _id: shop._id })
      } catch (cleanupError) {
        await reportCriticalError(cleanupError, { source: 'Registration shop cleanup' })
      }
    }
    if (error.code === 11000) return res.status(409).json({ message: 'That email address is already registered.' })
    return next(error)
  }
}

export async function resendVerificationEmail(req, res, next) {
  try {
    const email = normalizeIdentity(req.body?.email)
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' })
    }

    const user = await User.findOne({ email, emailVerified: false })
      .select('+emailVerificationTokenHash +emailVerificationExpiresAt +emailVerificationRequestedAt')
    if (!user) {
      return res.json({ message: GENERIC_RESEND_MESSAGE })
    }

    const now = Date.now()
    const lastRequestedAt = user.emailVerificationRequestedAt
      ? new Date(user.emailVerificationRequestedAt).getTime()
      : 0
    if (lastRequestedAt > now - EMAIL_VERIFICATION_COOLDOWN_MS) {
      return res.json({ message: GENERIC_RESEND_MESSAGE })
    }

    const verificationToken = randomBytes(32).toString('hex')
    user.emailVerificationTokenHash = hashEmailVerificationToken(verificationToken)
    user.emailVerificationExpiresAt = new Date(now + EMAIL_VERIFICATION_TTL_MS)
    user.emailVerificationRequestedAt = new Date(now)
    await user.save()

    try {
      const shop = await Shop.findById(user.shopId).select('name')
      await sendVerificationEmail({
        email: user.email,
        shopName: shop?.name || user.name,
        ownerName: user.name,
        token: verificationToken
      })
    } catch (deliveryError) {
      await reportCriticalError(deliveryError, { source: 'Resent verification email delivery' })
      return res.status(503).json({ message: 'Unable to send a verification email right now. Please try again later.' })
    }

    return res.json({ message: GENERIC_RESEND_MESSAGE })
  } catch (error) {
    return next(error)
  }
}

export async function verifyEmail(req, res, next) {
  try {
    const token = String(req.body?.token || '')
    if (!/^[a-f\d]{64}$/i.test(token)) {
      return res.status(400).json({ message: 'This verification link is invalid or has expired. Request a new link and try again.' })
    }

    const now = new Date()
    const user = await User.findOneAndUpdate(
      {
        emailVerified: false,
        emailVerificationTokenHash: hashEmailVerificationToken(token),
        emailVerificationExpiresAt: { $gt: now }
      },
      {
        $set: { emailVerified: true, emailVerifiedAt: now },
        $unset: { emailVerificationTokenHash: 1, emailVerificationExpiresAt: 1 }
      },
      { new: true, runValidators: true }
    ).select('name email shopId')

    if (!user) {
      return res.status(400).json({ message: 'This verification link is invalid or has expired. Request a new link and try again.' })
    }

    const shop = await Shop.findByIdAndUpdate(
      user.shopId,
      {
        $set: {
          isApproved: false,
          status: 'pending',
          'license.status': 'locked',
          'license.plan': 'Pending approval'
        }
      },
      { new: true, runValidators: true }
    ).select('name')
    if (!shop) throw new Error(`Verified user ${user._id} is not linked to a shop.`)

    try {
      await sendNewShopNotification({
        email: user.email,
        shopName: shop.name,
        ownerName: user.name,
        verifiedAt: now
      })
    } catch (deliveryError) {
      await reportCriticalError(deliveryError, { source: 'Verified shop notification email delivery' })
    }

    return res.json({
      message: 'Email verified. Your shop is now waiting for administrator approval. You can sign in once it is approved.',
      pendingApproval: true,
      email: user.email,
      shopName: shop.name
    })
  } catch (error) {
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
    const identity = normalizeIdentity(req.body?.email || req.body?.username)
    const credential = getCredential(req.body)

    if (!identity || !credential) {
      return res.status(400).json({
        message: 'Email address and password or 6-digit PIN are required.'
      })
    }

    if (!process.env.JWT_SECRET) {
      return next(new Error('JWT_SECRET is not configured.'))
    }

    const envSuperAdminEmail = normalizeIdentity(process.env.SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_USERNAME)
    const envSuperAdminPassword = process.env.SUPER_ADMIN_PASSWORD || ''

    if (envSuperAdminEmail && envSuperAdminPassword && identity === envSuperAdminEmail && credential === envSuperAdminPassword) {
      const superAdminUser = {
        _id: 'superadmin_static_id',
        name: 'Mohamed Osman (Super-Admin)',
        email: envSuperAdminEmail,
        username: envSuperAdminEmail,
        role: 'superadmin',
        phone: '+251940867287',
        shopId: null
      }

      const token = jwt.sign(
        {
          sub: superAdminUser._id,
          role: 'superadmin',
          email: superAdminUser.email,
          shopId: null,
          ver: 0
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

    const user = await User.findOne({ $or: [{ email: identity }, { username: identity }] }).select('+passwordHash +pinHash')
    if (!user) {
      return res.status(401).json({ message: 'Invalid email address or password.' })
    }

    const now = Date.now()
    const lockoutUntil = user.lockoutUntil ? new Date(user.lockoutUntil).getTime() : 0

    if (lockoutUntil > now) {
      const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000)
      return res.status(423).json({
        message: 'Account locked for 30 seconds.',
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
          message: `Too many failed attempts. Account locked for ${Math.ceil(LOCKOUT_DURATION_MS / 1000)} seconds.`,
          lockoutUntil: user.lockoutUntil.toISOString(),
          remainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000)
        })
      }

      return res.status(401).json({
        message: 'Invalid email address or password.',
        attemptsRemaining: LOCKOUT_THRESHOLD - user.loginAttempts
      })
    }

    user.loginAttempts = 0
    user.lockoutUntil = null
    await user.save()

    if (!user.emailVerified) {
      return res.status(403).json({ code: 'EMAIL_VERIFICATION_REQUIRED', message: EMAIL_VERIFICATION_MESSAGE })
    }

    if (user.shopId) {
      const shop = await Shop.findById(user.shopId).select('isApproved status name')
      if (!shop) {
        return res.status(403).json({ code: 'SHOP_NOT_ACTIVE', message: 'This account is not linked to an active shop.' })
      }
      if (shop.status === 'inactive' || shop.status === 'rejected') {
        return res.status(403).json({ code: 'SHOP_INACTIVE', message: INACTIVE_SHOP_MESSAGE })
      }
      if (shop.isApproved === false || shop.status === 'pending') {
        return res.status(403).json({
          code: 'SHOP_PENDING_APPROVAL',
          message: PENDING_SHOP_MESSAGE,
          email: user.email,
          shopName: shop.name
        })
      }
    }

    const token = jwt.sign(
      {
        sub: String(user._id),
        role: user.role,
        email: user.email,
        shopId: user.shopId ? String(user.shopId) : null,
        ver: user.tokenVersion || 0
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