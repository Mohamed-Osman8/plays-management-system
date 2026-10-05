import { Router } from 'express'
import { login, registerShop } from '../controllers/authController.js'

const router = Router()
router.post('/login', login)
router.post('/register', registerShop)

export default router
