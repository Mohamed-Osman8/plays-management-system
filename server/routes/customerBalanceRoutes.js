import { Router } from 'express'
import {
  createCustomerBalance,
  listCustomerBalances,
  recordCustomerBalancePayment
} from '../controllers/customerBalanceController.js'
import { verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { verifyLicense } from '../middleware/license.js'

const router = Router()
router.use(verifyStaff, verifyLicense, verifyCashierOrAdmin)
router.get('/', listCustomerBalances)
router.post('/', createCustomerBalance)
router.patch('/:id/payments', recordCustomerBalancePayment)

export default router
