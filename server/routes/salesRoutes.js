import { Router } from 'express'
import { createSale } from '../controllers/productController.js'
import { verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { verifyLicense } from '../middleware/license.js'

const router = Router()
router.use(verifyStaff, verifyLicense, verifyCashierOrAdmin)
router.post('/', createSale)

export default router
