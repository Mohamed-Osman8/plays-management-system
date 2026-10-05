import { Router } from 'express'
import { extendShopLicense, listShops, setShopLock, superAdminLogin } from '../controllers/superAdminController.js'
import { requireSuperAdmin } from '../middleware/superAdmin.js'

const router = Router()
router.post('/login', superAdminLogin)
router.use(requireSuperAdmin)
router.get('/shops', listShops)
router.post('/shops/:id/extend', extendShopLicense)
router.patch('/shops/:id/lock', setShopLock)
export default router
