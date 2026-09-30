import { Router } from 'express'
import { getDashboardSummary } from '../controllers/reportController.js'
import { verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { verifyLicense } from '../middleware/license.js'

const router = Router()
router.use(verifyStaff, verifyLicense, verifyCashierOrAdmin)
router.get('/summary', getDashboardSummary)

export default router
