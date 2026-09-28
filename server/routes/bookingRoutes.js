import { Router } from 'express'
import { verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { approveBooking, listBookings, rejectBooking, requestBooking } from '../controllers/bookingController.js'

const router = Router()
router.post('/request', requestBooking)
router.get('/', verifyStaff, verifyCashierOrAdmin, listBookings)
router.put('/:id/approve', verifyStaff, verifyCashierOrAdmin, approveBooking)
router.put('/:id/reject', verifyStaff, verifyCashierOrAdmin, rejectBooking)

export default router
