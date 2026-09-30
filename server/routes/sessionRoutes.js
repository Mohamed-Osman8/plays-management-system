import { Router } from 'express'
import { cancelSession, endSession, listSessions, pauseSession, resumeSession, reverseSession, startSession } from '../controllers/sessionController.js'
import { verifyAdmin, verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { verifyLicense } from '../middleware/license.js'

const router = Router()
router.use(verifyStaff, verifyLicense, verifyCashierOrAdmin)
router.get('/', listSessions)
router.post('/start', startSession)
router.put('/:id/pause', pauseSession)
router.put('/:id/resume', resumeSession)
router.put('/:id/stop', endSession)
router.put('/:id/end', endSession)
router.put('/:id/cancel', cancelSession)
router.put('/:id/reverse', verifyAdmin, reverseSession)

export default router
