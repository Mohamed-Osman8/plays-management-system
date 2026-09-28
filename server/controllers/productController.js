import mongoose from 'mongoose'
import Product from '../models/Product.js'
import ProductSale from '../models/ProductSale.js'
import SaleCheckout from '../models/SaleCheckout.js'

function invalidId(id) {
  return !mongoose.isValidObjectId(id)
}

export async function listProducts(_req, res, next) {
  try {
    return res.json({ products: await Product.find().sort({ name: 1 }) })
  } catch (error) {
    return next(error)
  }
}

export async function createProduct(req, res, next) {
  try {
    const { name, price, stock, sku, category, cost, active, imageUrl } = req.body
    if (!String(name || '').trim() || !Number.isFinite(Number(price)) || Number(price) < 0 ||
      !Number.isInteger(Number(stock)) || Number(stock) < 0) {
      return res.status(400).json({ message: 'Name, a non-negative price, and a non-negative integer stock are required.' })
    }
    const product = await Product.create({ name, price: Number(price), stock: Number(stock), sku, category, cost, active, imageUrl })
    return res.status(201).json({ product })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A product with this SKU already exists.' })
    return next(error)
  }
}

export async function updateProduct(req, res, next) {
  try {
    if (invalidId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID.' })
    const allowed = ['name', 'sku', 'category', 'price', 'cost', 'stock', 'active', 'imageUrl']
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)))
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'At least one product field is required.' })
    if (updates.price !== undefined) updates.price = Number(updates.price)
    if (updates.cost !== undefined) updates.cost = Number(updates.cost)
    if (updates.stock !== undefined) updates.stock = Number(updates.stock)
    const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    if (!product) return res.status(404).json({ message: 'Product not found.' })
    return res.json({ product })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A product with this SKU already exists.' })
    return next(error)
  }
}

