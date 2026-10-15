import { useEffect, useState } from 'react'
import { getShopPaymentHistory, submitShopPayment } from '../services/api'
import { formatBirr } from '../utils/currency'
import { useApp } from '../context/useApp'

const MONTHLY_PRICE = 3000
const PAYMENT_ACCOUNTS = [
  { label: 'CBE Bank Account', number: '1000278200427' },
  { label: 'Telebirr', number: '0940867287' },
  { label: 'CBE Birr', number: '0940867287' }
]

function displayDate(date) {
  return date ? new Date(date).toLocaleString() : '—'
}

export default function SubscriptionPayments({ onRenewed }) {
  const { refreshShopSettings, setRoute } = useApp()
  const [payments, setPayments] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('Telebirr')
  const [transactionReference, setTransactionReference] = useState('')
  const [monthsRequested, setMonthsRequested] = useState(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(false)

  const refresh = async () => {
    const result = await getShopPaymentHistory()
    setPayments(result.payments || [])
  }

  useEffect(() => {
    let cancelled = false
    getShopPaymentHistory()
      .then((result) => { if (!cancelled) setPayments(result.payments || []) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || 'Unable to load payment history.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      await submitShopPayment({ paymentMethod, transactionReference: transactionReference.trim(), monthsRequested })
      setTransactionReference('')
      setMessage('Payment request submitted. Your license will be renewed after verification.')
    } catch (requestError) {
      setError(requestError.message || 'Unable to submit payment request.')
      setSubmitting(false)
      return
    }
    try {
      await refresh()
    } catch (requestError) {
      setError(`Payment request submitted, but history could not refresh: ${requestError.message || 'Unable to load payment history.'}`)
    } finally {
      setSubmitting(false)
    }
  }

  const checkRenewal = async () => {
    setChecking(true)
    setError('')
    try {
      await refreshShopSettings()
      if (onRenewed) onRenewed()
      else setRoute('dashboard')
    } catch (requestError) {
      setError(requestError.message || 'Your renewal is not active yet. Please try again after the payment is approved.')
    } finally {
      setChecking(false)
    }
  }

  return <section className="panel subscription-payment-panel">
    <div className="panel-heading">
      <div><span className="eyebrow">Manual payment</span><h3>Renew your subscription</h3></div>
      <span className="status-pill reserved">{formatBirr(MONTHLY_PRICE)} / month</span>
    </div>
    <p className="subscription-payment-description">Send the renewal amount to one of the official accounts below. Enter the transaction reference so the platform team can verify your payment.</p>
    <div className="subscription-accounts">
      {PAYMENT_ACCOUNTS.map((account) => <div className="subscription-account" key={account.label}>
        <span>{account.label}<small>Mohamed Osman</small></span><strong>{account.number}</strong>
      </div>)}
    </div>
    <form className="subscription-payment-form" onSubmit={submit}>
      <label>Renewal period<select value={monthsRequested} onChange={(event) => setMonthsRequested(Number(event.target.value))}>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option value={month} key={month}>{month} month{month === 1 ? '' : 's'} · {formatBirr(MONTHLY_PRICE * month)}</option>)}
      </select></label>
      <label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
        <option>Telebirr</option><option>CBE Birr</option><option>CBE Bank Transfer</option>
      </select></label>
      <label className="subscription-reference-field">Transaction reference<input value={transactionReference} onChange={(event) => setTransactionReference(event.target.value)} maxLength="120" placeholder="Enter the receipt or transaction number" required /></label>
      {error && <small className="form-error" role="alert">{error}</small>}
      {message && <small className="form-success" role="status">{message}</small>}
      <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit payment for verification'}</button>
      {onRenewed && <button className="button button-secondary subscription-check-button" type="button" onClick={checkRenewal} disabled={checking}>{checking ? 'Checking…' : 'Check renewal status'}</button>}
    </form>
    <div className="subscription-payment-history">
      <h4>Payment request history</h4>
      {loading ? <p className="empty-state">Loading payment history…</p> : payments.length ? payments.map((payment) => <div className="subscription-payment-row" key={payment._id}>
        <span><strong>{payment.paymentMethod} · {payment.transactionReference}</strong><small>{displayDate(payment.submittedAt)} · {payment.monthsRequested} month{payment.monthsRequested === 1 ? '' : 's'} · {formatBirr(payment.amount)}</small>
          {payment.status === 'rejected' && payment.notes && <small className="subscription-rejection-note">Reason: {payment.notes}</small>}</span>
        <span className={`status-pill ${payment.status === 'approved' ? 'available' : payment.status === 'rejected' ? 'maintenance' : 'reserved'}`}>{payment.status}</span>
      </div>) : <p className="empty-state">No payment requests yet.</p>}
    </div>
  </section>
}
