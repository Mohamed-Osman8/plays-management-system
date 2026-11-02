import nodemailer from 'nodemailer'

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'mohamed094osman@gmail.com'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ERROR_ALERT_COOLDOWN_MS = 5 * 60 * 1000
const recentErrorAlerts = new Map()
let transporter

function isDevelopmentFallbackEnabled() {
  return process.env.NODE_ENV === 'development'
    || process.env.NODE_ENV === 'test'
    || process.env.EMAIL_FALLBACK === 'console'
}

function getSenderHeader() {
  const authenticatedAddress = String(process.env.EMAIL_USER || '').trim()
  const isGmailSmtp = /(^|\.)gmail\.com$/i.test(String(process.env.EMAIL_HOST || '').trim())
  const address = isGmailSmtp
    ? authenticatedAddress
    : String(process.env.EMAIL_FROM || authenticatedAddress).trim()

  if (!EMAIL_PATTERN.test(address)) {
    throw new Error('EMAIL_FROM or EMAIL_USER must be a valid sender email address.')
  }

  return { name: 'PLAYA Game Zone', address }
}

function getTransporter() {
  const { EMAIL_HOST: host, EMAIL_USER: user, EMAIL_PASS: pass } = process.env
  if (!host || !user || !pass) {
    if (!isDevelopmentFallbackEnabled()) {
      throw new Error('EMAIL_HOST, EMAIL_USER, and EMAIL_PASS must be configured unless development console fallback is enabled.')
    }
    return null
  }

  if (!transporter) {
    const port = Number(process.env.EMAIL_PORT || 587)
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    }, {
      from: getSenderHeader()
    })
  }
  return transporter
}

function normalizeRecipientEmail(email) {
  const recipientEmail = String(email || '').trim().toLowerCase()
  if (!EMAIL_PATTERN.test(recipientEmail)) {
    throw new Error('A valid recipient email address is required.')
  }
  return recipientEmail
}

function logDevelopmentEmail({ to, subject, developmentSecret }) {
  console.info('\n========== PLAYA EMAIL DEVELOPMENT FALLBACK ==========')
  console.info(`📨 [EMAIL FOR] ${to}`)
  console.info(`Subject: ${subject}`)

  if (developmentSecret) {
    const { type, value } = developmentSecret
    const label = type === 'OTP' ? 'OTP CODE' : 'EMAIL VERIFICATION TOKEN'
    const secretLabel = type === 'OTP' ? 'YOUR CODE' : 'YOUR TOKEN'
    console.info(`🔐 [${label} FOR] ${to}`)
    console.info(`🔑 [${secretLabel} IS] ${value}`)
  }

  console.info('======================================================\n')
}

async function sendEmail({ to, subject, text, developmentSecret }) {
  const recipientEmail = normalizeRecipientEmail(to)
  const developmentFallbackEnabled = isDevelopmentFallbackEnabled()

  if (developmentFallbackEnabled && developmentSecret) {
    logDevelopmentEmail({ to: recipientEmail, subject, developmentSecret })
  }

  let mailer
  try {
    mailer = getTransporter()
  } catch (error) {
    if (!developmentFallbackEnabled) throw error
    console.error(`[email] SMTP configuration for ${recipientEmail} failed; development fallback is available.`, error)
    if (!developmentSecret) logDevelopmentEmail({ to: recipientEmail, subject })
    return
  }

  if (!mailer) {
    return
  }

  try {
    await mailer.sendMail({
      from: getSenderHeader(),
      to: recipientEmail,
      subject,
      text
    })
  } catch (error) {
    if (developmentFallbackEnabled) {
      console.error(`[email] SMTP delivery to ${recipientEmail} failed; development fallback is available.`, error)
      if (!developmentSecret) logDevelopmentEmail({ to: recipientEmail, subject })
      return
    }

    console.error(`[email] Failed to send message to ${recipientEmail}.`, error)
    throw error
  }
}
function parseClientOrigin(value) {
  const origin = value.trim()
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(origin) ? origin : `http://${origin}`)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('CLIENT_URL and CLIENT_ORIGIN must use HTTP(S) frontend URLs without credentials.')
  }
  return url
}

function isLocalOrigin(url) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    || hostname === '::1'
}

