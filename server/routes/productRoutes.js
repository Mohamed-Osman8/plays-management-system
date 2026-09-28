import { Router } from 'express'
import { createProduct, deleteProduct, listProducts, sellProduct, updateProduct } from '../controllers/productController.js'
import { verifyAdmin, verifyCashierOrAdmin, verifyStaff } from '../middleware/authMiddleware.js'

const router = Router()
router.use(verifyStaff, verifyCashierOrAdmin)
router.get('/', listProducts)
router.post('/', verifyAdmin, createProduct)
router.post('/sell', sellProduct)
router.put('/:id', verifyAdmin, updateProduct)
router.delete('/:id', verifyAdmin, deleteProduct)

export default router
