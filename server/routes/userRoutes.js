import { Router } from 'express'
import { verifyAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { createUser, deleteUser, listUsers, updateUser } from '../controllers/userController.js'
import { verifyLicense } from '../middleware/license.js'

const router = Router()
router.use(verifyStaff, verifyLicense)
router.get('/', verifyAdmin, listUsers)
router.post('/create', verifyAdmin, createUser)
router.put('/:id', verifyAdmin, updateUser)
router.delete('/:id', verifyAdmin, deleteUser)

export default router
