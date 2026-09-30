import { Router } from 'express'
import { createMembership, deleteMembership, listMemberships, recordMembershipPayment, updateMembership } from '../controllers/membershipController.js'
import { verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { verifyLicense } from '../middleware/license.js'

const router = Router()
router.use(verifyStaff, verifyLicense, verifyCashierOrAdmin)
router.get('/', listMemberships)
router.post('/', createMembership)
router.post('/:id/payments', recordMembershipPayment)
router.post('/:id/payment', recordMembershipPayment)
router.put('/:id', updateMembership)
router.delete('/:id', deleteMembership)

export default router
