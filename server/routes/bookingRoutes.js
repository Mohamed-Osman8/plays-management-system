import { Router } from 'express'
import {
  approveBooking,
  createStaffBooking,
  getBooking,
  getBookingSummary,
  getPublicAvailability,
  listBookings,
  listPlatformBookings,
  listPublicShops,
  rejectBooking,
  requestBooking,
  setBookingStatus,
  updateBooking,
  updateBookingPayment
} from '../controllers/bookingController.js'
import { verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { verifyLicense } from '../middleware/license.js'
import { requireSuperAdmin } from '../middleware/superAdmin.js'

const router = Router()

router.get('/platform', requireSuperAdmin, listPlatformBookings)
router.get('/public/shops', listPublicShops)
router.get('/public/availability', getPublicAvailability)
router.post('/request', requestBooking)

router.get('/summary', verifyStaff, verifyLicense, verifyCashierOrAdmin, getBookingSummary)
router.get('/', verifyStaff, verifyLicense, verifyCashierOrAdmin, listBookings)
router.post('/', verifyStaff, verifyLicense, verifyCashierOrAdmin, createStaffBooking)
router.put('/:id/approve', verifyStaff, verifyLicense, verifyCashierOrAdmin, approveBooking)
router.put('/:id/reject', verifyStaff, verifyLicense, verifyCashierOrAdmin, rejectBooking)
router.get('/:id', verifyStaff, verifyLicense, verifyCashierOrAdmin, getBooking)
router.put('/:id', verifyStaff, verifyLicense, verifyCashierOrAdmin, updateBooking)
router.patch('/:id/status', verifyStaff, verifyLicense, verifyCashierOrAdmin, setBookingStatus)
router.patch('/:id/payment', verifyStaff, verifyLicense, verifyCashierOrAdmin, updateBookingPayment)

export default router
