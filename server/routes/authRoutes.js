import { Router } from 'express'
import {
  login,
  registerShop,
  resendVerificationEmail,
  verifyEmail,
  requestPasswordReset,
  resetPasswordWithOtp
} from '../controllers/authController.js'

const router = Router()
router.post('/login', login)
router.post('/register', registerShop)
router.post('/verify-email', verifyEmail)
router.post('/resend-verification', resendVerificationEmail)
router.post('/forgot-password', requestPasswordReset)
router.post('/reset-password', resetPasswordWithOtp)

export default router
