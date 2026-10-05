import Product from '../models/Product.js'
import Station from '../models/Station.js'

async function replaceGlobalUniqueIndex(Model, field, key, options) {
  await Model.init()
  const indexes = await Model.collection.indexes()
  const legacyIndex = indexes.find((index) =>
    index.unique &&
    Object.keys(index.key).length === 1 &&
    index.key[field] === 1
  )
  if (legacyIndex) await Model.collection.dropIndex(legacyIndex.name)
  await Model.collection.createIndex(key, options)
}

export async function ensureTenantIndexes() {
  await replaceGlobalUniqueIndex(
    Station,
    'name',
    { shopId: 1, name: 1 },
    { unique: true, name: 'shop_station_name_unique' }
  )
  await replaceGlobalUniqueIndex(
    Product,
    'sku',
    { shopId: 1, sku: 1 },
    {
      unique: true,
      partialFilterExpression: { sku: { $type: 'string' } },
      name: 'shop_product_sku_unique'
    }
  )
}
