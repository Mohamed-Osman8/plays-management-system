import { useEffect, useState } from 'react'
import { AppProvider } from './context/AppContext'
import { useApp } from './context/useApp'
import Dashboard from './pages/Home'
import Navbar from './components/Navbar'
import BrandMark from './components/BrandMark'
import PwaInstallButton from './components/PwaInstallButton'
import Login from './pages/Login'
import Register from './pages/Register'
import SuperAdmin from './pages/SuperAdmin'
import DemoMode from './pages/DemoMode'
import './App.css'
import './theme.css'

function RouterView() {
  const { route } = useApp()
  const pages = {
    dashboard: Dashboard,
  }
  const Page = pages[route] || Dashboard
  return <Page />
}

function createBookingConfirmation() {
  return `PGZ-${Date.now().toString().slice(-6)}`
}

function PublicPortal() {
  const { stations, remoteReservations, addRemoteReservation, setRoute } = useApp()
  const available = stations.filter((station) => station.status === 'available')
  const [showStaffLogin, setShowStaffLogin] = useState(false)
  const [form, setForm] = useState({ customer: '', phone: '', consoleType: 'PlayStation 4', stationId: available[0]?.id || '', date: '', time: '' })
  const [confirmation, setConfirmation] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const currentBooking = confirmation && remoteReservations.find((booking) => booking.confirmation === confirmation.confirmation)
  const submit = async (event) => {
    event.preventDefault()
    if (!/^\+?[0-9 ]{7,18}$/.test(form.phone)) return setError('Please enter a valid phone number using numbers only.')
    if (!selectedStationId || !form.date || !form.time) return setError('Select a station, date, and arrival time.')
    const booking = { ...form, consoleType: selectedConsoleType, stationId: selectedStationId, confirmation: createBookingConfirmation(), status: 'Pending approval', graceMinutes: 15 }
    setSubmitting(true)
    try {
      const savedBooking = await addRemoteReservation(booking)
      setConfirmation(savedBooking)
      setError('Booking request sent successfully!')
    } catch (submissionError) {
      setError(submissionError.message || 'Unable to send booking request.')
    } finally {
      setSubmitting(false)
    }
  }
  const selectedConsoleType = available.some((station) => station.type === form.consoleType)
    ? form.consoleType
    : available[0]?.type || form.consoleType
  const typedAvailable = available.filter((station) => station.type === selectedConsoleType)
  const selectedStationId = typedAvailable.some((station) => station.id === form.stationId)
    ? form.stationId
    : typedAvailable[0]?.id || ''
  const statusMessage = currentBooking?.status === 'Approved'
    ? 'Codsigaagii waa la aqbalay! Waxaad iman kartaa xarunta waqtigii loo asteeyay adigoo haysta 15-ka daqiiqo ee grace period ah si aad u bilowdo ciyaarta.'
    : currentBooking?.status === 'Rejected'
      ? 'Codsigaaga lama aqbalin waqtigan. Fadlan dooro waqti ama station kale.'
      : `${confirmation?.customer}, your request for ${confirmation?.stationId} on ${confirmation?.date} at ${confirmation?.time} is waiting for staff approval.`
  return (
    <main className="public-portal">
      <header className="public-header">
        <a className="sidebar-brand" href="#home" aria-label="Game Zone home">
          <BrandMark />
          <span>PLAYSTATION<br /><b>GAME ZONE</b></span>
        </a>
        <span className="public-header-actions">
          <PwaInstallButton />
          <button className="button button-secondary" type="button" onClick={() => setShowStaffLogin(true)}>Staff portal</button>
        </span>
      </header>
      <div className="public-content">
        <section className="public-showcase">
          <div className="public-showcase-copy">
            <span className="public-kicker"><i /> GAME ZONE MANAGEMENT, MADE SIMPLE</span>
            <h1>Your game zone.<br /><span>Running at full play.</span></h1>
            <p>Keep every station, session and sale in sync. A smarter way to run your PlayStation business, from any screen.</p>
            <div className="public-hero-actions">
              <button className="button button-primary" type="button" onClick={() => setRoute('demo')}>Explore the live demo <span aria-hidden="true">↗</span></button>
              <button className="public-book-link" type="button" onClick={() => document.getElementById('book-station')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Book a station <span aria-hidden="true">↓</span></button>
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
            <div className="showcase-console"><BrandMark /></div>
            <div className="showcase-float showcase-live"><i /><span><b>LIVE FLOOR PLAN</b><small>Everything in control</small></span><span className="showcase-arrow">↗</span></div>
            <div className="showcase-float showcase-stations"><span className="showcase-station-icon">▣</span><span><b>{available.length} stations ready</b><small>Real-time availability</small></span></div>
            <div className="showcase-caption">PLAY <span>·</span> MANAGE <span>·</span> GROW</div>
          </div>
        </section>
        <section className="public-booking-section" id="book-station">
          <div className="public-section-heading"><div><span className="eyebrow">YOUR NEXT SESSION</span><h2>Save your spot.</h2><p>Send a booking request and our team will confirm it.</p></div><span className="booking-section-tag"><i /> {available.length ? 'Stations available' : 'Check back soon'}</span></div>
          <div className="public-grid">
            <form className="panel public-booking-card" onSubmit={submit}>
              <div className="booking-form-heading"><span className="booking-icon">⌁</span><div><span className="eyebrow">REMOTE RESERVATION</span><h3>Book a station</h3></div></div>
              <div className="form-grid">
                <label>Full name<input autoComplete="name" value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} placeholder="Your name" required /></label>
                <label>Phone number<input type="tel" autoComplete="tel" inputMode="tel" pattern="\+?[0-9 ]{7,18}" placeholder="+251 9..." value={form.phone} onChange={(event) => { if (/^[0-9+ ]*$/.test(event.target.value)) setForm({ ...form, phone: event.target.value }) }} required /></label>
                <label>Console<select value={selectedConsoleType} onChange={(event) => { const consoleType = event.target.value; setForm({ ...form, consoleType, stationId: available.find((station) => station.type === consoleType)?.id || '' }) }}><option>PlayStation 4</option><option>PlayStation 5</option></select></label>
                <label>Station<select value={selectedStationId} onChange={(event) => setForm({ ...form, stationId: event.target.value })} required>{typedAvailable.length ? typedAvailable.map((station) => <option value={station.id} key={station.id}>{station.name}</option>) : <option value="">No {selectedConsoleType} stations available</option>}</select></label>
                <label>Date<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
                <label>Arrival time<input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required /></label>
              </div>
              {error && <small className={error.includes('successfully') ? 'form-success' : 'form-error'} role="status">{error}</small>}
              <button className="button button-primary full-button booking-submit" type="submit" disabled={!typedAvailable.length || submitting}>{submitting ? <><span className="spinner" /> Sending request...</> : <>Request a booking <span aria-hidden="true">→</span></>}</button>
              <small className="booking-form-note">Your request is confirmed by the game zone team.</small>
            </form>
            <aside className="panel public-status-card">
              <div className="booking-form-heading"><span className="booking-icon booking-icon-cyan">◷</span><div><span className="eyebrow">LIVE FROM THE FLOOR</span><h3>{confirmation ? 'Your request' : 'Station availability'}</h3></div></div>
              {confirmation ? <div className="confirmation-card"><span className="confirmation-check">✓</span><h2>Request received</h2><strong>{confirmation.confirmation}</strong><p className={currentBooking?.status === 'Approved' ? 'acceptance-message' : ''}>{statusMessage}</p><small>Grace period: {confirmation.graceMinutes} minutes after approval.</small>{currentBooking && currentBooking.status !== 'Pending approval' && <b className={`booking-result ${currentBooking.status === 'Approved' ? 'approved' : 'rejected'}`}>{currentBooking.status === 'Approved' ? 'Approved / Confirmed' : currentBooking.status}</b>}</div> : <p className="availability-intro">Pick an available console and send a request. We’ll confirm your spot shortly.</p>}
              <div className="availability-list">{stations.length ? stations.map((station) => <div key={station.id}><span><i className={`availability-dot ${station.status}`} />{station.name}<small>{station.type}</small></span><b className={`status-pill ${station.status}`}>{station.status === 'available' ? 'Available' : station.status === 'playing' ? 'In use' : station.status}</b></div>) : <div className="availability-empty">Stations will appear here when the floor is online.</div>}</div>
            </aside>
          </div>
        </section>
        <footer className="public-footer"><span>© 2026 PLAYSTATION GAME ZONE</span><span><button className="text-button" type="button" onClick={() => setRoute('super-admin')}>Platform administration</button><i /> Customer booking portal</span></footer>
      </div>
      {showStaffLogin && <StaffLoginModal onClose={() => setShowStaffLogin(false)} />}
    </main>
  )
}