export async function deleteProduct(req, res, next) {
  try {
    if (invalidId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID.' })
    const product = await Product.findByIdAndDelete(req.params.id)
    if (!product) return res.status(404).json({ message: 'Product not found.' })
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

export async function sellProduct(req, res, next) {
  let stockReserved = false
  let product
  try {
    const { productId, quantity = 1, paymentMethod = 'cash', sessionId } = req.body
    const count = Number(quantity)
    if (invalidId(productId)) return res.status(400).json({ message: 'A valid productId is required.' })
    if (!Number.isInteger(count) || count < 1) return res.status(400).json({ message: 'Quantity must be a positive integer.' })
    const normalizedMethod = String(paymentMethod).trim().toLowerCase().replace(/[\s-]+/g, '_')
    if (!['cash', 'card', 'mobile_money', 'bank', 'membership', 'other'].includes(normalizedMethod)) {
      return res.status(400).json({ message: 'Unsupported payment method.' })
    }

    product = await Product.findOneAndUpdate(
      { _id: productId, active: true, stock: { $gte: count } },
      { $inc: { stock: -count } },
      { new: true }
    )
    if (!product) {
      const exists = await Product.exists({ _id: productId })
      return exists
        ? res.status(409).json({ message: 'Product is inactive or there is not enough stock.' })
        : res.status(404).json({ message: 'Product not found.' })
    }
    stockReserved = true
    const unitPrice = Number(product.price)
    const sale = await ProductSale.create({
      product: product._id,
      productName: product.name,
      quantity: count,
      unitPrice,
      total: Math.round(unitPrice * count * 100) / 100,
      paymentMethod: normalizedMethod,
      soldBy: req.user?._id || null,
      session: sessionId || null
    })
    return res.status(201).json({ sale, product })
  } catch (error) {
    if (stockReserved && product) {
      await Product.updateOne({ _id: product._id }, { $inc: { stock: Number(req.body.quantity || 1) } }).catch(() => {})
    }
    return next(error)
  }
}

export async function createSale(req, res, next) {
  const reserved = []
  let sales = []
  try {
    const items = req.body.items || req.body.products ||
      (req.body.productId ? [{ productId: req.body.productId, quantity: req.body.quantity ?? 1 }] : null)
    const allowedMethods = ['cash', 'card', 'mobile_money', 'bank', 'membership', 'other']
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      return res.status(400).json({ message: 'Provide between 1 and 100 sale items.' })
    }
    let payments
    if (req.body.payments !== undefined) {
      if (!Array.isArray(req.body.payments) || req.body.payments.length === 0 || req.body.payments.length > 20) {
        return res.status(400).json({ message: 'payments must contain between 1 and 20 tender entries.' })
      }
      const tenderTotals = new Map()
      for (const tender of req.body.payments) {
        const method = String(tender?.paymentMethod || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
        const amount = Number(tender?.amount)
        if (!allowedMethods.includes(method)) return res.status(400).json({ message: 'Each tender requires a supported paymentMethod.' })
        if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8) {
          return res.status(400).json({ message: 'Each tender amount must be positive and use at most two decimal places.' })
        }
        tenderTotals.set(method, (tenderTotals.get(method) || 0) + Math.round(amount * 100))
      }
      payments = [...tenderTotals].map(([paymentMethod, cents]) => ({
        paymentMethod,
        amount: cents / 100
      }))
    } else {
      const paymentMethod = String(req.body.paymentMethod || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
      if (!allowedMethods.includes(paymentMethod)) {
        return res.status(400).json({ message: 'A supported paymentMethod or payments breakdown is required.' })
      }
      payments = [{ paymentMethod }]
    }
    if (req.body.sessionId && invalidId(req.body.sessionId)) {
      return res.status(400).json({ message: 'Invalid sessionId.' })
    }

    const quantities = new Map()
    for (const item of items) {
      const productId = String(item.productId || item.id || '')
      const quantity = Number(item.quantity ?? 1)
      if (invalidId(productId)) return res.status(400).json({ message: 'Each sale item requires a valid productId.' })
      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: 'Each item quantity must be a positive integer.' })
      }
      quantities.set(productId, (quantities.get(productId) || 0) + quantity)
    }

    const saleId = new mongoose.Types.ObjectId()
    const saleAt = req.body.soldAt ? new Date(req.body.soldAt) : new Date()
    if (Number.isNaN(saleAt.getTime())) return res.status(400).json({ message: 'Invalid soldAt date.' })

    const products = await Product.find({ _id: { $in: [...quantities.keys()] } })
    const productsById = new Map(products.map((product) => [String(product._id), product]))
    let grossTotalCents = 0
    for (const [productId, quantity] of quantities) {
      const product = productsById.get(productId)
      if (!product) return res.status(404).json({ message: 'Product not found.', productId })
      if (!product.active || product.stock < quantity) {
        return res.status(409).json({ message: 'Product is inactive or there is not enough stock.', productId })
      }
      grossTotalCents += Math.round(Number(product.price) * quantity * 100)
    }
    const discountAmount = Number(req.body.discountAmount ?? 0)
    if (!Number.isFinite(discountAmount) || discountAmount < 0 ||
      Math.abs(discountAmount * 100 - Math.round(discountAmount * 100)) > 1e-8) {
      return res.status(400).json({ message: 'discountAmount must be a non-negative amount with at most two decimal places.' })
    }
    const discountCents = Math.round(discountAmount * 100)
    if (discountCents > grossTotalCents) {
      return res.status(400).json({ message: 'discountAmount cannot exceed the gross product total.' })
    }
    const calculatedTotalCents = grossTotalCents - discountCents
    if (payments[0].amount === undefined) payments[0].amount = calculatedTotalCents / 100
    const tenderTotalCents = payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0)
    if (tenderTotalCents !== calculatedTotalCents) {
      return res.status(400).json({
        message: 'Tender amounts must sum to the calculated sale total.',
        total: calculatedTotalCents / 100,
        tenderTotal: tenderTotalCents / 100
      })
    }

    for (const [productId, quantity] of quantities) {
      const product = productsById.get(productId)
      const reservedProduct = await Product.findOneAndUpdate(
        { _id: product._id, active: true, stock: { $gte: quantity }, price: product.price },
        { $inc: { stock: -quantity } },
        { new: true }
      )
      if (!reservedProduct) {
        await Promise.all(reserved.map(({ id, count }) =>
          Product.updateOne({ _id: id }, { $inc: { stock: count } }).catch(() => {})
        ))
        reserved.length = 0
        return res.status(409).json({
          message: 'Product stock or price changed during checkout. Refresh the cart and try again.',
          productId
        })
      }
      reserved.push({ id: reservedProduct._id, count: quantity })
      const unitPrice = Number(reservedProduct.price)
      const lineGrossCents = Math.round(unitPrice * quantity * 100)
      sales.push({
        saleId,
        product: reservedProduct._id,
        productName: reservedProduct.name,
        quantity,
        unitPrice,
        grossTotal: lineGrossCents / 100,
        total: lineGrossCents / 100,
        paymentMethod: payments[0].paymentMethod,
        soldAt: saleAt,
        soldBy: req.user?._id || null,
        session: req.body.sessionId || null
      })
    }

    const paymentMethod = payments.length === 1 ? payments[0].paymentMethod : 'mixed'
    let remainingDiscountCents = discountCents
    for (const sale of sales) {
      const lineGrossCents = Math.round(sale.grossTotal * 100)
      const lineDiscountCents = Math.min(lineGrossCents, remainingDiscountCents)
      sale.discountAmount = lineDiscountCents / 100
      sale.total = (lineGrossCents - lineDiscountCents) / 100
      sale.paymentMethod = paymentMethod
      remainingDiscountCents -= lineDiscountCents
    }
    sales = await ProductSale.insertMany(sales, { ordered: true })
    const grossTotal = grossTotalCents / 100
    const total = calculatedTotalCents / 100
    await SaleCheckout.create({
      saleId,
      grossTotal,
      discountAmount,
      total,
      paymentMethod,
      payments,
      soldAt: saleAt,
      soldBy: req.user?._id || null,
      session: req.body.sessionId || null
    })
    return res.status(201).json({
      saleId,
      paymentMethod,
      payments,
      soldAt: saleAt,
      grossTotal,
      discountAmount,
      total,
      sales
    })
  } catch (error) {
    if (sales.length) {
      await ProductSale.deleteMany({ saleId: sales[0].saleId }).catch(() => {})
      await SaleCheckout.deleteOne({ saleId: sales[0].saleId }).catch(() => {})
    }
    await Promise.all(reserved.map(({ id, count }) =>
      Product.updateOne({ _id: id }, { $inc: { stock: count } }).catch(() => {})
    ))
    return next(error)
  }
}
