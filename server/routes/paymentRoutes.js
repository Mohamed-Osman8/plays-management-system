import { Router } from 'express'
import { getShopPaymentHistory, submitPayment } from '../controllers/paymentController.js'
import { verifyAdmin, verifyStaff } from '../middleware/authMiddleware.js'

const router = Router()
router.use(verifyStaff, verifyAdmin)
router.get('/', getShopPaymentHistory)
router.post('/', submitPayment)

export default router
