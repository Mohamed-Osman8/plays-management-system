
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const BREVO_API_KEY = process.env.BREVO_API_KEY?.trim() || ''
const BREVO_SENDER_EMAIL =
  process.env.BREVO_SENDER_EMAIL?.trim().toLowerCase() || ''

const BREVO_API_URL = 'https://api.brevo.com/v3'

function normalizeRecipientEmail(email) {
  const recipient = String(email || '').trim().toLowerCase()

  if (!EMAIL_PATTERN.test(recipient) || recipient.length > 254) {
    throw new Error('A valid recipient email address is required.')
  }

  return recipient
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character])
}

function getClientUrl() {
  const value = process.env.CLIENT_URL?.trim()
    || (process.env.NODE_ENV === 'production'
      ? ''
      : 'http://localhost:5173')

  if (!value) {
    throw new Error('CLIENT_URL is required for email links.')
  }

  const url = new URL(value)

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error('CLIENT_URL must be an HTTP(S) URL without credentials.')
  }

  if (
    process.env.NODE_ENV === 'production' &&
    (
      url.protocol !== 'https:' ||
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
  ) {
    throw new Error('Production CLIENT_URL must be a public HTTPS URL.')
  }

  url.pathname = '/'
  url.search = ''
  url.hash = ''

  return url
}

function logVerificationLinkTarget(url) {
  console.info(
    `[email-verification] link target origin=${url.origin} pathname=${url.pathname} port=${url.port || '(default)'}`
  )
}

function emailLayout({ preheader, title, content }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f5fa;color:#172033;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5fa;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#17152b;padding:26px 32px;color:#fff;">
                <div style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#b8f34a;">PLAYA</div>
                <div style="margin-top:5px;font-size:12px;letter-spacing:1.6px;color:#fff;">GAME ZONE</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 32px 38px;">
                <h1 style="margin:0 0 18px;font-size:25px;line-height:1.3;color:#17152b;">${escapeHtml(title)}</h1>
                ${content}
                <p style="margin:28px 0 0;color:#606a7b;font-size:13px;line-height:1.7;">PLAYSTATION GAME ZONE<br>Play. Manage. Grow.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#f8f9fc;color:#778094;font-size:12px;line-height:1.6;">
                This is an automated message from PLAYA GAME ZONE. If you did not request this, you can safely ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

async function sendRealEmail({ to, subject, text, html }) {
  const recipient = normalizeRecipientEmail(to)

  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    throw new Error('Brevo email configuration is missing.')
  }

  const response = await fetch(`${BREVO_API_URL}/smtp/email`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: 'PLAYA Game Zone',
        email: normalizeRecipientEmail(BREVO_SENDER_EMAIL)
      },
      to: [{ email: recipient }],
      subject: String(subject)
        .replace(/[\r\n\x00-\x1f\x7f]/g, ' ')
        .slice(0, 180),
      textContent: text,
      htmlContent: html
    }),
    signal: AbortSignal.timeout(20000)
  })

  if (!response.ok) {
    const errorText = await response.text()

    console.error('[email] Brevo API rejected email:', {
      status: response.status,
      message: errorText.slice(0, 500)
    })

    throw new Error(`Brevo email delivery failed (${response.status}).`)
  }

  const result = await response.json()

  console.info('[email] Brevo accepted email:', {
    messageId: result.messageId,
    recipient
  })

  return {
    accepted: [recipient],
    rejected: [],
    messageId: result.messageId
  }
}


export async function verifyEmailTransport() {
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    throw new Error('Brevo email configuration is missing.')
  }

  normalizeRecipientEmail(BREVO_SENDER_EMAIL)

  let response

  try {
    response = await fetch(`${BREVO_API_URL}/account`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY
      },
      signal: AbortSignal.timeout(15000)
    })
  } catch (error) {
    console.error('[email] Brevo connection error:', {
      name: error.name,
      message: error.message
    })
    throw error
  }

  if (!response.ok) {
    const errorBody = await response.text()

    console.error('[email] Brevo API verification failed:', {
      status: response.status,
      response: errorBody.slice(0, 1000)
    })

    throw new Error(`Brevo API verification failed (${response.status}).`)
  }

  const account = await response.json()

  console.info('[email] Brevo API connection is ready.', {
    email: account.email || 'Account verified'
  })

  return true
}


export async function sendDiagnosticEmail(email) {
  const result = await sendRealEmail({
    to: email,
    subject: 'PLAYA GAME ZONE email configuration test',
    text: 'This is a test message confirming that the PLAYA GAME ZONE email provider accepted an email for delivery. It contains no account credentials, verification links, or reset codes.',
    html: emailLayout({
      preheader: 'PLAYA GAME ZONE email configuration test.',
      title: 'Email configuration test',
      content: '<p style="margin:0;font-size:15px;line-height:1.7;color:#465064;">This test message confirms that the PLAYA GAME ZONE email provider accepted an email for delivery. It contains no account credentials, verification links, or reset codes.</p>'
    })
  })

  return { accepted: result.accepted.length > 0 }
}

