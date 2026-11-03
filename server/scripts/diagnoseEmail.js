import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { sendDiagnosticEmail, verifyEmailTransport } from '../services/emailService.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const recipient = String(process.argv[2] || '').trim().toLowerCase()

if (recipient.length > 254 || !EMAIL_PATTERN.test(recipient)) {
  console.error('Usage: npm run diagnose:email -- <your-test-email-address>')
  process.exitCode = 2
} else {
  let hasFailures = false

  try {
    await connectDatabase()
    console.info('[diagnostic] MongoDB connectivity: passed.')
  } catch (error) {
    hasFailures = true
    console.error(`[diagnostic] MongoDB connectivity: failed. ${error.message}`)
  }

  try {
    await verifyEmailTransport()
    console.info('[diagnostic] SMTP connection/authentication: passed.')

    const result = await sendDiagnosticEmail(recipient)
    if (!result.accepted) throw new Error('SMTP provider did not accept the test message.')
    console.info('[diagnostic] SMTP provider accepted the test message.')
    console.info('[diagnostic] Check the destination inbox and spam folder to confirm receipt.')
  } catch (error) {
    hasFailures = true
    const code = typeof error?.code === 'string' && /^[A-Z0-9_-]{1,32}$/.test(error.code)
      ? ` (${error.code})`
      : ''
    console.error(`[diagnostic] SMTP test failed${code}. Check EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, and Gmail App Password settings.`)
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect()
      } catch {
        hasFailures = true
        console.error('[diagnostic] MongoDB disconnect failed.')
      }
    }
  }

  if (hasFailures) process.exitCode = 1
}
