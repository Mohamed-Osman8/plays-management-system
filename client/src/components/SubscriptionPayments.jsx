import { useEffect, useState } from 'react'
import { getShopPaymentHistory, submitShopPayment } from '../services/api'
import { formatBirr } from '../utils/currency'
import { useApp } from '../context/useApp'

const MONTHLY_PRICE = 3000
const PAYMENT_ACCOUNTS = [
  { method: 'Telebirr', label: 'Telebirr account', number: '0940867287' },
  { method: 'E-Birr', label: 'E-Birr account', number: '0940867287' },
  { method: 'CBE Bank Transfer', label: 'CBE Bank account', number: '1000278200427' }
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
  const [copiedAccount, setCopiedAccount] = useState(false)
  const selectedAccount = PAYMENT_ACCOUNTS.find((account) => account.method === paymentMethod)
  const amountDue = MONTHLY_PRICE * monthsRequested

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

  const copyAccountNumber = async () => {
    if (!selectedAccount) return
    setError('')
    try {
      await window.navigator.clipboard.writeText(selectedAccount.number)
      setCopiedAccount(true)
      window.setTimeout(() => setCopiedAccount(false), 2000)
    } catch (copyError) {
      setError(copyError.message || 'Unable to copy the account number. Please copy it manually.')
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
    <p className="subscription-payment-description">Choose a payment method, send the amount to its account, then enter your receipt reference for manual verification.</p>
    <form className="subscription-payment-form" onSubmit={submit}>
      <label>Renewal period<select value={monthsRequested} onChange={(event) => setMonthsRequested(Number(event.target.value))}>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option value={month} key={month}>{month} month{month === 1 ? '' : 's'} · {formatBirr(MONTHLY_PRICE * month)}</option>)}
      </select></label>
      <label>Choose payment method<select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setCopiedAccount(false); setError('') }}>
        <option>Telebirr</option><option>E-Birr</option><option>CBE Bank Transfer</option>
      </select></label>
      {selectedAccount && <div className="subscription-selected-payment" aria-live="polite">
        <div className="subscription-selected-payment-heading"><span className="subscription-payment-step">1</span><span><strong>Pay with {paymentMethod}</strong><small>Send {formatBirr(amountDue)} to this account</small></span></div>
        <div className="subscription-account-number"><span>{selectedAccount.label}<small>Account name: Mohamed Osman</small></span><strong>{selectedAccount.number}</strong></div>
        <button className="button button-secondary subscription-copy-account" type="button" onClick={copyAccountNumber}>{copiedAccount ? 'Account number copied ✓' : 'Copy account number'}</button>
        <p>After sending the payment, enter the transaction reference below. Your subscription will be renewed after the platform team verifies it.</p>
      </div>}
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
