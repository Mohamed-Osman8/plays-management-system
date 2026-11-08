import { useEffect, useState } from 'react'
import { AppProvider } from './context/AppContext'
import { useApp } from './context/useApp'
import Dashboard from './pages/Home'
import Navbar from './components/Navbar'
import BrandMark from './components/BrandMark'
import PwaInstallButton from './components/PwaInstallButton'
import Login from './pages/Login'
import Register from './pages/Register'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import SubscriptionPayments from './components/SubscriptionPayments'
import { getPublicAvailability, getPublicShops } from './services/api'
import './App.css'
import './theme.css'

function RouterView({ theme, onThemeChange }) {
  const { route } = useApp()
  const pages = {
    dashboard: Dashboard,
    'super-admin': SuperAdminDashboard,
  }
  const Page = pages[route] || Dashboard
  return <Page theme={theme} onThemeChange={onThemeChange} />
}

function dateForTimeZone(timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function PublicPortal() {
  const { addRemoteReservation, setRoute } = useApp()
  const [shops, setShops] = useState([])
  const [stations, setStations] = useState([])
  const [bookingSettings, setBookingSettings] = useState(null)
  const [showStaffLogin, setShowStaffLogin] = useState(false)
  const [form, setForm] = useState({ shopId: '', customer: '', customerEmail: '', phone: '', consoleType: '', stationId: '', date: '', time: '', durationMinutes: 60, notes: '' })
  const [confirmation, setConfirmation] = useState(null)
  const [error, setError] = useState('')
  const [emailWarning, setEmailWarning] = useState('')
  const [loadingStations, setLoadingStations] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    let active = true
    getPublicShops().then(({ shops: availableShops }) => {
      if (!active) return
      setShops(availableShops || [])
      if (availableShops?.length) {
        setForm((current) => ({ ...current, shopId: current.shopId || String(availableShops[0]._id) }))
      }
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Unable to load booking shops.')
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!form.shopId) {
      setStations([])
      return undefined
    }
    let active = true
    setLoadingStations(true)
    const filters = { shopId: form.shopId }
    if (form.date && form.time && form.durationMinutes) {
      filters.date = form.date
      filters.startTime = form.time
      filters.durationMinutes = form.durationMinutes
    }
    getPublicAvailability(filters).then((result) => {
      if (!active) return
      setStations(result.stations || [])
      setBookingSettings(result.bookingSettings || null)
      const durations = result.bookingSettings?.durationOptionsMinutes || []
      setForm((current) => ({
        ...current,
        durationMinutes: durations.includes(Number(current.durationMinutes)) ? Number(current.durationMinutes) : Number(durations[0] || 60),
        stationId: (result.stations || []).some((station) => String(station._id) === current.stationId && station.isAvailable)
          ? current.stationId
          : ''
      }))
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Unable to check station availability.')
    }).finally(() => {
      if (active) setLoadingStations(false)
    })
    return () => { active = false }
  }, [form.shopId, form.date, form.time, form.durationMinutes])
  const available = stations.filter((station) => station.isAvailable)
  const selectedShop = shops.find((shop) => String(shop._id) === form.shopId)
  const selectedType = stations.some((station) => station.type === form.consoleType)
    ? form.consoleType
    : available[0]?.type || stations[0]?.type || ''
  const typedAvailable = available.filter((station) => station.type === selectedType)
  const selectedStation = typedAvailable.find((station) => String(station._id) === form.stationId)
  const rateKey = { PS4: 'ps4', PS5: 'ps5', VIP: 'vip', Other: 'other' }[selectedType]
  const hourlyRate = Number(selectedShop?.rates?.[rateKey] || 0)
  const estimate = Math.round(hourlyRate * Number(form.durationMinutes || 0) / 60 * 100) / 100
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setEmailWarning('')
    if (!/^\+?[0-9 ]{7,18}$/.test(form.phone)) return setError('Please enter a valid phone number using numbers only.')
    if (!selectedStation || !form.date || !form.time) return setError('Select an available station, date, start time, and duration.')
    setSubmitting(true)
    try {
      const result = await addRemoteReservation({ ...form, consoleType: selectedType, stationId: String(selectedStation._id) })
      setConfirmation(result.booking)
      setEmailWarning(result.emailWarning || '')
    } catch (submissionError) {
      setError(submissionError.message || 'Unable to send booking request.')
    } finally {
      setSubmitting(false)
    }
  }
  const statusMessage = confirmation
    ? `Your request for ${confirmation.stationName} on ${confirmation.date} at ${confirmation.arrivalTime} is ${confirmation.status.toLowerCase()}.`
    : ''
  return (
    <main className="public-portal">
      <header className="public-header">
        <a className="sidebar-brand" href="#home" aria-label="Game Zone home">
          <BrandMark />
          <span>PLAYSTATION<br /><b>GAME ZONE</b></span>
        </a>
        <span className="public-header-actions">
          <PwaInstallButton />
          <button className="button button-secondary public-staff-button" type="button" onClick={() => setShowStaffLogin(true)}>Staff portal</button>
          <button className="button button-primary public-create-shop" type="button" onClick={() => setRoute('register')}>Create shop <span aria-hidden="true">↗</span></button>
        </span>
      </header>
      <div className="public-content">
        <section className="public-showcase" id="hardware">
          <div className="public-showcase-copy">
            <span className="public-kicker"><i /> BUILT FOR THE NEXT GENERATION OF GAME ZONES</span>
            <h1>Play has<br /><span>no limits.</span></h1>
            <h2 className="public-hero-subtitle">Smart PlayStation management.</h2>
            <p>Keep every station, session and sale in sync. A smarter way to run your PlayStation business, from any screen.</p>
            <div className="public-hero-actions">
              <button className="button button-primary public-blue-button" type="button" onClick={() => setRoute('register')}>Create your shop now <span aria-hidden="true">↗</span></button>
              <button className="button button-secondary public-demo-button" type="button" onClick={() => setRoute('demo')}>Explore live demo <span aria-hidden="true">→</span></button>
            </div>
            <div className="public-proof">
              <span><b>{stations.length}</b><small>stations on the floor</small></span>
              <i />
              <span><b>{available.length}</b><small>ready to play now</small></span>
              <i />
              <span><b>24/7</b><small>access from any device</small></span>
            </div>
          </div>
          <div className="public-showcase-art" aria-label="Game Zone live station preview">
            <div className="showcase-orbit showcase-orbit-one" />
            <div className="showcase-orbit showcase-orbit-two" />
            <div className="showcase-console"><BrandMark /><span className="console-platform-label">PLAYSTATION<br /><b>GAME ZONE</b></span></div>
            <div className="showcase-float showcase-live"><i /><span><b>LIVE FLOOR PLAN</b><small>Everything in control</small></span><span className="showcase-arrow">↗</span></div>
            <div className="showcase-float showcase-stations"><span className="showcase-station-icon">▣</span><span><b>{available.length} stations ready</b><small>Real-time availability</small></span></div>
            <div className="showcase-caption">PLAY <span>·</span> MANAGE <span>·</span> GROW</div>
          </div>
        </section>
        <aside className="developer-banner" id="contact">
          <span className="developer-spark" aria-hidden="true">✦</span>
          <span><b>Powered &amp; Developed by Mohamed Osman</b><small>Contact for support &amp; custom setup</small></span>
          <a href="tel:+251940867287"><span aria-hidden="true">| </span>Call +251 940 867 287 <span aria-hidden="true">↗</span></a>
        </aside>
        <section className="public-booking-section" id="book-station">
          <div className="public-section-heading" id="stations"><div><span className="eyebrow">YOUR NEXT SESSION</span><h2>Book your next play.</h2><p>Choose a shop, console, time, and duration. Availability is checked again when you submit.</p></div><span className="booking-section-tag"><i /> {available.length ? `${available.length} stations available` : 'Check back soon'}</span></div>
          <div className="public-grid">
            <form className="panel public-booking-card" onSubmit={submit}>
              <div className="booking-form-heading"><span className="booking-icon">⌁</span><div><span className="eyebrow">REMOTE RESERVATION</span><h3>Book a station</h3></div></div>
              <div className="form-grid">
                <label>Shop<select value={form.shopId} onChange={(event) => setForm({ ...form, shopId: event.target.value, stationId: '', date: '', time: '' })} required><option value="">Select a shop</option>{shops.map((shop) => <option key={shop._id} value={shop._id}>{shop.name}</option>)}</select></label>
                <label>Full name<input autoComplete="name" value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} placeholder="Your name" required /></label>
                <label>Phone number<input type="tel" autoComplete="tel" inputMode="tel" pattern="\+?[0-9 ]{7,18}" placeholder="+251 9..." value={form.phone} onChange={(event) => { if (/^[0-9+ ]*$/.test(event.target.value)) setForm({ ...form, phone: event.target.value }) }} required /></label>
                <label>Email (optional)<input type="email" autoComplete="email" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} placeholder="For booking updates" /></label>
                <label>PlayStation type<select value={selectedType} onChange={(event) => setForm({ ...form, consoleType: event.target.value, stationId: '' })} required><option value="">Select type</option>{[...new Set(stations.map((station) => station.type))].map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
                <label>Station<select value={form.stationId} onChange={(event) => setForm({ ...form, stationId: event.target.value })} required disabled={!typedAvailable.length || loadingStations}><option value="">Select an available station</option>{stations.filter((station) => station.type === selectedType).map((station) => <option value={station._id} key={station._id} disabled={!station.isAvailable}>{station.name} · {station.isAvailable ? 'Available' : station.status === 'maintenance' ? 'Maintenance' : 'Booked'}</option>)}</select></label>
                <label>Date<input type="date" min={dateForTimeZone(bookingSettings?.timeZone)} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, stationId: '' })} required /></label>
                <label>Start time<input type="time" min={bookingSettings?.openTime} max={bookingSettings?.closeTime} step={Number(bookingSettings?.slotIntervalMinutes || 30) * 60} value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value, stationId: '' })} required /></label>
                <label>Duration<select value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value), stationId: '' })} required>{(bookingSettings?.durationOptionsMinutes || []).map((minutes) => <option key={minutes} value={minutes}>{minutes >= 60 ? `${minutes / 60} hr${minutes === 60 ? '' : 's'}` : `${minutes} min`}</option>)}</select></label>
                <label className="wide">Notes (optional)<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength="1000" placeholder="Anything the shop should know?" /></label>
              </div>
              <div className="booking-estimate"><span>Estimated total <small>{hourlyRate.toFixed(2)} / hour · payable at the shop</small></span><strong>{formatBirr(estimate)}</strong></div>
              {bookingSettings && <small className="booking-form-note">Shop hours {bookingSettings.openTime}–{bookingSettings.closeTime} · times are shown in the shop's local time zone.</small>}
              {error && <small className="form-error" role="alert">{error}</small>}
              {emailWarning && <small className="form-error" role="status">{emailWarning}</small>}
              <button className="button button-primary full-button booking-submit" type="submit" disabled={!selectedStation || submitting || loadingStations}>{submitting ? <><span className="spinner" /> Sending request...</> : <>Request a booking <span aria-hidden="true">→</span></>}</button>
              <small className="booking-form-note">Your request is pending until the shop team confirms it.</small>
            </form>
            <aside className="panel public-status-card">
              <div className="booking-form-heading" id="live-sessions"><span className="booking-icon booking-icon-cyan">◷</span><div><span className="eyebrow">LIVE FROM THE FLOOR</span><h3>{confirmation ? 'Your request' : 'Live floor plan'}</h3></div></div>
              {confirmation ? <div className="confirmation-card"><span className="confirmation-check">✓</span><h2>Request received</h2><strong>{confirmation.confirmation}</strong><p>{statusMessage}</p><small>{confirmation.durationMinutes} minutes · {formatBirr(confirmation.totalPrice)} estimated · {confirmation.paymentStatus}</small><b className="booking-result reserved">Pending shop confirmation</b></div> : <p className="availability-intro">{shops.length ? 'Select a shop, date, and time to see its station availability.' : 'No shops are currently accepting reservations.'}</p>}
              <div className="availability-list">{stations.length ? stations.map((station) => <div key={station._id}><span><i className={`availability-dot ${station.isAvailable ? 'available' : station.status}`} />{station.name}<small>{station.type}</small></span><b className={`status-pill ${station.isAvailable ? 'available' : station.status === 'maintenance' ? 'maintenance' : 'reserved'}`}>{station.isAvailable ? 'Available' : station.status === 'maintenance' ? 'Maintenance' : 'Booked'}</b></div>) : <div className="availability-empty">{loadingStations ? 'Checking availability…' : 'Select a shop with configured gaming stations.'}</div>}</div>
            </aside>
          </div>
        </section>
        <section className="public-owner-cta" aria-label="Create a shop account">
          <span className="owner-cta-icon" aria-hidden="true"><BrandMark /></span>
          <div>
            <span className="eyebrow">BUILT FOR GAME ZONE OWNERS</span>
            <h2>Want to manage your own PlayStation lounge?</h2>
            <p>Create your shop and bring stations, sessions, sales, and reports together.</p>
          </div>
          <button className="button button-primary public-owner-button" type="button" onClick={() => setRoute('register')}>Create your shop now <span aria-hidden="true">→</span></button>
        </section>
        <footer className="public-footer"><span>© 2026 PLAYSTATION GAME ZONE <i /> Built by Mohamed Osman · <a href="tel:+251940867287">+251 940 867 287</a></span><span>Customer booking portal</span></footer>
      </div>
      {showStaffLogin && <StaffLoginModal onClose={() => setShowStaffLogin(false)} />}
    </main>
  )
}