export async function sendVerificationEmail({
  email,
  shopName,
  ownerName,
  token
}) {
  if (!/^[a-f\d]{64}$/i.test(String(token || ''))) {
    throw new Error('A valid verification token is required.')
  }

  const verificationUrl = getClientUrl()

  verificationUrl.searchParams.set('verifyEmail', token)
  verificationUrl.hash = 'login'

  logVerificationLinkTarget(verificationUrl)

  const safeOwner = escapeHtml(ownerName || shopName)
  const safeShop = escapeHtml(shopName)
  const link = escapeHtml(verificationUrl.toString())

  const html = emailLayout({
    preheader: `Verify your email for ${shopName} on PLAYA GAME ZONE.`,
    title: 'Welcome to PLAYA GAME ZONE',
    content: `<p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hello ${safeOwner},</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#465064;">Your shop <strong>${safeShop}</strong> is nearly ready. Verify this email address to submit it for administrator approval.</p>
      <p style="margin:26px 0;text-align:center;"><a href="${link}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#a9e63f;color:#172033;text-decoration:none;font-size:15px;font-weight:bold;">Verify Email</a></p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#606a7b;">This secure link expires in 24 hours. If the button does not work, copy and paste this URL into your browser:</p>
      <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;"><a href="${link}" style="color:#5146a5;">${link}</a></p>
      <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#606a7b;">For your security, do not forward this verification email.</p>`
  })

  const text = [
    `Hello ${ownerName || shopName},`,
    '',
    `Welcome to PLAYA GAME ZONE. Verify the email address for ${shopName} to submit your shop for administrator approval:`,
    verificationUrl.toString(),
    '',
    'This secure link expires in 24 hours. Do not forward this email.'
  ].join('\n')

  return sendRealEmail({
    to: email,
    subject: 'Verify your PLAYA GAME ZONE email',
    text,
    html
  })
}

export async function sendPasswordResetEmail({ email, otp }) {
  const code = String(otp || '')

  if (!/^\d{6}$/.test(code)) {
    throw new Error('A valid 6-digit OTP is required.')
  }

  const html = emailLayout({
    preheader: 'Your PLAYA GAME ZONE password reset code.',
    title: 'Reset your password',
    content: `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#465064;">Use this one-time code to reset your PLAYA GAME ZONE password:</p>
      <p style="margin:20px 0;padding:18px;text-align:center;border-radius:8px;background:#f3f5fa;color:#17152b;font-size:30px;font-weight:bold;letter-spacing:8px;">${code}</p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#606a7b;">This code expires in 5 minutes. If you did not request a password reset, ignore this email and keep your password safe.</p>`
  })

  return sendRealEmail({
    to: email,
    subject: 'Your PLAYA GAME ZONE password reset code',
    text: `Your PLAYA GAME ZONE password reset code is ${code}. It expires in 5 minutes. If you did not request a reset, ignore this email.`,
    html
  })
}

export async function sendNewShopNotification({
  email,
  shopName,
  ownerName,
  verifiedAt
}) {
  const adminEmail = normalizeRecipientEmail(process.env.SUPER_ADMIN_EMAIL)

  const adminUrl = getClientUrl()
  adminUrl.hash = 'super-admin'

  const verifiedDate = new Date(verifiedAt)

  if (Number.isNaN(verifiedDate.getTime())) {
    throw new Error('A valid verification timestamp is required.')
  }

  const safeShop = escapeHtml(shopName)
  const safeOwner = escapeHtml(ownerName)
  const safeEmail = escapeHtml(normalizeRecipientEmail(email))
  const reviewLink = escapeHtml(adminUrl.toString())

  const html = emailLayout({
    preheader: `${shopName} has verified its email and is waiting for review.`,
    title: 'A new shop is ready for review',
    content: `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#465064;">A shop has completed email verification and is waiting for administrator approval.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;line-height:1.6;">
        <tr><td style="padding:9px 0;color:#778094;">Shop</td><td style="padding:9px 0;font-weight:bold;">${safeShop}</td></tr>
        <tr><td style="padding:9px 0;color:#778094;">Owner</td><td style="padding:9px 0;">${safeOwner}</td></tr>
        <tr><td style="padding:9px 0;color:#778094;">Email</td><td style="padding:9px 0;">${safeEmail}</td></tr>
        <tr><td style="padding:9px 0;color:#778094;">Verified</td><td style="padding:9px 0;">${escapeHtml(verifiedDate.toISOString())}</td></tr>
      </table>
      <p style="margin:26px 0 0;text-align:center;"><a href="${reviewLink}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#a9e63f;color:#172033;text-decoration:none;font-size:15px;font-weight:bold;">Review pending shops</a></p>`
  })

  return sendRealEmail({
    to: adminEmail,
    subject: 'A new PLAYA GAME ZONE shop is waiting for approval',
    text: [
      'A shop has completed email verification and is waiting for administrator approval.',
      `Shop: ${shopName}`,
      `Owner: ${ownerName}`,
      `Email: ${email}`,
      `Verified: ${verifiedDate.toISOString()}`,
      `Review pending shops: ${adminUrl.toString()}`
    ].join('\n'),
    html
  })
}

export async function reportCriticalError(error, context = {}) {
  const details = {
    name: error instanceof Error ? error.name : 'Error',
    ...(typeof error?.code === 'string' ? { code: error.code } : {}),
    ...(Number.isInteger(error?.responseCode)
      ? { responseCode: error.responseCode }
      : {})
  }

  if (/email|smtp/i.test(context.source || '')) {
    details.provider = 'Brevo API'
  }

  console.error(context.source || 'Critical system error', details)
}
