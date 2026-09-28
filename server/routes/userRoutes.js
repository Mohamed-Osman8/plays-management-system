import { Router } from 'express'
import { verifyAdmin, verifyStaff } from '../middleware/authMiddleware.js'
import { createUser, deleteUser, listUsers, updateUser } from '../controllers/userController.js'

const router = Router()
router.use(verifyStaff)
router.get('/', verifyAdmin, listUsers)
router.post('/create', verifyAdmin, createUser)
router.put('/:id', verifyAdmin, updateUser)
router.delete('/:id', verifyAdmin, deleteUser)

export default router
