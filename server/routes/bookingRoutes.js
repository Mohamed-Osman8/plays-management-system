import { Router } from 'express'
import { verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { approveBooking, listBookings, rejectBooking, requestBooking } from '../controllers/bookingController.js'
import { verifyLicense } from '../middleware/license.js'

const router = Router()
router.post('/request', requestBooking)
router.get('/', verifyStaff, verifyLicense, verifyCashierOrAdmin, listBookings)
router.put('/:id/approve', verifyStaff, verifyLicense, verifyCashierOrAdmin, approveBooking)
router.put('/:id/reject', verifyStaff, verifyLicense, verifyCashierOrAdmin, rejectBooking)

export default router
