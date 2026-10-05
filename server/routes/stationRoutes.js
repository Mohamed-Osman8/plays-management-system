import { Router } from 'express'
import { verifyAdmin, verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { createStation, deleteStation, listPublicStations, listStations, updateStation, updateStationHealth, updateStationStatus } from '../controllers/stationController.js'
import { verifyLicense } from '../middleware/license.js'

const router = Router()
router.get('/public', listPublicStations)
router.get('/', verifyStaff, verifyLicense, listStations)
router.put('/:id/health', verifyStaff, verifyLicense, verifyAdmin, updateStationHealth)
router.post('/', verifyStaff, verifyLicense, verifyAdmin, createStation)
router.patch('/:id/status', verifyStaff, verifyLicense, verifyAdmin, updateStationStatus)
router.put('/:id/status', verifyStaff, verifyLicense, verifyAdmin, updateStationStatus)
router.put('/:id', verifyStaff, verifyLicense, verifyAdmin, updateStation)
router.delete('/:id', verifyStaff, verifyLicense, verifyAdmin, deleteStation)

export default router
