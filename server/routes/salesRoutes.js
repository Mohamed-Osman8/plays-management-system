import { Router } from 'express'
import { createSale } from '../controllers/productController.js'
import { verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'

const router = Router()
router.use(verifyStaff, verifyCashierOrAdmin)
router.post('/', createSale)

export default router
