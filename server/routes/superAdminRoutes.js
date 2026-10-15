import { Router } from 'express'
import { activateShop, approvePayment, approvePaymentRequest, deactivateShop, extendShopLicense, getActiveShops, getAllPendingPayments, getPaymentRequests, getPendingShops, listShops, rejectPayment, rejectShop, setShopLock, superAdminLogin } from '../controllers/superAdminController.js'
import { requireSuperAdmin } from '../middleware/superAdmin.js'

const router = Router()
router.post('/login', superAdminLogin)
router.use(requireSuperAdmin)
router.get('/shops', listShops)
router.get('/shops/pending', getPendingShops)
router.get('/shops/active', getActiveShops)
router.post('/shops/:id/activate', activateShop)
router.post('/shops/:id/reject', rejectShop)
router.post('/shops/:id/deactivate', deactivateShop)
router.post('/shops/:id/extend', extendShopLicense)
router.patch('/shops/:id/lock', setShopLock)
router.get('/payments/pending', getAllPendingPayments)
router.post('/payments/:paymentId/approve', approvePayment)
router.post('/payments/:paymentId/reject', rejectPayment)

router.get('/pending-shops', getPendingShops)
router.get('/active-shops', getActiveShops)
router.put('/activate-shop/:shopId', activateShop)
router.put('/deactivate-shop/:shopId', deactivateShop)
router.get('/payment-requests', getPaymentRequests)
router.put('/approve-payment/:paymentId', approvePaymentRequest)
export default router
