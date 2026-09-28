import mongoose from 'mongoose'

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    sku: { type: String, trim: true, uppercase: true, sparse: true, unique: true, maxlength: 40 },
    category: { type: String, trim: true, maxlength: 80, default: 'General' },
    imageUrl: { type: String, trim: true, maxlength: 2048, default: '' },
    price: { type: Number, required: true, min: 0 },
    cost: { type: Number, min: 0, default: 0 },
    stock: { type: Number, required: true, min: 0, validate: Number.isInteger },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
)

export default mongoose.model('Product', productSchema)
