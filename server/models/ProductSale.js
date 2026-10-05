import mongoose from 'mongoose'
import { tenantPlugin } from '../config/tenantContext.js'

const productSaleSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    unitPrice: { type: Number, required: true, min: 0 },
    grossTotal: { type: Number, min: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['cash', 'card', 'mobile_money', 'bank', 'membership', 'other', 'mixed'], required: true },
    soldAt: { type: Date, default: Date.now, index: true },
    soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'PlaySession', default: null }
  },
  { timestamps: true }
)

productSaleSchema.plugin(tenantPlugin)
export default mongoose.model('ProductSale', productSaleSchema)
