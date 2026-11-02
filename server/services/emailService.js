import nodemailer from 'nodemailer'

const SUPER_ADMIN_EMAIL = 'othmanmoh365@gmail.com'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ERROR_ALERT_COOLDOWN_MS = 5 * 60 * 1000
const recentErrorAlerts = new Map()
let transporter

// Xogtaada tooska ah ee Gmail (Automatic)
const AUTO_EMAIL_CONFIG = {
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  user: 'othmanmoh365@gmail.com',
  pass: 'nqaqjqyshlfpoagg' // App Password-kaagii saxda ahaa
}

function getSenderHeader() {
  return { name: 'PLAYA Game Zone', address: AUTO_EMAIL_CONFIG.user }
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: AUTO_EMAIL_CONFIG.host,
      port: AUTO_EMAIL_CONFIG.port,
      secure: AUTO_EMAIL_CONFIG.secure,
      auth: {
        user: AUTO_EMAIL_CONFIG.user,
        pass: AUTO_EMAIL_CONFIG.pass
      },
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
  console.info('\n========== PLAYA EMAIL CONSOLE FALLBACK ==========')
  console.info(`📨 [EMAIL FOR] ${to}`)
  console.info(`Subject: ${subject}`)
  if (developmentSecret) {
    const { type, value } = developmentSecret
    console.info(`🔐 [${type} FOR] ${to}`)
    console.info(`🔑 [CODE / TOKEN IS]: ${value}`)
  }
  console.info('===================================================\n')
}

async function sendEmail({ to, subject, text, developmentSecret }) {
  const recipientEmail = normalizeRecipientEmail(to)

  // Mar walba Console-ka ha la socdo si haddii kale ay u muuqato
  if (developmentSecret) {
    logDevelopmentEmail({ to: recipientEmail, subject, developmentSecret })
  }

  try {
    const mailer = getTransporter()
    await mailer.sendMail({
      from: getSenderHeader(),
      to: recipientEmail,
      subject,
      text
    })
  } catch (error) {
    console.error(`[email] Automatic SMTP delivery failed for ${recipientEmail}:`, error.message)
    // Halkan uma oggolaanayno inuu 503 keeno oo wuxuu isticmaalayaa console-ka
  }
}

function parseClientOrigin(value) {
  const origin = value.trim()
  return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(origin) ? origin : `http://${origin}`)
}

function getClientUrl() {
  let frontendOrigin
  try {
    frontendOrigin = process.env.CLIENT_URL ? parseClientOrigin(process.env.CLIENT_URL) : new URL('http://localhost:5173')
  } catch {
    frontendOrigin = new URL('http://localhost:5173')
  }
  frontendOrigin.pathname = '/'
  frontendOrigin.search = ''
  frontendOrigin.hash = ''
  return frontendOrigin
}

export async function sendVerificationEmail({ email, shopName, token }) {
  const recipientEmail = normalizeRecipientEmail(email)
  const verificationToken = String(token || '')
  if (!verificationToken) throw new Error('An email verification token is required.')

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
      'This secure link expires in 24 hours.'
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
  if (!/^\d{6}$/.test(otpCode)) throw new Error('A valid 6-digit password reset code is required.')

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
}