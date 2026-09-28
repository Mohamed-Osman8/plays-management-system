import PlaySession from '../models/PlaySession.js'
import ProductSale from '../models/ProductSale.js'
import MembershipPayment from '../models/MembershipPayment.js'

const periods = ['all', 'hourly', 'daily', 'weekly', '15day', 'monthly', 'yearly', 'custom']
const DAY_MS = 24 * 60 * 60 * 1000

function utcFloor(date, unit) {
  const value = new Date(date)
  if (unit === 'hour') {
    value.setUTCMinutes(0, 0, 0)
  } else if (unit === 'day') {
    value.setUTCHours(0, 0, 0, 0)
  } else if (unit === 'week') {
    value.setUTCHours(0, 0, 0, 0)
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7))
  } else if (unit === 'month') {
    value.setUTCHours(0, 0, 0, 0)
    value.setUTCDate(1)
  } else if (unit === 'year') {
    value.setUTCHours(0, 0, 0, 0)
    value.setUTCMonth(0, 1)
  }
  return value
}

function advance(date, unit) {
  const value = new Date(date)
  if (unit === 'hour') value.setUTCHours(value.getUTCHours() + 1)
  else if (unit === 'day') value.setUTCDate(value.getUTCDate() + 1)
  else if (unit === 'week') value.setUTCDate(value.getUTCDate() + 7)
  else if (unit === 'month') value.setUTCMonth(value.getUTCMonth() + 1)
  else value.setUTCFullYear(value.getUTCFullYear() + 1)
  return value
}

function resolveRange(query, now) {
  const requestedValue = String(query.range || query.period || query.interval || 'daily').toLowerCase()
  const requestedPeriod = ({ '15-day': '15day', '15days': '15day', fortnight: '15day' })[requestedValue] || requestedValue
  if (!periods.includes(requestedPeriod)) return { error: 'Range must be all, hourly, daily, weekly, 15day, monthly, yearly, or custom.' }
  let start
  let end
  if (requestedPeriod === 'custom') {
    const rawStart = query.start || query.startDate || query.from
    const rawEnd = query.end || query.endDate || query.to
    if (!rawStart || !rawEnd) return { error: 'Custom reports require start and end dates.' }
    start = new Date(rawStart)
    end = new Date(rawEnd)
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawEnd))) end.setUTCHours(23, 59, 59, 999)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return { error: 'Custom report dates are invalid or start is after end.' }
    }
    if (end.getTime() - start.getTime() > 5 * 366 * DAY_MS) return { error: 'Custom report ranges cannot exceed five years.' }
  } else {
    end = now
    if (requestedPeriod === 'all') start = new Date(Date.UTC(1970, 0, 1))
    else if (requestedPeriod === 'hourly') start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    else if (requestedPeriod === 'daily') start = new Date(now.getTime() - 29 * DAY_MS)
    else if (requestedPeriod === 'weekly') start = new Date(now.getTime() - 12 * 7 * DAY_MS)
    else if (requestedPeriod === '15day') start = new Date(now.getTime() - 14 * DAY_MS)
    else if (requestedPeriod === 'monthly') start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
    else start = new Date(Date.UTC(now.getUTCFullYear() - 4, 0, 1))
  }

  let unit = requestedPeriod === 'hourly' ? 'hour'
    : requestedPeriod === 'weekly' ? 'week'
      : requestedPeriod === 'monthly' || requestedPeriod === 'all' ? 'month'
        : requestedPeriod === 'yearly' ? 'year'
          : 'day'
  if (requestedPeriod === 'custom') {
    const span = end.getTime() - start.getTime()
    unit = span <= 45 * DAY_MS ? 'day' : span <= 365 * DAY_MS ? 'week' : 'month'
  }
  return { requestedPeriod, start, end, unit }
}

function bucketKey(date, unit) {
  return utcFloor(date, unit).toISOString()
}

function blankBucket(date) {
  return {
    date: date.toISOString(),
    sessionRevenue: 0,
    inventorySales: 0,
    membershipRevenue: 0,
    revenue: 0,
    playedHours: 0,
    completedSessions: 0,
    productUnitsSold: 0
  }
}