function StaffLoginModal({ onClose }) {
  const { login, lockoutUntil, setRoute } = useApp()
  const [form, setForm] = useState({ username: '', password: '' })
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
      const result = await login(form.username.trim(), form.password)
      if (!result.ok) {
        setError(result.remainingSeconds ? `Account locked for ${result.remainingSeconds} seconds.` : (result.message || 'Invalid PIN or username.'))
        return
      }
      setRoute(result.licenseRequired ? 'license' : 'dashboard')
    } finally {
      setLoggingIn(false)
    }
  }

  return <div className="staff-login-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="lock-card staff-login-modal" onSubmit={submit}><button className="modal-close staff-login-close" type="button" onClick={onClose} aria-label="Close staff login">×</button><BrandMark /><span className="eyebrow">Secure staff access</span><h1>Staff<br /><span>Portal</span></h1><p>Sign in to your game zone operations center.</p><label className="login-label">Admin phone or username<input autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Enter your phone or username" required /></label><label className="login-label">Password or 6-digit PIN<input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password or PIN" required /></label>{remaining > 0 && <small className="form-error">Locked out for {remaining} seconds.</small>}{error && <small className="form-error" role="alert">{error}</small>}<button className="button button-primary" type="submit" disabled={remaining > 0 || loggingIn}>{loggingIn ? <><span className="spinner" /> Signing in...</> : 'Sign in'}</button><small className="login-hint">If you cannot sign in, contact your administrator.</small></form></div>
}

