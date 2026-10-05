import { useEffect, useState } from 'react'
import { superAdminExtendShop, superAdminListShops, superAdminLogin, superAdminSetShopLock } from '../services/api'

const TOKEN_KEY = 'game-zone-super-admin-token'
const PAYMENT_INFO = 'Telebirr: 0940867287 · CBE: 1000278200427 · Mohamed Osman Buh'

export default function SuperAdmin() {
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || '')
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [shops, setShops] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const refresh = async (accessToken = token) => {
    const result = await superAdminListShops(accessToken)
    setShops(result.shops || [])
  }

  useEffect(() => {
    if (!token) return
    refresh().catch((requestError) => {
      setError(requestError.message || 'Unable to load registered shops.')
      window.localStorage.removeItem(TOKEN_KEY)
      setToken('')
    })
  }, [token])

  const login = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const result = await superAdminLogin(credentials)
      window.localStorage.setItem(TOKEN_KEY, result.token)
      setToken(result.token)
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in.')
    }
  }

  const mutateShop = async (shop, action) => {
    setBusyId(String(shop._id))
    setError('')
    try {
      if (action === 'extend') await superAdminExtendShop(token, shop._id)
      else await superAdminSetShopLock(token, shop._id, action === 'lock')
      await refresh()
    } catch (requestError) {
      setError(requestError.message || 'Unable to update subscription.')
    } finally {
      setBusyId('')
    }
  }

  if (!token) {
    return (
      <main className="onboarding-shell">
        <form className="panel onboarding-card" onSubmit={login}>
          <span className="eyebrow">Platform owner</span>
          <h1>Super Admin</h1>
          <label>Username<input value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} required /></label>
          <label>Password<input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} required /></label>
          {error && <small className="form-error" role="alert">{error}</small>}
          <button className="button button-primary" type="submit">Sign in</button>
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
      {error && <small className="form-error" role="alert">{error}</small>}
      <div className="table-panel super-admin-table">
        <div className="table-header"><span>Shop</span><span>Phone / username</span><span>License</span><span>Expires</span><span>Actions</span></div>
        {shops.map((shop) => {
          const expired = !shop.license?.expiresAt || new Date(shop.license.expiresAt) < new Date()
          const locked = ['locked', 'suspended'].includes(shop.license?.status)
          return (
            <div className="table-row" key={shop._id}>
              <strong>{shop.name}</strong>
              <span>{shop.ownerPhone || shop.phone}<small className="shop-username">@{shop.ownerUsername}</small></span>
              <span className={`status-pill ${locked || expired ? 'maintenance' : 'available'}`}>{locked ? 'Locked' : expired ? 'Expired' : shop.license?.status || 'Active'}</span>
              <span>{shop.license?.expiresAt ? new Date(shop.license.expiresAt).toLocaleDateString() : '—'}</span>
              <span className="super-admin-actions">
                <button className="text-button" type="button" disabled={busyId === String(shop._id)} onClick={() => mutateShop(shop, 'extend')}>+ Kordhi 1 Bil / Verify payment</button>
                <button className="text-button" type="button" disabled={busyId === String(shop._id)} onClick={() => mutateShop(shop, locked ? 'unlock' : 'lock')}>{locked ? 'Unlock' : 'Lock'} subscription</button>
              </span>
            </div>
          )
        })}
        {!shops.length && <div className="empty-state">No shops have registered yet.</div>}
      </div>
    </main>
  )
}
