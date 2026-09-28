const birrFormatter = new Intl.NumberFormat('am-ET', {
  style: 'currency',
  currency: 'ETB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function formatBirr(amount) {
  const value = Number(amount)
  return birrFormatter.format(Number.isFinite(value) ? value : 0)
}