function LoginScreen() {
  const { login, lockoutUntil, setRoute } = useApp()
  const [form, setForm] = useState({ username: '', password: '' })
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
      const result = await login(form.username.trim(), form.password)
      if (!result.ok) {
        setError(result.remainingSeconds ? `Account locked for ${result.remainingSeconds} seconds.` : (result.message || 'Invalid PIN or username.'))
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
          Admin phone or username
          <input autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Enter your phone or username" required />
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

function LicenseNotice({ onLogout }) {
  return (
    <main className="onboarding-shell">
      <section className="panel onboarding-card payment-notice">
        <span className="eyebrow">Subscription renewal required</span>
        <h1>Your license has expired</h1>
        <p>Please contact the platform administrator to renew. Include your shop name and registered phone number with your payment for manual verification.</p>
        <div className="payment-details">
          <strong>Telebirr</strong><span>0940867287</span>
          <strong>CBE</strong><span>1000278200427</span>
          <strong>Account name</strong><span>Mohamed Osman Buh</span>
        </div>
        <button className="button button-secondary" type="button" onClick={onLogout}>Sign out</button>
      </section>
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2f5f8' : '#090d12')
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
  if (route === 'login') return <Login />
  if (route === 'super-admin') return <SuperAdmin />
  if (route === 'demo') return <DemoMode />
  if (route === 'license') return <LicenseNotice onLogout={() => { logout(); setRoute('login') }} />
  if (route === 'home' || route === '' || route === 'booking' || route === 'public') return <PublicPortal />
  if (route === 'staff' && !authenticated) return <LoginScreen />
  if (!authenticated) return <LoginScreen />
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
      <RouterView />
    </div>
  )
}

function App() {
  return <AppProvider><AppShell /></AppProvider>
}

export default App