function getClientUrl() {
  const configuredOrigins = [
    ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
    ...(process.env.CLIENT_ORIGIN || '').split(',')
  ].map((origin) => origin.trim()).filter(Boolean)

  let frontendOrigin
  if (configuredOrigins.length === 0) {
    frontendOrigin = new URL('http://localhost:5173')
  } else {
    try {
      const candidates = configuredOrigins.map(parseClientOrigin)
      // Wuxuu si nabadgelyo leh u aqbalayaa localhost adigoon error la kulmin
      frontendOrigin = candidates.find((url) => !isLocalOrigin(url)) || candidates[0] || new URL('http://localhost:5173')
    } catch {
      frontendOrigin = new URL('http://localhost:5173')
    }
  }

  frontendOrigin.pathname = '/'
  frontendOrigin.search = ''
  frontendOrigin.hash = ''
  return frontendOrigin
}
export async function sendVerificationEmail({ email, shopName, token }) {
  const recipientEmail = normalizeRecipientEmail(email)
  const verificationToken = String(token || '')
  if (!verificationToken) {
    throw new Error('An email verification token is required.')
  }

  const verificationUrl = getClientUrl()
  verificationUrl.searchParams.set('verifyEmail', verificationToken)
  verificationUrl.hash = 'login'

  await sendEmail({
    to: recipientEmail,
    subject: 'Verify your PLAYA Game Zone email',
    text: [
      `Hello ${shopName},`,
      '',
      'Verify your email address to complete your PLAYA Game Zone registration:',
      verificationUrl.toString(),
      '',
      'This secure link expires in 24 hours. Your account cannot be used until your email is verified.'
    ].join('\n'),
    developmentSecret: { type: 'EMAIL_VERIFICATION_TOKEN', value: verificationToken }
  })
}

export async function sendNewShopNotification({ email, shopName, ownerName, verifiedAt }) {
  const adminUrl = getClientUrl()
  adminUrl.hash = 'super-admin'
  await sendEmail({
    to: SUPER_ADMIN_EMAIL,
    subject: `New verified PLAYA shop registration: ${shopName}`,
    text: [
      'A new shop has completed email verification and is waiting for your approval.',
      '',
      `Shop: ${shopName}`,
      `Owner: ${ownerName}`,
      `Email: ${email}`,
      `Email verified: ${verifiedAt.toISOString()}`,
      '',
      `Review pending shops: ${adminUrl.toString()}`
    ].join('\n')
  })
}

export async function sendPasswordResetEmail({ email, otp }) {
  const recipientEmail = normalizeRecipientEmail(email)
  const otpCode = String(otp || '')
  if (!/^\d{6}$/.test(otpCode)) {
    throw new Error('A valid 6-digit password reset code is required.')
  }

  await sendEmail({
    to: recipientEmail,
    subject: 'PLAYA Game Zone password reset code',
    text: `Your PLAYA Game Zone password reset code is ${otpCode}. It expires in 5 minutes.`,
    developmentSecret: { type: 'OTP', value: otpCode }
  })
}

export async function reportCriticalError(error, context = {}) {
  const normalizedError = error instanceof Error ? error : new Error(String(error))
  console.error(context.source || 'Critical system error', normalizedError)

  const signature = `${normalizedError.name}:${normalizedError.message}`
  const now = Date.now()
  const lastSentAt = recentErrorAlerts.get(signature) || 0
  if (now - lastSentAt < ERROR_ALERT_COOLDOWN_MS) return

  recentErrorAlerts.set(signature, now)
  if (recentErrorAlerts.size > 500) {
    const oldestKey = recentErrorAlerts.keys().next().value
    if (oldestKey) recentErrorAlerts.delete(oldestKey)
  }

  const requestDetails = context.method && context.path
    ? `Request: ${context.method} ${context.path}`
    : ''
  const stackDetails = normalizedError.stack
    ? `\nStack:\n${normalizedError.stack.slice(0, 8000)}`
    : ''
  try {
    await sendEmail({
      to: SUPER_ADMIN_EMAIL,
      subject: `PLAYA critical system error: ${normalizedError.name}`,
      text: [
        `Time: ${new Date(now).toISOString()}`,
        context.source ? `Source: ${context.source}` : '',
        requestDetails,
        `Error: ${normalizedError.message}`,
        stackDetails
      ].filter(Boolean).join('\n')
    })
  } catch (deliveryError) {
    console.error('Critical error notification email delivery failed.', deliveryError)
  }
}