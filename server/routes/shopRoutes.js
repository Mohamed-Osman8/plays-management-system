import { Router } from 'express'
import { getShopSettings, updateShopSettings } from '../controllers/shopController.js'
import { verifyAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { verifyLicense } from '../middleware/license.js'

const router = Router()
router.use(verifyStaff, verifyLicense)
router.get('/', getShopSettings)
router.put('/', verifyAdmin, updateShopSettings)
export default router
