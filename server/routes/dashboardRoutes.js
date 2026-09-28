import { Router } from 'express'
import { getDashboardSummary } from '../controllers/reportController.js'
import { verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'

const router = Router()
router.use(verifyStaff, verifyCashierOrAdmin)
router.get('/summary', getDashboardSummary)

export default router