export async function getFinancialReport(req, res, next) {
  try {
    const range = resolveRange(req.query, new Date())
    if (range.error) return res.status(400).json({ message: range.error })
    const { requestedPeriod, start, end, unit } = range
    const dateFilter = { $gte: start, $lte: end }
    const [sessions, sales, membershipPayments] = await Promise.all([
      PlaySession.find({ status: 'completed', endedAt: dateFilter }).select('endedAt revenue playedHours').lean(),
      ProductSale.find({ soldAt: dateFilter }).select('soldAt total quantity').lean(),
      MembershipPayment.find({ paidAt: dateFilter }).select('paidAt amount').lean()
    ])

    const bucketMap = new Map()
    let cursor = utcFloor(start, unit)
    const finalBucket = utcFloor(end, unit)
    if (requestedPeriod !== 'all') {
      while (cursor <= finalBucket) {
        bucketMap.set(cursor.toISOString(), blankBucket(cursor))
        cursor = advance(cursor, unit)
      }
    }

    const getBucket = (date) => {
      const key = bucketKey(date, unit)
      let bucket = bucketMap.get(key)
      if (!bucket && requestedPeriod === 'all') {
        bucket = blankBucket(utcFloor(date, unit))
        bucketMap.set(key, bucket)
      }
      return bucket
    }
    for (const session of sessions) {
      const bucket = getBucket(session.endedAt)
      if (!bucket) continue
      bucket.sessionRevenue += Number(session.revenue || 0)
      bucket.playedHours += Number(session.playedHours || 0)
      bucket.completedSessions += 1
    }
    for (const sale of sales) {
      const bucket = getBucket(sale.soldAt)
      if (!bucket) continue
      bucket.inventorySales += Number(sale.total || 0)
      bucket.productUnitsSold += Number(sale.quantity || 0)
    }
    for (const payment of membershipPayments) {
      const bucket = getBucket(payment.paidAt)
      if (bucket) bucket.membershipRevenue += Number(payment.amount || 0)
    }

    const buckets = [...bucketMap.values()].map((bucket) => {
      bucket.revenue = bucket.sessionRevenue + bucket.inventorySales + bucket.membershipRevenue
      for (const field of ['sessionRevenue', 'inventorySales', 'membershipRevenue', 'revenue']) {
        bucket[field] = Math.round(bucket[field] * 100) / 100
      }
      bucket.playedHours = Math.round(bucket.playedHours * 10000) / 10000
      return bucket
    }).sort((left, right) => new Date(left.date) - new Date(right.date))
    const totals = buckets.reduce((total, bucket) => {
      for (const field of ['sessionRevenue', 'inventorySales', 'membershipRevenue', 'revenue', 'playedHours', 'completedSessions', 'productUnitsSold']) {
        total[field] += bucket[field]
      }
      return total
    }, { sessionRevenue: 0, inventorySales: 0, membershipRevenue: 0, revenue: 0, playedHours: 0, completedSessions: 0, productUnitsSold: 0 })
    for (const field of ['sessionRevenue', 'inventorySales', 'membershipRevenue', 'revenue']) totals[field] = Math.round(totals[field] * 100) / 100
    totals.playedHours = Math.round(totals.playedHours * 10000) / 10000

    const summary = {
      ...totals,
      totalRevenue: totals.revenue,
      hoursPlayed: totals.playedHours,
      productRevenue: totals.inventorySales,
      sessionCount: totals.completedSessions,
      inventoryUnitsSold: totals.productUnitsSold,
      paymentTotal: totals.revenue
    }
    const periodLabels = {
      all: 'All-time overview', hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly', '15day': '15 days',
      monthly: 'Monthly', yearly: 'Yearly', custom: 'Custom range'
    }
    return res.json({
      range: { period: requestedPeriod, start: start.toISOString(), end: end.toISOString(), bucket: unit, timezone: 'UTC' },
      periodLabel: periodLabels[requestedPeriod],
      count: sessions.length + sales.length + membershipPayments.length,
      summary,
      totals,
      buckets
    })
  } catch (error) {
    return next(error)
  }
}

export async function getDashboardSummary(req, res, next) {
  try {
    const range = resolveRange(req.query, new Date())
    if (range.error) return res.status(400).json({ message: range.error })
    const { start, end } = range
    const dateFilter = { $gte: start, $lte: end }
    const [sessions, sales, membershipPayments] = await Promise.all([
      PlaySession.find({ status: 'completed', endedAt: dateFilter }).select('revenue playedHours').lean(),
      ProductSale.find({ soldAt: dateFilter }).select('total quantity').lean(),
      MembershipPayment.find({ paidAt: dateFilter }).select('amount').lean()
    ])
    const sessionRevenue = sessions.reduce((sum, item) => sum + Number(item.revenue || 0), 0)
    const inventorySales = sales.reduce((sum, item) => sum + Number(item.total || 0), 0)
    const membershipRevenue = membershipPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const revenue = sessionRevenue + inventorySales + membershipRevenue
    const summary = {
      revenue: Math.round(revenue * 100) / 100,
      sessionRevenue: Math.round(sessionRevenue * 100) / 100,
      inventorySales: Math.round(inventorySales * 100) / 100,
      membershipRevenue: Math.round(membershipRevenue * 100) / 100,
      playedHours: Math.round(sessions.reduce((sum, item) => sum + Number(item.playedHours || 0), 0) * 10000) / 10000,
      completedSessions: sessions.length,
      productUnitsSold: sales.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    }
    return res.json({
      range: { period: range.requestedPeriod, start: start.toISOString(), end: end.toISOString(), timezone: 'UTC' },
      summary
    })
  } catch (error) {
    return next(error)
  }
}
