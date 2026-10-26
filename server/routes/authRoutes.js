import { Router } from 'express'
import {
  login,
  registerShop,
  requestPasswordReset,
  resetPasswordWithOtp
} from '../controllers/authController.js'

const router = Router()
router.post('/login', login)
router.post('/register', registerShop)
router.post('/forgot-password', requestPasswordReset)
router.post('/reset-password', resetPasswordWithOtp)

export default router
