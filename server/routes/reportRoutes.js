import { Router } from 'express'
import { getFinancialReport } from '../controllers/reportController.js'
import { verifyAdmin, verifyStaff } from '../middleware/authMiddleware.js'

const router = Router()
router.use(verifyStaff, verifyAdmin)
router.get('/financial', getFinancialReport)

export default router
