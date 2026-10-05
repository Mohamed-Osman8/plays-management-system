import { AsyncLocalStorage } from 'node:async_hooks'
import mongoose from 'mongoose'

const tenantStorage = new AsyncLocalStorage()

export function runWithTenant(tenantId, callback) {
  return tenantStorage.run(tenantId ? String(tenantId) : null, callback)
}

export function tenantPlugin(schema) {
  schema.add({ shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', index: true } })
  schema.pre(/^find/, function scopeFind() {
    const shopId = tenantStorage.getStore()
    if (shopId) this.where({ shopId })
  })
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'deleteOne', 'deleteMany', 'countDocuments'], function scopeWrite() {
    const shopId = tenantStorage.getStore()
    if (shopId) this.where({ shopId })
  })
  schema.pre('save', function assignTenant() {
    const shopId = tenantStorage.getStore()
    if (shopId && !this.shopId) this.shopId = shopId
  })
  schema.pre('insertMany', function assignTenantToInsertedDocuments(next, documents) {
    const shopId = tenantStorage.getStore()
    if (shopId) {
      documents.forEach((document) => {
        if (!document.shopId) document.shopId = shopId
      })
    }
    next()
  })
  schema.pre('aggregate', function scopeAggregate() {
    const shopId = tenantStorage.getStore()
    if (!shopId) return
    const pipeline = this.pipeline()
    const firstStage = pipeline[0]
    const firstOperator = firstStage && Object.keys(firstStage)[0]
    const mustRemainFirst = ['$geoNear', '$search', '$searchMeta', '$vectorSearch', '$changeStream'].includes(firstOperator)
    pipeline.splice(mustRemainFirst ? 1 : 0, 0, { $match: { shopId: new mongoose.Types.ObjectId(shopId) } })
  })
}
