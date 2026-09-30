import { formatBirr } from './currency'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

export function printReceipt({ shop, items, gamingCharge = 0, total }) {
  const popup = window.open('', '_blank', 'width=360,height=640')
  if (!popup) throw new Error('Allow pop-ups to print the receipt.')
  const lines = [
    `<h1>${escapeHtml(shop?.name || 'Game Zone')}</h1>`,
    shop?.phone ? `<div>${escapeHtml(shop.phone)}</div>` : '',
    shop?.address ? `<div>${escapeHtml(shop.address)}</div>` : '',
    '<hr />',
    `<div>Gaming charges <b>${formatBirr(gamingCharge)}</b></div>`,
    ...(items || []).map((item) => `<div>${escapeHtml(item.name)} <b>${formatBirr(item.price)}</b></div>`),
    '<hr />',
    `<h2>Total <b>${formatBirr(total)}</b></h2>`,
    `<small>${new Date().toLocaleString()}</small>`
  ].join('')
  popup.document.write(`<!doctype html><html><head><title>Receipt</title><style>body{font:14px monospace;width:280px;margin:16px auto;color:#111}h1,h2{text-align:center;font-size:18px}div{display:flex;justify-content:space-between;gap:12px;margin:8px 0}hr{border:0;border-top:1px dashed #111;margin:12px 0}small{display:block;text-align:center;margin-top:18px}@media print{body{margin:0}}</style></head><body>${lines}</body></html>`)
  popup.document.close()
  popup.focus()
  popup.onafterprint = () => popup.close()
  popup.print()
}