function StaffLoginModal({ onClose }) {
  const { login, lockoutUntil, setRoute } = useApp()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(0)
  const [loggingIn, setLoggingIn] = useState(false)

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil(((lockoutUntil || 0) - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [lockoutUntil])

  const submit = async (event) => {
    event.preventDefault()
    if (remaining > 0 || loggingIn) return
    setError('')
    setLoggingIn(true)
    try {
      const result = await login(form.email.trim(), form.password)
      if (!result.ok) {
        setError(result.remainingSeconds ? `Account locked for ${result.remainingSeconds} seconds.` : (result.message || 'Invalid email or PIN.'))
        return
      }
      setRoute(result.licenseRequired ? 'license' : 'dashboard')
    } finally {
      setLoggingIn(false)
    }
  }

  return <div className="staff-login-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="lock-card staff-login-modal" onSubmit={submit}><button className="modal-close staff-login-close" type="button" onClick={onClose} aria-label="Close staff login">×</button><BrandMark /><span className="eyebrow">Secure staff access</span><h1>Staff<br /><span>Portal</span></h1><p>Sign in to your game zone operations center.</p><label className="login-label">Email address<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Enter your email address" required /></label><label className="login-label">Password or 6-digit PIN<input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password or PIN" required /></label>{remaining > 0 && <small className="form-error">Locked out for {remaining} seconds.</small>}{error && <small className="form-error" role="alert">{error}</small>}<button className="button button-primary" type="submit" disabled={remaining > 0 || loggingIn}>{loggingIn ? <><span className="spinner" /> Signing in...</> : 'Sign in'}</button><small className="login-hint">If you cannot sign in, contact your administrator.</small></form></div>
}

function LoginScreen() {
  const { login, lockoutUntil, setRoute } = useApp()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(0)
  const [loggingIn, setLoggingIn] = useState(false)
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil(((lockoutUntil || 0) - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [lockoutUntil])
  const submit = async (event) => {
    event.preventDefault()
    setLoggingIn(true)
    try {
      const result = await login(form.email.trim(), form.password)
      if (!result.ok) {
        setError(result.remainingSeconds ? `Account locked for ${result.remainingSeconds} seconds.` : (result.message || 'Invalid email or PIN.'))
      } else {
        setRoute(result.licenseRequired ? 'license' : 'dashboard')
      }
    } finally {
      setLoggingIn(false)
    }
  }
  return (
    <main className="lock-screen">
      <form className="lock-card login-card" onSubmit={submit}>
        <BrandMark />
        <span className="eyebrow">Secure staff access</span>
        <h1>PlayStation<br /><span>Game Zone</span></h1>
        <p>Sign in to the local operations center.</p>
        <label className="login-label">
          Email address
          <input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Enter your email address" required />
        </label>
        <label className="login-label">
          Password or 6-digit PIN
          <input autoComplete="current-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password or PIN" required />
        </label>
        {remaining > 0 && <small className="form-error">Locked out for {remaining} seconds.</small>}
        {error && <small className="form-error">{error}</small>}
        <button className="button button-primary" type="submit" disabled={remaining > 0 || loggingIn}>{loggingIn ? <><span className="spinner" /> Signing in...</> : 'Sign in'}</button>
        <a className="public-link" href="#booking" onClick={(event) => { event.preventDefault(); setRoute('booking') }}>Customer booking portal →</a>
        <a className="public-link" href="#register" onClick={(event) => { event.preventDefault(); setRoute('register') }}>Create a new shop →</a>
        <small className="login-hint">For access or credential resets, contact your administrator.</small>
      </form>
    </main>
  )
}

function LicenseNotice({ onLogout, onRenewed }) {
  return (
    <main className="onboarding-shell license-renewal-page">
      <div className="license-renewal-content">
        <section className="panel onboarding-card payment-notice">
          <span className="eyebrow">Subscription renewal required</span>
          <h1>Your license has expired</h1>
          <p>Renew your subscription below. Access will be restored after your payment is verified by the platform administrator.</p>
          <button className="button button-secondary" type="button" onClick={onLogout}>Sign out</button>
        </section>
        <SubscriptionPayments onRenewed={onRenewed} />
      </div>
    </main>
  )
}

function AppShell() {
  const { route, authenticated, locked, lockApp, setRoute, notifications, clearNotifications, user, role, logout } = useApp()
  const displayRole = role === 'Owner/Admin' ? 'Admin' : role === 'Cashier/Staff' ? 'Cashier' : role || 'Staff'
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [theme, setTheme] = useState(() => window.localStorage.getItem('game-zone-theme') === 'light' ? 'light' : 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('game-zone-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2f5f8' : '#0b0f17')
  }, [theme])

  useEffect(() => {
    const showLicenseNotice = () => setRoute('license')
    window.addEventListener('license-required', showLicenseNotice)
    return () => window.removeEventListener('license-required', showLicenseNotice)
  }, [setRoute])

  useEffect(() => {
    let timer
    const resetTimer = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(lockApp, 15 * 60 * 1000)
    }
    window.addEventListener('mousemove', resetTimer)
    window.addEventListener('keydown', resetTimer)
    resetTimer()
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousemove', resetTimer)
      window.removeEventListener('keydown', resetTimer)
    }
  }, [lockApp])

  if (route === 'register') return <Register />
  if (route === 'super-admin') return <SuperAdminDashboard />
  if (!authenticated) return <Login />
  if (route === 'login') return <Login />
  if (route === 'license') return <LicenseNotice onLogout={() => { logout(); setRoute('login') }} onRenewed={() => setRoute('dashboard')} />
  if (locked) {
    return (
      <main className="lock-screen">
        <div className="lock-card">
          <BrandMark />
          <span className="eyebrow">Session locked</span>
          <h1>PlayStation<br /><span>Game Zone</span></h1>
          <p>Your workstation was locked after a period of inactivity.</p>
          <button className="button button-primary" type="button" onClick={logout}>Sign out and sign in again</button>
        </div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <Navbar />
      <header className="topbar">
        <div>
          {route !== 'dashboard' && <button className="app-back-button" type="button" onClick={() => setRoute('dashboard')} aria-label="Back to dashboard" title="Back to dashboard">←</button>}
          <span className="eyebrow">Operations center</span>
          <h1>Good evening, {user.split(' ')[0]}</h1>
        </div>
        <div className="topbar-actions">
          <PwaInstallButton />
          <span className="live-indicator"><i /> Live sync</span>
          {role === 'Owner/Admin' && <button className="button button-secondary settings-shortcut" type="button" aria-current={route === 'settings' ? 'page' : undefined} onClick={() => setRoute('settings')}><span aria-hidden="true">⚙</span> Settings</button>}
          <button className="button button-secondary theme-toggle" type="button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
          <div className="notification-menu">
            <button className="icon-button" type="button" aria-label="Notifications" onClick={() => setShowNotifications(!showNotifications)}>♢{notifications.length > 0 && <b>{notifications.length}</b>}</button>
            {showNotifications && (
              <div className="notification-dropdown">
                <div className="notification-head"><strong>Notifications</strong><button type="button" onClick={clearNotifications}>Clear all</button></div>
                {notifications.length === 0 ? <p className="empty-notifications">You are all caught up.</p> : notifications.map((notification) => (
                  <div className="notification-item" key={notification.id}>
                    <i className={`activity-dot ${notification.tone}`} />
                    <span><strong>{notification.title}</strong><small>{notification.detail}</small></span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="user-menu">
            <button className="user-button" type="button" onClick={() => setShowUserMenu(!showUserMenu)}>
              <span className="avatar" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M9.1 12.2 6.4 10c-1-.8-2.3-.3-2.6.9L2.5 17c-.3 1.2.5 2.4 1.8 2.6l5.4.8 1.5 2.4c.5.8 1.3 1.2 2.2 1.2h5.2c.9 0 1.7-.4 2.2-1.2l1.5-2.4 5.4-.8c1.3-.2 2.1-1.4 1.8-2.6l-1.3-6.1c-.3-1.2-1.6-1.7-2.6-.9l-2.7 2.2c-1.1-.7-2.5-1.1-4-1.1h-6c-1.5 0-2.9.4-4 1.1Z" /><path d="M10 16h.1m-2.1 2.1h.1m13.8-2.1h.1m2.1 2.1h.1M15 16h2" /></svg></span>
              <span><strong>{user}</strong><small>{displayRole}</small></span>
              <span>⌄</span>
            </button>
            {showUserMenu && (
              <div className="user-dropdown">
                <button type="button" onClick={() => { setRoute('settings'); setShowUserMenu(false) }}>Settings</button>
                <button type="button" onClick={lockApp}>Lock screen</button>
                <button type="button" onClick={logout}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <RouterView theme={theme} onThemeChange={setTheme} />
    </div>
  )
}

function App() {
  return <AppProvider><AppShell /></AppProvider>
}

export default App