import bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import User from '../models/User.js'
import Shop from '../models/Shop.js'

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 120000
const RESET_OTP_TTL_MS = 5 * 60 * 1000
const RESET_OTP_COOLDOWN_MS = 60 * 1000
const RESET_OTP_MAX_ATTEMPTS = 5
const GENERIC_RESET_MESSAGE = 'If an account exists for that email address, a verification code has been sent.'
const PENDING_SHOP_MESSAGE = 'Akoonkaaga wali ma firfircona. Fadlan kala xiriir maamulka Mohamed Osman (+251940867287) si loo kordhiyo/loo firfircooneeyo.'
const INACTIVE_SHOP_MESSAGE = 'Akoonka dukaankan lama hawlgelin ama waa la hakiyey. Fadlan kala xiriir Mohamed Osman (+251940867287).'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase()
}

async function sendPasswordResetOtp(user, otp) {
  const host = process.env.EMAIL_HOST
  const userName = process.env.EMAIL_USER
  const password = process.env.EMAIL_PASS
  if (!host || !userName || !password) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EMAIL_HOST, EMAIL_USER, and EMAIL_PASS must be configured before password reset can be used in production.')
    }
    console.info(`[password-reset] Development OTP for ${user.email}: ${otp}`)
    return
  }

  const port = Number(process.env.EMAIL_PORT || 587)
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: userName, pass: password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  })
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || userName,
    to: user.email,
    subject: 'PLAYA Game Zone password reset code',
    text: `Your PLAYA Game Zone password reset code is ${otp}. It expires in 5 minutes.`
  })
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

    if (process.env.NODE_ENV === 'production' && (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
      return res.status(503).json({ message: 'Password reset is temporarily unavailable. Please contact your administrator.' })
    }

    const user = await User.findOne({ email }).select('+resetOtpRequestedAt')
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
      console.error('Password reset email delivery failed.', deliveryError)
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
    const email = normalizeIdentity(req.body?.email)
    const password = String(req.body?.password || '')
    if (!name || name.length > 120 || email.length > 254 || !EMAIL_PATTERN.test(email) || password.length < 10 || password.length > 128) {
      return res.status(400).json({ message: 'Enter a store name, valid email address, and password (10-128 characters).' })
    }
    if (await User.exists({ email })) {
      return res.status(409).json({ message: 'That email address is already registered.' })
    }
    const passwordHash = await bcrypt.hash(password, 12)
    shop = await Shop.create({
      name,
      email,
      isApproved: false,
      status: 'pending',
      license: { status: 'locked', plan: 'Pending approval', expiresAt: null }
    })
    const user = await User.create({
      name,
      email,
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
    if (error.code === 11000) return res.status(409).json({ message: 'That email address is already registered.' })
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
    const credential = getCredential(req.body).trim()

    if (!identity || !credential) {
      return res.status(400).json({
        message: 'Email address and password or 6-digit PIN are required.'
      })
    }

    if (!process.env.JWT_SECRET) {
      return next(new Error('JWT_SECRET is not configured.'))
    }

    // ⚡ SUPER-ADMIN BYPASS (Hubinta Email-ka iyo Password-ka .env)
    const envSuperAdminEmail = (process.env.SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_USERNAME || 'mohamed094osman@gmail.com').toLowerCase()
    const envSuperAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'mohamed12345'

    if (identity === envSuperAdminEmail && credential === envSuperAdminPassword) {
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

    // ⚡ DUKAAMADA CAADIGA AH (Database Search by Email / Username)
    const user = await User.findOne({ $or: [{ email: identity }, { username: identity }] }).select('+passwordHash +pinHash')
    if (!user) {
      return res.status(401).json({ message: 'Invalid email address or password.' })
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
        message: 'Invalid email address or password.',
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
        email: user.email,
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