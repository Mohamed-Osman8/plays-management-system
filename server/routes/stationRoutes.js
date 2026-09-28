import { Router } from 'express'
import { verifyAdmin, verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { createStation, deleteStation, listStations, updateStation, updateStationHealth, updateStationStatus } from '../controllers/stationController.js'

const router = Router()
router.get('/', listStations)
router.put('/:id/health', verifyStaff, verifyAdmin, updateStationHealth)
router.post('/', verifyStaff, verifyAdmin, createStation)
router.patch('/:id/status', verifyStaff, verifyAdmin, updateStationStatus)
router.put('/:id/status', verifyStaff, verifyAdmin, updateStationStatus)
router.put('/:id', verifyStaff, verifyAdmin, updateStation)
router.delete('/:id', verifyStaff, verifyAdmin, deleteStation)

export default router
