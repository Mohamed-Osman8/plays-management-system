import { useEffect, useState } from 'react'
import { useApp } from '../context/useApp'
import BrandMark from '../components/BrandMark'
import { superAdminActivateShop, superAdminApprovePayment, superAdminDeactivateShop, superAdminExtendShop, superAdminListActiveShops, superAdminListPendingPayments, superAdminListPendingShops, superAdminLogin, superAdminRejectPayment, superAdminRejectShop, superAdminSetShopLock } from '../services/api'
import { formatBirr } from '../utils/currency'

const TOKEN_KEY = 'game-zone-super-admin-token'
const PAYMENT_INFO = 'CBE Bank: 1000278200427 · Telebirr: 0940867287 · CBE Birr: 0940867287 · Mohamed Osman'

export default function SuperAdminDashboard() {
  const { setRoute } = useApp()
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || '')
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [activeShops, setActiveShops] = useState([])
  const [pendingShops, setPendingShops] = useState([])
  const [payments, setPayments] = useState([])
  const [activeTab, setActiveTab] = useState('activation')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [activatingId, setActivatingId] = useState('')
  const [busyPaymentId, setBusyPaymentId] = useState('')
  const [confirmShop, setConfirmShop] = useState(null)

  const loadPlatformData = async (accessToken) => {
    const [activeResult, pendingResult, paymentsResult] = await Promise.all([
      superAdminListActiveShops(accessToken),
      superAdminListPendingShops(accessToken),
      superAdminListPendingPayments(accessToken)
    ])
    return { activeResult, pendingResult, paymentsResult }
  }

  const refresh = async (accessToken = token) => {
    const { activeResult, pendingResult, paymentsResult } = await loadPlatformData(accessToken)
    setActiveShops(activeResult.shops || [])
    setPendingShops(pendingResult.shops || [])
    setPayments(paymentsResult.payments || [])
  }

  useEffect(() => {
    if (!token) return
    let cancelled = false
    loadPlatformData(token)
      .then(({ activeResult, pendingResult, paymentsResult }) => {
        if (cancelled) return
        setActiveShops(activeResult.shops || [])
        setPendingShops(pendingResult.shops || [])
        setPayments(paymentsResult.payments || [])
        setLoaded(true)
      })
      .catch((requestError) => {
        if (cancelled) return
        setError(requestError.message || 'Unable to load registered shops.')
        setLoaded(true)
        window.localStorage.removeItem(TOKEN_KEY)
        setToken('')
      })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (!token) return undefined
    const timer = window.setInterval(() => {
      refresh(token).catch((requestError) => setError(requestError.message || 'Unable to refresh platform data.'))
    }, 30000)
    return () => window.clearInterval(timer)
  }, [token])

  const login = async (event) => {
    event.preventDefault()
    setError('')
    setLoggingIn(true)
    try {
      const result = await superAdminLogin(credentials)
      window.localStorage.setItem(TOKEN_KEY, result.token)
      setToken(result.token)
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in.')
    } finally {
      setLoggingIn(false)
    }
  }

  const mutateShop = async (shop, action) => {
    if (action === 'deactivate') {
      setConfirmShop(shop)
      return
    }
    setBusyId(String(shop._id))
    setError('')
    setSuccess('')
    try {
      if (action === 'extend') await superAdminExtendShop(token, shop._id)
      else await superAdminSetShopLock(token, shop._id, false)
      setSuccess(action === 'extend' ? `${shop.name} renewed for 30 days.` : `${shop.name} is active again.`)
      await refresh()
    } catch (requestError) {
      setError(requestError.message || 'Unable to update subscription.')
    } finally {
      setBusyId('')
    }
  }

  const confirmDeactivate = async () => {
    if (!confirmShop) return
    const shop = confirmShop
    setConfirmShop(null)
    setBusyId(String(shop._id))
    setError('')
    setSuccess('')
    try {
      await superAdminDeactivateShop(token, shop._id)
      setSuccess(`${shop.name} has been blocked and remains in the shop list.`)
      await refresh()
    } catch (requestError) {
      setError(requestError.message || 'Unable to block shop.')
    } finally {
      setBusyId('')
    }
  }

  const activateShop = async (shop) => {
    if (!window.confirm(`Have you verified the 3,000 ETB payment from ${shop.name}? Activating grants 30 days of access.`)) return
    setActivatingId(String(shop._id))
    setError('')
    setSuccess('')
    try {
      await superAdminActivateShop(token, shop._id)
      setSuccess(`${shop.name} activated for 30 days.`)
      await refresh()
    } catch (requestError) {
      setError(requestError.message || 'Unable to activate shop.')
    } finally {
      setActivatingId('')
    }
  }

  const rejectShop = async (shop) => {
    const notes = window.prompt(`Reason for rejecting ${shop.name}:`, '')
    if (notes === null) return
    setActivatingId(String(shop._id))
    setError('')
    setSuccess('')
    try {
      await superAdminRejectShop(token, shop._id, notes.trim())
      setSuccess(`${shop.name} registration rejected.`)
      await refresh()
    } catch (requestError) {
      setError(requestError.message || 'Unable to reject shop.')
    } finally {
      setActivatingId('')
    }
  }

  const mutatePayment = async (payment, action) => {
    let notes = ''
    if (action === 'reject') {
      const enteredNotes = window.prompt('Reason for rejecting this payment:', '')
      if (enteredNotes === null) return
      notes = enteredNotes.trim()
      if (!notes) {
        setError('A rejection reason is required.')
        return
      }
    }
    setBusyPaymentId(String(payment._id))
    setError('')
    setSuccess('')
    try {
      if (action === 'approve') {
        await superAdminApprovePayment(token, payment._id)
        setSuccess(`Payment approved and ${payment.shop?.name || 'shop'} license renewed.`)
      } else {
        await superAdminRejectPayment(token, payment._id, notes)
        setSuccess(`Payment request for ${payment.shop?.name || 'shop'} rejected.`)
      }
      await refresh()
    } catch (requestError) {
      setError(requestError.message || 'Unable to process payment request.')
    } finally {
      setBusyPaymentId('')
    }
  }

  if (!token) {
    return (
      <main className="onboarding-shell onboarding-page">
        <form className="panel onboarding-card super-admin-login-card" onSubmit={login}>
          <button className="onboarding-close super-admin-login-close" type="button" aria-label="Close Super Admin login and return to sign in" title="Back to sign in" onClick={() => setRoute('login')}>×</button>
          <div className="super-admin-login-brand"><BrandMark /><span className="eyebrow">Platform owner</span></div>
          <div className="super-admin-login-heading"><h1>Super Admin</h1><p>Sign in to manage shops, licenses, and platform payments.</p></div>
          <label className="super-admin-login-field">Username<input autoComplete="username" value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} placeholder="Enter your username" required disabled={loggingIn} /></label>
          <label className="super-admin-login-field">Password<input autoComplete="current-password" type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} placeholder="Enter your password" required disabled={loggingIn} /></label>
          {error && <StatusAlert type="error" message={error} onDismiss={() => setError('')} />}
          <button className="button button-primary super-admin-login-submit" type="submit" disabled={loggingIn}>{loggingIn ? <><span className="spinner" /> Signing in…</> : <>Sign in <span aria-hidden="true">→</span></>}</button>
          <button className="text-button super-admin-login-link" type="button" onClick={() => setRoute('login')}>Staff sign in</button>
          <span className="super-admin-login-secure"><i /> SECURE PLATFORM ACCESS</span>
        </form>
      </main>
    )
  }

  return (
    <main className="super-admin-page">
      <header className="page-toolbar">
        <div><span className="eyebrow">Platform management</span><h1>Registered shops</h1></div>
        <button className="button button-secondary" type="button" onClick={() => { window.localStorage.removeItem(TOKEN_KEY); setToken('') }}>Sign out</button>
      </header>
      <p className="panel payment-details"><strong>Manual payment verification</strong><span>{PAYMENT_INFO}</span></p>
      {error && <StatusAlert type="error" message={error} onDismiss={() => setError('')} />}
      {success && <StatusAlert type="success" message={success} onDismiss={() => setSuccess('')} />}
      <nav className="super-admin-tabs" aria-label="Platform management sections">
        <button className={activeTab === 'activation' ? 'active' : ''} type="button" onClick={() => { setActiveTab('activation'); setError(''); setSuccess('') }}>Pending Approvals <span>{pendingShops.length}</span></button>
        <button className={activeTab === 'shops' ? 'active' : ''} type="button" onClick={() => { setActiveTab('shops'); setError(''); setSuccess('') }}>Registered Shops <span>{activeShops.length}</span></button>
        <button className={activeTab === 'payments' ? 'active' : ''} type="button" onClick={() => { setActiveTab('payments'); setError(''); setSuccess('') }}>Payment Requests <span>{payments.length}</span></button>
      </nav>
      {!loaded ? <div className="panel empty-state" role="status"><span className="spinner" /> Loading platform data…</div> : activeTab === 'activation' && <section className="pending-payments-list">
        {!pendingShops.length ? <div className="panel empty-state">No shops are waiting for approval.</div> : pendingShops.map((shop) => <article className="panel pending-payment-card pending-activation-card" key={shop._id}>
          <div className="pending-payment-shop"><span className="eyebrow">Pending shop</span><h2>{shop.name}</h2><span>{shop.ownerPhone || shop.phone || 'No phone provided'} · @{shop.ownerUsername}</span></div>
          <div className="pending-payment-detail"><small>Registered</small><strong>{shop.createdAt ? new Date(shop.createdAt).toLocaleString() : '—'}</strong></div>
          <div className="pending-payment-detail"><small>Activation payment</small><strong>3,000 ETB · 30 days</strong><span>Verify receipt before activating</span></div>
          <div className="pending-payment-actions">
            <button className="button button-primary" type="button" disabled={activatingId === String(shop._id)} onClick={() => activateShop(shop)}>{activatingId === String(shop._id) ? <><span className="spinner" /> Activating…</> : 'Activate shop (30 days)'}</button>
            <button className="button button-danger" type="button" disabled={activatingId === String(shop._id)} onClick={() => rejectShop(shop)}>{activatingId === String(shop._id) ? 'Processing…' : 'Reject'}</button>
          </div>
        </article>)}
      </section>}
      {loaded && activeTab === 'shops' && <div className="table-panel super-admin-table">
        <div className="table-header"><span>Shop</span><span>Phone / username</span><span>License</span><span>Expires / days left</span><span>Actions</span></div>
        {activeShops.map((shop) => {
          const expiresAt = shop.licenseExpiresAt || shop.license?.expiresAt
          const remainingDays = shop.remainingDays ?? null
          const expired = remainingDays === null || remainingDays <= 0
          const locked = ['locked', 'suspended'].includes(shop.license?.status)
          return (
            <div className="table-row" key={shop._id}>
              <strong>{shop.name}</strong>
              <span>{shop.ownerPhone || shop.phone}<small className="shop-username">@{shop.ownerUsername}</small></span>
              <span className={`status-pill ${locked || expired ? 'maintenance' : 'available'}`}>{locked ? 'Locked' : expired ? 'Expired' : shop.license?.status || 'Active'}</span>
              <span>{expiresAt ? <>{new Date(expiresAt).toLocaleDateString()}<small className="shop-username">{expired ? 'Expired' : `${remainingDays} day${remainingDays === 1 ? '' : 's'} left`}</small></> : '—'}</span>
              <span className="super-admin-actions">
                {shop.status === 'inactive' || shop.isApproved === false
                  ? <button className="text-button shop-unblock-button" type="button" disabled={busyId === String(shop._id)} onClick={() => mutateShop(shop, 'activate')}>{busyId === String(shop._id) ? 'Unblocking…' : 'Unblock shop'}</button>
                  : <>
                    <button className="text-button" type="button" disabled={busyId === String(shop._id)} onClick={() => mutateShop(shop, 'extend')}>+ Kordhi 1 Bil / Verify payment</button>
                    <button className="text-button shop-block-button" type="button" disabled={busyId === String(shop._id)} onClick={() => mutateShop(shop, 'deactivate')}>{busyId === String(shop._id) ? 'Blocking…' : 'Deactivate / Block'}</button>
                  </>}
              </span>
            </div>
          )
        })}
        {!activeShops.length && <div className="empty-state">No registered shops yet.</div>}
      </div>}
      {loaded && activeTab === 'payments' && <section className="pending-payments-list">
        {!payments.length ? <div className="panel empty-state">No pending payment requests.</div> : payments.map((payment) => <article className="panel pending-payment-card" key={payment._id}>
          <div className="pending-payment-shop"><span className="eyebrow">Shop</span><h2>{payment.shop?.name || 'Unknown shop'}</h2><span>{payment.shop?.ownerPhone || payment.shop?.phone || 'No phone provided'}</span></div>
          <div className="pending-payment-detail"><small>Transaction reference</small><strong>{payment.transactionReference}</strong></div>
          <div className="pending-payment-detail"><small>Method · Amount</small><strong>{payment.paymentMethod} · {formatBirr(payment.amount)}</strong><span>{payment.monthsRequested} month{payment.monthsRequested === 1 ? '' : 's'}</span></div>
          <div className="pending-payment-detail"><small>Submitted</small><strong>{payment.submittedAt ? new Date(payment.submittedAt).toLocaleString() : '—'}</strong></div>
          <div className="pending-payment-actions">
            <button className="button button-primary" type="button" disabled={busyPaymentId === String(payment._id)} onClick={() => mutatePayment(payment, 'approve')}>{busyPaymentId === String(payment._id) ? <><span className="spinner" /> Processing…</> : 'Approve & renew'}</button>
            <button className="button button-danger" type="button" disabled={busyPaymentId === String(payment._id)} onClick={() => mutatePayment(payment, 'reject')}>Reject</button>
          </div>
        </article>)}
      </section>}
      {confirmShop && <div className="shop-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmShop(null) }}>
        <section className="shop-confirm-card panel" role="alertdialog" aria-modal="true" aria-labelledby="shop-confirm-title" aria-describedby="shop-confirm-description">
          <span className="shop-confirm-icon" aria-hidden="true">!</span>
          <span className="eyebrow">Confirm shop access change</span>
          <h2 id="shop-confirm-title">Block {confirmShop.name}?</h2>
          <p id="shop-confirm-description">This shop will lose platform access, but it will remain in the list so you can unblock it later.</p>
          <div className="shop-confirm-actions">
            <button className="button button-secondary" type="button" onClick={() => setConfirmShop(null)}>Keep active</button>
            <button className="button button-danger" type="button" onClick={confirmDeactivate}>Block shop</button>
          </div>
        </section>
      </div>}
    </main>
  )
}

function StatusAlert({ type, message, onDismiss }) {
  const success = type === 'success'
  return (
    <div className={`platform-alert platform-alert-${type}`} role={success ? 'status' : 'alert'}>
      <span className="platform-alert-icon" aria-hidden="true">{success ? '✓' : '!'}</span>
      <span className="platform-alert-message">{message}</span>
      <button type="button" className="platform-alert-dismiss" onClick={onDismiss} aria-label="Dismiss notification">×</button>
    </div>
  )
}
