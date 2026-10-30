import nodemailer from 'nodemailer'

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'mohamed094osman@gmail.com'
const ERROR_ALERT_COOLDOWN_MS = 5 * 60 * 1000
const recentErrorAlerts = new Map()
let transporter

function getTransporter() {
  const { EMAIL_HOST: host, EMAIL_USER: user, EMAIL_PASS: pass } = process.env
  if (!host || !user || !pass) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EMAIL_HOST, EMAIL_USER, and EMAIL_PASS must be configured in production.')
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
    })
  }
  return transporter
}

async function sendEmail({ to, subject, text }) {
  const mailer = getTransporter()
  if (!mailer) {
    console.info(`[email] ${subject}\nTo: ${to}\n${text}`)
    return
  }

  await mailer.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    text
  })
}

function getClientUrl() {
  const configuredUrl = process.env.CLIENT_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173'
  const origin = configuredUrl.split(',')[0].trim()
  return new URL('/', origin)
}

export async function sendVerificationEmail({ email, shopName, token }) {
  const verificationUrl = getClientUrl()
  verificationUrl.searchParams.set('verifyEmail', token)
  verificationUrl.hash = 'login'

  await sendEmail({
    to: email,
    subject: 'Verify your PLAYA Game Zone email',
    text: [
      `Hello ${shopName},`,
      '',
      'Verify your email address to complete your PLAYA Game Zone registration:',
      verificationUrl.toString(),
      '',
      'This secure link expires in 24 hours. Your account cannot be used until your email is verified.'
    ].join('\n')
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
  await sendEmail({
    to: email,
    subject: 'PLAYA Game Zone password reset code',
    text: `Your PLAYA Game Zone password reset code is ${otp}. It expires in 5 minutes.`
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
