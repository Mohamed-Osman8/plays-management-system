import { useEffect, useState } from 'react'
import { useApp } from '../context/useApp'
import { cancelStationSession, createMembership, createProduct, createSale, createStation, deleteProduct, deleteStation, getFinancialReports, getSessions, listMemberships, listProducts, pauseStationSession, recordMembershipPayment, reverseStationSession, resumeStationSession, stopStationSession, updateMembership, updateProduct, updateStationStatus } from '../services/api'
import { formatBirr } from '../utils/currency'
import { getProductImage } from '../utils/productImage'
import { printReceipt } from '../utils/receipt'
import BrandMark from '../components/BrandMark'
import SubscriptionPayments from '../components/SubscriptionPayments'

const navItems = [['dashboard', '▦', 'Dashboard'], ['sessions', '◷', 'Sessions'], ['stations', '▣', 'Stations'], ['reservations', '▣', 'Reservations'], ['pos', '⊞', 'POS & Sales'], ['inventory', '◈', 'Inventory'], ['expenses', '↘', 'Expenses'], ['reports', '▤', 'Reports'], ['settings', '⚙', 'Settings']]

function StatCard({ label, value, note, tone = 'lime' }) { return <div className={`stat-card stat-${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div> }

function groupCartItems(cart) {
  return cart.reduce((groups, item, index) => {
    const id = String(item._id || item.id || `${item.name}-${item.price}`)
    const key = `${id}:${Number(item.price)}`
    const group = groups.find((entry) => entry.key === key)
    if (group) {
      group.quantity += 1
      group.indexes.push(index)
    } else {
      groups.push({ ...item, key, quantity: 1, indexes: [index] })
    }
    return groups
  }, [])
}

function getStationOccupancy(stations) {
  const operational = stations.filter((station) => station.status !== 'maintenance').length
  const occupied = stations.filter((station) => station.status === 'playing').length
  return {
    occupied,
    operational,
    percent: operational ? Math.round(occupied / operational * 100) : 0
  }
}

function Modal({ title, eyebrow, onClose, children }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal panel" role="dialog" aria-modal="true"><div className="modal-heading"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><button className="modal-back" type="button" onClick={onClose} aria-label="Go back without changing session" title="Go back">←</button></div>{children}</div></div>
}

function StationDetailsModal({ station, onClose, onAction, onStatusChange }) {
  const { startSession } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const value = (item) => item || '—'
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])
  const paused = station.session?.paused
  const status = paused ? 'Paused' : station.status === 'playing' ? 'In use' : station.status === 'available' ? 'Free' : station.status === 'maintenance' ? 'Maintenance' : 'Reserved'
  const session = station.session
  const elapsedSeconds = session?.startedAt
    ? Math.max(0, Math.floor((now - new Date(session.startedAt).getTime() - Number(session.pausedDurationMs || 0) - (session.pausedAt ? now - new Date(session.pausedAt).getTime() : 0)) / 1000))
    : Number(session?.elapsedSeconds || 0)
  const elapsed = `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`
  const amount = session?.startedAt
    ? formatBirr(elapsedSeconds / 60 * Number(session.ratePerMinute ?? (Number(station.hourlyRate || 0) / 60)))
    : value(session?.amount)
  const start = async () => {
    setBusy(true)
    setError('')
    try {
      await startSession(station.id, station.status === 'reserved' ? 'Fixed' : 'Open')
      onClose()
    } catch (startError) {
      setError(startError.message || 'Unable to start this station session.')
    } finally {
      setBusy(false)
    }
  }
  const updateStatus = async (nextStatus) => {
    setBusy(true)
    setError('')
    try {
      await onStatusChange(station, nextStatus)
      onClose()
    } catch (statusError) {
      setError(statusError.message || 'Unable to update station status.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={station.name} eyebrow="Station details · go back without cancelling" onClose={onClose}>
      <div className="station-detail-console">
        <div className={`station-screen station-detail-screen station-${paused ? 'paused' : station.status}`}>
          <span className="station-type">{station.type}</span>
          <strong>{station.session?.customer || station.reservation?.customer || station.name}</strong>
          <small>{session ? `${elapsed} · ${amount}` : status}</small>
        </div>
      </div>
      <dl className="station-detail-list">
          <div><dt>Station ID</dt><dd>{station.id}</dd></div>
          <div><dt>Station</dt><dd>{station.name}</dd></div>
        <div><dt>Console</dt><dd>{station.type}</dd></div>
        <div><dt>Status</dt><dd className={`status-pill ${paused ? 'paused' : station.status}`}>{status}</dd></div>
        <div><dt>Hourly rate</dt><dd>{formatBirr(Number(station.hourlyRate || 0))}</dd></div>
        <div><dt>Player / reservation</dt><dd>{value(station.session?.customer || station.reservation?.customer)}</dd></div>
        <div><dt>Player phone</dt><dd>{value(session?.customerPhone)}</dd></div>
        <div><dt>Session type</dt><dd>{value(station.session?.type)}</dd></div>
        <div><dt>Started</dt><dd>{station.session?.startedAt ? new Date(station.session.startedAt).toLocaleString() : '—'}</dd></div>
        <div><dt>Playing time</dt><dd>{session ? elapsed : '—'}</dd></div>
        <div><dt>Current charge</dt><dd>{session ? amount : '—'}</dd></div>
        <div><dt>Payment method</dt><dd>{value(session?.paymentMethod)}</dd></div>
        <div><dt>Session note</dt><dd>{value(session?.reason)}</dd></div>
        <div><dt>Maintenance note</dt><dd>{station.status === 'maintenance' ? value(station.reason) : '—'}</dd></div>
        <div><dt>Console health</dt><dd>{value(station.hardware?.console)}</dd></div>
        <div><dt>Controller health</dt><dd>{value(station.hardware?.controller)}</dd></div>
      </dl>
      {error && <small className="form-error" role="alert">{error}</small>}
      <div className="modal-actions station-detail-actions">
        {['available', 'reserved'].includes(station.status) && <button className="button button-primary" type="button" disabled={busy} onClick={start}>{busy ? 'Starting…' : 'Start session'}</button>}
        {station.status === 'playing' && <button className="button button-secondary" type="button" disabled={busy} onClick={() => onAction('pause', station)}>{paused ? 'Resume' : 'Pause'}</button>}
        {station.status === 'playing' && <button className="button button-secondary" type="button" disabled={busy} onClick={() => onAction('transfer', station)}>Change station</button>}
        {station.status === 'playing' && <button className="button button-danger" type="button" disabled={busy} onClick={() => onAction('end', station)}>End & bill</button>}
        {station.status === 'playing' && <button className="button button-secondary" type="button" disabled={busy} onClick={() => onAction('cancel', station)}>Cancel session</button>}
        {onStatusChange && station.status === 'available' && <button className="button button-secondary" type="button" disabled={busy} onClick={() => updateStatus('reserved')}>Reserve</button>}
        {onStatusChange && station.status !== 'playing' && station.status !== 'maintenance' && <button className="button button-secondary" type="button" disabled={busy} onClick={() => updateStatus('maintenance')}>Maintenance</button>}
        {onStatusChange && station.status !== 'playing' && station.status !== 'available' && <button className="button button-secondary" type="button" disabled={busy} onClick={() => updateStatus('available')}>Set available</button>}
      </div>
    </Modal>
  )
}

function SessionModal({ station, kind, onClose }) {
  const { stations, transferSession, extendSession, pauseSession, cancelSession, reopenSession, endSession, reverseSession } = useApp()
  const [target, setTarget] = useState(stations.find((item) => item.status === 'available')?.id || '')
  const [minutes, setMinutes] = useState(kind === 'reopen' ? 30 : 60)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [submitting, setSubmitting] = useState(false)
  const available = stations.filter((item) => item.status === 'available')
  const submit = async (event) => {
    event.preventDefault()
    if (kind === 'transfer' && !target) {
      setError('There are no free stations to transfer this session to.')
      return
    }
    if (kind === 'cancel' && !reason.trim()) {
      setError('A reason is required to cancel a session.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      if (kind === 'transfer') await transferSession(station.id, target, station.session)
      if (kind === 'extend') extendSession(station.id, minutes)
      if (kind === 'pause') await pauseSession(station.id, !station.session.paused, reason)
      if (kind === 'cancel') await cancelSession(station.id, reason)
      if (kind === 'reopen') reopenSession(station.id, station.session, minutes)
      if (kind === 'end') await endSession(station.id, '', paymentMethod)
      if (kind === 'reverse') await reverseSession(station.id, reason)
      onClose()
    } catch (actionError) {
      setError(actionError.message || 'Unable to complete the session action.')
    } finally {
      setSubmitting(false)
    }
  }
  const labels = { transfer: ['Change station', 'Move the player to a free console. Session time and billing continue.'], extend: ['Extend fixed session', 'Add time before the countdown expires.'], pause: [station.session?.paused ? 'Resume session' : 'Pause session', 'Change the session state.'], cancel: ['Cancel session', 'Cancellation requires a reason and is added to the audit log.'], reopen: ['Reopen expired session', 'Reopen within the display grace window.'], end: ['End session', 'Review the session and close it for billing.'], reverse: ['Reverse payment', 'Reverse a completed session.'] }
  return <Modal title={labels[kind][0]} eyebrow={labels[kind][1]} onClose={onClose}><form className="modal-form" onSubmit={submit}>{kind === 'transfer' && <label>Free destination station<select value={target} onChange={(event) => setTarget(event.target.value)} required disabled={!available.length}>{available.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.type}</option>)}</select>{!available.length && <small className="form-error">No free stations are available right now.</small>}</label>}{['extend', 'reopen'].includes(kind) && <label>{kind === 'extend' ? 'Additional minutes' : 'Reopen for minutes'}<input type="number" min="1" max="240" value={minutes} onChange={(event) => setMinutes(event.target.value)} required /></label>}{kind === 'cancel' && <label>Cancellation reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} required placeholder="Enter why this session is being cancelled..." /></label>}{kind === 'end' && <label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank">Bank</option><option value="membership">Membership</option><option value="other">Other</option></select></label>}{error && <small className="form-error" role="alert">{error}</small>}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={submitting}>← Back</button><button className="button button-primary" type="submit" disabled={submitting || (kind === 'transfer' && !available.length)}>{submitting ? 'Saving…' : kind === 'cancel' ? 'Cancel session' : kind === 'transfer' ? 'Transfer now' : kind === 'pause' && station.session?.paused ? 'Resume session' : kind === 'pause' ? 'Pause session' : kind === 'end' ? 'End & bill' : kind === 'reverse' ? 'Reverse payment' : 'Confirm'}</button></div></form></Modal>
}

function StationCard({ station, onAction, onView, onStatusChange, onDelete }) {
  const { startSession } = useApp()
  const [now, setNow] = useState(() => Date.now())
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const isPaused = station.session?.paused
  const type = String(station.type || '').toUpperCase().replace('PLAYSTATION ', 'PS')
  const normalizedType = type === 'PS5' ? 'PlayStation 5' : 'PlayStation 4'
  const start = async (sessionType) => {
    setActionError('')
    setBusy(true)
    try {
      await startSession(station.id, sessionType)
    } catch (error) {
      setActionError(error.message || 'Unable to start session.')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (station.status !== 'playing' || station.session?.paused || !station.session?.startedAt) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [station.status, station.session?.paused, station.session?.startedAt])
  const elapsedSeconds = station.session?.startedAt
    ? Math.max(0, Math.floor((now - new Date(station.session.startedAt).getTime() - Number(station.session.pausedDurationMs || 0) - (station.session.pausedAt ? now - new Date(station.session.pausedAt).getTime() : 0)) / 1000))
    : Number(station.session?.elapsedSeconds || 0)
  const liveElapsed = elapsedSeconds ? `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}` : station.session?.elapsed
  const rate = Number(station.session?.ratePerMinute ?? (Number(station.hourlyRate || 0) / 60))
  const liveAmount = station.session?.startedAt ? `${formatBirr((elapsedSeconds / 60 * rate))}` : station.session?.amount
  const changeStatus = async (status) => {
    setBusy(true)
    setActionError('')
    try {
      await onStatusChange(station, status)
    } catch (error) {
      setActionError(error.message || 'Unable to update station status.')
    } finally {
      setBusy(false)
    }
  }
  const runDelete = async () => {
    setBusy(true)
    setActionError('')
    try {
      await onDelete(station)
    } catch (error) {
      setActionError(error.message || 'Unable to delete station.')
    } finally {
      setBusy(false)
    }
  }
  const statusClass = isPaused ? 'paused' : station.status
  const statusText = station.status === 'playing' ? (isPaused ? 'Paused' : 'In use') : station.status === 'available' ? 'Free' : station.status === 'maintenance' ? 'Maintenance' : 'Reserved'
  const openDetails = () => onView?.(station)
  return <article className={`station-card station-card-interactive station-${station.status} ${isPaused ? 'station-paused' : ''}`} aria-label={`${station.name}, ${statusText}`} tabIndex={0} onClick={(event) => { if (!event.target.closest('button')) openDetails() }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDetails() } }}>
    <div className="station-card-head"><span className="station-id">{station.name}</span><span className={`status-pill ${statusClass}`}>{statusText}</span></div>
    <div className="station-screen">
      <span className="station-type"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9.1 12.2 6.4 10c-1-.8-2.3-.3-2.6.9L2.5 17c-.3 1.2.5 2.4 1.8 2.6l5.4.8 1.5 2.4c.5.8 1.3 1.2 2.2 1.2h5.2c.9 0 1.7-.4 2.2-1.2l1.5-2.4 5.4-.8c1.3-.2 2.1-1.4 1.8-2.6l-1.3-6.1c-.3-1.2-1.6-1.7-2.6-.9l-2.7 2.2c-1.1-.7-2.5-1.1-4-1.1h-6c-1.5 0-2.9.4-4 1.1Z" /><path d="M10 16h.1m-2.1 2.1h.1m13.8-2.1h.1m2.1 2.1h.1M15 16h2" /></svg>Hardware: {normalizedType}</span>
      <strong>{station.status === 'playing' ? station.session?.customer : station.status === 'reserved' ? station.reservation?.customer || 'Reserved' : station.status === 'maintenance' ? 'Maintenance' : 'Ready to play'}</strong>
      <small>{station.status === 'playing' ? `${liveElapsed || '00:00:00'} · ${liveAmount || formatBirr(0)}` : station.status === 'maintenance' ? station.reason || 'Unavailable for service' : 'No active session'}</small>
    </div>
    <button className="station-details-trigger" type="button" onClick={openDetails} aria-label={`Show details for ${station.name}`}>Station information & live details <span>→</span></button>
    {actionError && <small className="form-error" role="alert">{actionError}</small>}
    <div className="station-actions station-management-actions">
      {station.status === 'available' && <><button type="button" className="button button-primary" disabled={busy} onClick={() => start('Open')}>Start</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('reserved')}>Reserve</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('maintenance')}>Maintenance</button></>}
      {station.status === 'reserved' && <><button type="button" className="button button-primary" disabled={busy} onClick={() => start('Fixed')}>Start</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('available')}>Available</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('maintenance')}>Maintenance</button></>}
      {station.status === 'maintenance' && <><button type="button" className="button button-primary" disabled={busy} onClick={() => changeStatus('available')}>Set available</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('reserved')}>Reserve</button></>}
      {station.status === 'playing' && <><button type="button" className="button button-secondary" disabled={busy} onClick={() => onAction('pause', station)}>{isPaused ? 'Resume' : 'Pause'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => onAction('transfer', station)}>Change station</button><button type="button" className="button button-danger" disabled={busy} onClick={() => onAction('end', station)}>End</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => onAction('cancel', station)}>Cancel</button></>}
      <button type="button" className="button button-danger" disabled={busy || station.status === 'playing'} onClick={runDelete}>Delete</button>
    </div>
  </article>
}

function DashboardContent() {
  const { stations, auditLog, bookingRequests, updateRemoteReservation, setRoute, role } = useApp()
  const [period, setPeriod] = useState('today')
  const [metrics, setMetrics] = useState({ report: null, products: [], loading: true, error: '' })

  useEffect(() => {
    let cancelled = false
    const end = new Date()
    const start = new Date(end)
    start.setUTCHours(0, 0, 0, 0)
    if (period === 'this-week') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
    if (period === 'this-month') start.setUTCDate(1)
    const filters = { period: 'custom', from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
    const refresh = async () => {
      try {
        const [report, productResult] = await Promise.all([getFinancialReports(filters), listProducts()])
        if (!cancelled) setMetrics({ report, products: productResult.products || [], loading: false, error: '' })
      } catch (error) {
        if (!cancelled) setMetrics((current) => ({ ...current, loading: false, error: error.message || 'Unable to load dashboard data from the server.' }))
      }
    }
    setMetrics((current) => ({ ...current, loading: true }))
    refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [period])

  const summary = metrics.report?.summary || {}
  const revenue = Number(summary.revenue || 0)
  const gamingRevenue = Number(summary.sessionRevenue || 0)
  const inventoryRevenue = Number(summary.inventorySales || 0)
  const membershipRevenue = Number(summary.membershipRevenue || 0)
  const { occupied: activeStations, operational: operationalStations, percent: occupiedPercent } = getStationOccupancy(stations)
  const lowStock = metrics.products.filter((product) => Number(product.stock) <= 5).length
  const buckets = (metrics.report?.buckets || []).slice(-7)
  const admin = role === 'Owner/Admin'
  const selectedLabel = period === 'today' ? 'Today' : period === 'this-week' ? 'This week' : 'This month'

  return <main className="workspace"><div className="page-toolbar"><div><p className="breadcrumb">Dashboard / Overview</p><h2>Station overview</h2></div><div className="toolbar-actions"><span className="occupancy-indicator" aria-label={`${activeStations} occupied of ${operationalStations} operational stations`}>OCCUPIED: {occupiedPercent}% <small>{activeStations}/{operationalStations}</small></span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="today">Today</option><option value="this-week">This week</option><option value="this-month">This month</option></select>{admin && <button className="button button-primary" type="button" onClick={() => setRoute('pos')}>+ New sale</button>}</div></div>
    {metrics.error && <div className="data-alert" role="alert">{metrics.error}</div>}
    <section className="stats-grid"><StatCard label={`${selectedLabel} revenue`} value={metrics.loading && !metrics.report ? 'Loading…' : `${formatBirr(revenue)}`} note="Completed sessions, sales, and memberships" /><StatCard label="Active stations" value={`${activeStations}/${stations.length}`} note="Live from station records" tone="cyan" /><StatCard label="Sessions completed" value={metrics.loading && !metrics.report ? 'Loading…' : Number(summary.completedSessions || 0).toLocaleString()} note={`${Number(summary.playedHours || 0).toFixed(2)} playing hours`} tone="purple" /><StatCard label="Low stock items" value={metrics.loading && !metrics.report ? 'Loading…' : lowStock.toLocaleString()} note="Products at 5 units or below" tone="orange" /></section>
    {bookingRequests.some((request) => request.status === 'Pending approval') && <section className="panel incoming-bookings"><div className="panel-heading"><div><span className="eyebrow">Customer portal</span><h3>Incoming remote bookings</h3></div><button className="text-button" type="button" onClick={() => setRoute('remote-booking')}>View all →</button></div>{bookingRequests.filter((request) => request.status === 'Pending approval').map((request) => <div className="incoming-booking-row" key={request.confirmation}><span><strong>{request.customer}</strong><small>{request.phone} · {request.consoleType || request.stationId} · {request.date} at {request.time}</small></span><span><button className="button button-primary" type="button" onClick={() => updateRemoteReservation(request, 'Approved')}>Approve</button><button className="button button-danger" type="button" onClick={() => updateRemoteReservation(request, 'Rejected')}>Reject</button></span></div>)}</section>}
    <section className="dashboard-grid"><div className="panel stations-panel"><div className="panel-heading"><div><span className="eyebrow">Live floor plan</span><h3>Station status</h3></div><button className="button button-secondary" type="button" onClick={() => setRoute('stations')}>Open floor plan →</button></div><div className="station-overview-grid"><div><strong>{stations.length}</strong><span>Total stations</span></div><div><strong>{activeStations}</strong><span>Playing</span></div><div><strong>{stations.filter((station) => station.status === 'available').length}</strong><span>Available</span></div><div><strong>{stations.filter((station) => station.status === 'maintenance').length}</strong><span>Maintenance</span></div></div><p className="station-overview-note">View and control every station from the live floor plan.</p></div>
      <aside className="panel revenue-panel"><div className="panel-heading"><div><span className="eyebrow">Performance</span><h3>{selectedLabel} revenue & play time</h3></div></div><div className="revenue-total"><strong>{formatBirr(revenue)}</strong><small>Realized revenue from MongoDB</small></div><AnalyticsChart buckets={buckets} /><div className="revenue-legend"><span><i className="dot lime" />Gaming <b>{formatBirr(gamingRevenue)}</b></span><span><i className="dot cyan" />Inventory <b>{formatBirr(inventoryRevenue)}</b></span><span><i className="dot purple" />Memberships <b>{formatBirr(membershipRevenue)}</b></span></div></aside></section>
    <section className="lower-grid"><div className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">Current session</span><h3>Recent activity</h3></div></div>{auditLog.length ? <Activity entries={auditLog.slice(0, 5)} /> : <div className="empty-state">Activity from this staff session will appear here.</div>}</div><div className="panel quick-panel"><span className="eyebrow">Quick actions</span><h3>What do you need?</h3><button type="button" onClick={() => setRoute('stations')}>▣ Open station floor plan <span>→</span></button><button type="button" onClick={() => setRoute('reservations')}>▣ Create reservation <span>→</span></button>{admin && <button type="button" onClick={() => setRoute('inventory')}>◈ Manage inventory <span>→</span></button>}<button type="button" onClick={() => setRoute('pos')}>＋ New sale <span>→</span></button>{admin && <button type="button" onClick={() => setRoute('reports')}>▤ Open reports <span>→</span></button>}</div></section><footer className="page-footer">PLAYSTATION GAME ZONE MANAGEMENT SYSTEM <span>MongoDB live data · {selectedLabel}</span><small>© 2026 {metrics.report?.shopName || 'Game Zone'}</small></footer></main>
}

function Activity({ entries }) { return <div className="activity-list">{entries.map((entry) => <div className="activity-row" key={entry.id}><span className={`activity-dot ${entry.tone}`} /><small>{entry.time}</small><span><strong>{entry.user}</strong> {entry.action}</span><b>{entry.value}</b></div>)}</div> }

function ModulePage({ title, eyebrow, children }) { return <main className="workspace"><div className="page-toolbar"><div><p className="breadcrumb">Operations / {title}</p><h2>{title}</h2><p className="page-description">{eyebrow}</p></div></div>{children}</main> }

function Inventory({ initialProducts }) {
  const [products, setProducts] = useState(initialProducts)
  const [form, setForm] = useState({ name: '', category: 'Drinks', price: '', stock: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [saving, setSaving] = useState(false)
  const previewImage = getProductImage(form.name, form.category)

  useEffect(() => {
    listProducts().then((result) => setProducts(result.products || [])).catch(() => {})
  }, [])

  const save = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await createProduct({
        ...form,
        imageUrl: previewImage,
        price: Number(form.price),
        stock: form.stock === '' ? 0 : Number(form.stock)
      })
      setProducts((current) => [...current, result.product])
      setForm({ name: '', category: 'Drinks', price: '', stock: '' })
      setNotice('Product added successfully.')
    } catch (requestError) {
      setError(requestError.message || 'Unable to add product.')
    } finally {
      setSaving(false)
    }
  }

  const edit = async (event) => {
    event.preventDefault()
    if (!editingProduct || saving) return
    const { name, category, price, stock } = editingProduct
    setSaving(true)
    setError('')
    try {
      const updates = {
        name: name.trim(),
        category,
        imageUrl: getProductImage(name, category),
        price: Number(price)
      }
      if (stock !== '') updates.stock = Number(stock)
      const result = await updateProduct(editingProduct._id || editingProduct.id, updates)
      setProducts((current) => current.map((item) => (item._id || item.id) === (editingProduct._id || editingProduct.id) ? result.product : item))
      setEditingProduct(null)
      setNotice('Product updated successfully.')
    } catch (requestError) {
      setError(requestError.message || 'Unable to update product.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (product) => {
    if (!window.confirm(`Delete ${product.name}?`)) return
    try {
      await deleteProduct(product._id || product.id)
      setProducts((current) => current.filter((item) => (item._id || item.id) !== (product._id || product.id)))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return <ModulePage title="Inventory" eyebrow="Track products, stock levels, and point-of-sale items.">
    {notice && <small className="form-success" role="status">{notice}</small>}
    {error && !editingProduct && <small className="form-error" role="alert">{error}</small>}
    <form className="panel modal-form" onSubmit={save}>
      <h3>Add product</h3>
      <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
      <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Drinks</option><option>Food</option><option>Accessories</option><option>Other</option></select></label>
      <div className="product-image-preview"><img src={previewImage} alt={form.name ? `${form.name} preview` : 'Suggested product image'} onError={(event) => { event.currentTarget.hidden = true }} /><span>{form.name || 'Product image preview'}</span><small>Image selected automatically from the product name</small></div>
      <label>Price<input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label>
      <label>Stock (optional)<input type="number" min="0" step="1" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} placeholder="Defaults to 0" /></label>
      <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add product'}</button>
    </form>
    <div className="table-panel"><TableHeader columns={['Product', 'Category', 'In stock', 'Price', 'Status', 'Actions']} />
      {products.map((product) => <div className="table-row" key={product._id || product.id}><strong className="inventory-product"><img src={product.imageUrl || getProductImage(product.name, product.category)} alt="" onError={(event) => { event.currentTarget.hidden = true }} />{product.name}</strong><span>{product.category}</span><span>{product.stock} units</span><span>{formatBirr(Number(product.price))}</span><span className={`status-pill ${product.stock <= 5 ? 'maintenance' : 'available'}`}>{product.stock <= 5 ? 'Low stock' : 'In stock'}</span><span><button className="text-button" type="button" onClick={() => { setEditingProduct({ ...product, stock: String(product.stock ?? '') }); setError(''); setNotice('') }}>Edit</button><button className="text-button" type="button" onClick={() => remove(product)}>Delete</button></span></div>)}
    </div>
    {editingProduct && <Modal title="Edit product" eyebrow="Update inventory details" onClose={() => { if (!saving) { setEditingProduct(null); setError('') } }}>
      <form className="modal-form" onSubmit={edit}>
        <label>Name<input value={editingProduct.name} onChange={(event) => setEditingProduct({ ...editingProduct, name: event.target.value })} required disabled={saving} /></label>
        <label>Category<select value={editingProduct.category || 'Other'} onChange={(event) => setEditingProduct({ ...editingProduct, category: event.target.value })} disabled={saving}><option>Drinks</option><option>Food</option><option>Accessories</option><option>Other</option></select></label>
        <label>Price<input type="number" min="0" step="0.01" value={editingProduct.price} onChange={(event) => setEditingProduct({ ...editingProduct, price: event.target.value })} required disabled={saving} /></label>
        <label>Stock (optional)<input type="number" min="0" step="1" value={editingProduct.stock} onChange={(event) => setEditingProduct({ ...editingProduct, stock: event.target.value })} placeholder="Leave blank to keep current stock" disabled={saving} /></label>
        {error && <small className="form-error" role="alert">{error}</small>}
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={() => { setEditingProduct(null); setError('') }} disabled={saving}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>}
  </ModulePage>
}

function SessionManagement() {
  const { role } = useApp()
  const [sessions, setSessions] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const refresh = () => getSessions().then((result) => setSessions(result.sessions || []))
  useEffect(() => { refresh().catch((requestError) => setError(requestError.message || 'Unable to load sessions.')) }, [])
  const perform = async (session, action) => {
    setBusy(`${session._id}-${action}`)
    setError('')
    try {
      if (action === 'pause') await pauseStationSession(session._id, {})
      if (action === 'resume') await resumeStationSession(session._id, {})
      if (action === 'stop') await stopStationSession(session._id, { paymentMethod })
      if (action === 'cancel') {
        const reason = window.prompt('Reason for cancelling this session:')
        if (!reason?.trim()) return
        await cancelStationSession(session._id, { reason })
      }
      if (action === 'reverse') await reverseStationSession(session._id, {})
      await refresh()
    } catch (requestError) {
      setError(requestError.message || 'Session action failed.')
    } finally {
      setBusy('')
    }
  }
  const activeSessions = sessions.filter((session) => ['active', 'paused'].includes(session.status))
  const closedSessions = sessions.filter((session) => ['completed', 'reversed', 'cancelled'].includes(session.status))
  return <ModulePage title="Sessions" eyebrow="Start, pause, resume, end, cancel, and reverse persisted PlayStation sessions.">
    <div className="panel session-controls-bar"><span className="eyebrow">Session completion payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank">Bank</option><option value="membership">Membership</option><option value="other">Other</option></select><button className="button button-secondary" type="button" onClick={() => refresh().catch((requestError) => setError(requestError.message))}>Refresh sessions</button></div>
    {error && <small className="form-error" role="alert">{error}</small>}
    <div className="table-panel"><TableHeader className="session-management-header" columns={['Station', 'Player', 'Started', 'Type', 'Revenue', 'Status', 'Controls']} />{activeSessions.map((session) => <div className="table-row session-row" key={session._id}><strong>{session.stationName}</strong><span>{session.customerName}</span><span>{new Date(session.startedAt).toLocaleString()}</span><span>{session.sessionType}</span><b>{formatBirr(Number(session.revenue || 0))}</b><span className={`status-pill ${session.status === 'paused' ? 'paused' : 'playing'}`}>{session.status}</span><span className="session-action-list">{session.status === 'active' ? <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => perform(session, 'pause')}>Pause</button> : <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => perform(session, 'resume')}>Resume</button>}<button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => perform(session, 'stop')}>End & bill</button><button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => perform(session, 'cancel')}>Cancel</button>{busy.startsWith(session._id) && <small>Saving…</small>}</span></div>)}</div>
    <h3 className="session-history-title">Completed and reversed sessions</h3>
    <div className="table-panel"><TableHeader className="session-history-header" columns={['Station', 'Player', 'Ended', 'Duration', 'Revenue', 'Status', 'Action']} />{closedSessions.map((session) => <div className="table-row session-history-row" key={session._id}><strong>{session.stationName}</strong><span>{session.customerName}</span><span>{session.endedAt ? new Date(session.endedAt).toLocaleString() : '—'}</span><span>{Number(session.playedHours || 0).toFixed(2)} hrs</span><b>{formatBirr(Number(session.revenue || 0))}</b><span className={`status-pill ${session.status === 'reversed' || session.status === 'cancelled' ? 'maintenance' : 'available'}`}>{session.status}</span>{session.status === 'completed' && role === 'Owner/Admin' ? <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => perform(session, 'reverse')}>Reverse payment</button> : <span>—</span>}</div>)}</div>
  </ModulePage>
}

function getReportDateRange(period) {
  const end = new Date()
  const start = new Date(end)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  const dayOfWeek = start.getDay()
  const mondayOffset = (dayOfWeek + 6) % 7

  if (period === 'yesterday') {
    start.setDate(start.getDate() - 1)
    end.setDate(end.getDate() - 1)
  } else if (period === 'last-week') {
    start.setDate(start.getDate() - mondayOffset - 7)
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 6)
  } else if (period === 'this-week') {
    start.setDate(start.getDate() - mondayOffset)
  } else if (period === 'last-month') {
    start.setDate(1)
    start.setMonth(start.getMonth() - 1)
    end.setDate(0)
  } else if (period === 'this-month') {
    start.setDate(1)
  }

  const toDateInput = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return { from: toDateInput(start), to: toDateInput(end) }
}

function Reports({ auditLog }) {
  const [period, setPeriod] = useState('this-month')
  const [range, setRange] = useState({ from: '', to: '' })
  const { from: rangeFrom, to: rangeTo } = range
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (period === 'custom' && (!rangeFrom || !rangeTo || rangeFrom > rangeTo)) return undefined
    setLoading(true)
    setError('')
    const dateRange = period === 'custom'
      ? { from: rangeFrom, to: rangeTo }
      : getReportDateRange(period)
    getFinancialReports({
      period: 'custom',
      from: dateRange.from,
      to: dateRange.to
    })
      .then((result) => { if (!cancelled) setReport(result) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || 'Unable to load financial report.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period, rangeFrom, rangeTo])

  const values = report?.summary || report || {}
  const revenue = Number(values.revenue ?? values.totalRevenue ?? 0)
  const hours = Number(values.playedHours ?? values.hoursPlayed ?? 0)
  const inventorySales = Number(values.inventorySales ?? values.productRevenue ?? 0)
  const buckets = report?.buckets || []
  const selectedPeriodLabel = {
    yesterday: 'Yesterday',
    today: 'Today',
    'last-week': 'Last week',
    'this-week': 'This week',
    'last-month': 'Last month',
    'this-month': 'This month',
    custom: 'Custom range',
  }[period]
  const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const exportCsv = () => {
    const rows = [
      ['Date', 'Revenue', 'Session revenue', 'Product sales', 'Membership revenue', 'Played hours', 'Completed sessions', 'Product units sold'],
      ...buckets.map((bucket) => [
        bucket.date,
        Number(bucket.revenue || 0).toFixed(2),
        Number(bucket.sessionRevenue || 0).toFixed(2),
        Number(bucket.inventorySales || 0).toFixed(2),
        Number(bucket.membershipRevenue || 0).toFixed(2),
        Number(bucket.playedHours || 0).toFixed(2),
        bucket.completedSessions || 0,
        bucket.productUnitsSold || 0
      ])
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `game-zone-${period}-report.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const formatBucketDate = (value) => {
    const date = new Date(value)
    return period === 'hourly'
      ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
      : period === 'monthly'
        ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : period === 'yearly'
          ? date.getUTCFullYear()
          : date.toLocaleDateString()
  }

  return <ModulePage title="Reports & analytics" eyebrow="Analyze realized session revenue, play time, and inventory sales for any period.">
    <section className="report-toolbar panel">
      <label>Reporting period<select value={period} onChange={(event) => { const nextPeriod = event.target.value; setError(''); if (nextPeriod === 'custom') setReport(null); setLoading(nextPeriod !== 'custom' || Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo)); setPeriod(nextPeriod) }}><option value="yesterday">Yesterday</option><option value="today">Today</option><option value="last-week">Last week</option><option value="this-week">This week</option><option value="last-month">Last month</option><option value="this-month">This month</option><option value="custom">Custom range</option></select></label>
      {period === 'custom' && <><label>From<input type="date" value={rangeFrom} max={rangeTo || undefined} onChange={(event) => { const nextRange = { ...range, from: event.target.value }; setRange(nextRange); setReport(null); setError(''); setLoading(Boolean(nextRange.from && nextRange.to && nextRange.from <= nextRange.to)) }} required /></label><label>To<input type="date" value={rangeTo} min={rangeFrom || undefined} onChange={(event) => { const nextRange = { ...range, to: event.target.value }; setRange(nextRange); setReport(null); setError(''); setLoading(Boolean(nextRange.from && nextRange.to && nextRange.from <= nextRange.to)) }} required /></label></>}
      <button className="button button-primary" type="button" onClick={exportCsv} disabled={!report}>Export CSV</button>
    </section>
    {error && <small className="form-error" role="alert">{error}</small>}
    {loading && <p className="report-loading">Loading report…</p>}
    <div className="stats-grid report-stats"><StatCard label="Realized revenue" value={`${formatBirr(revenue)}`} note={`Selected period · ${selectedPeriodLabel}`} /><StatCard label="Gaming revenue" value={`${formatBirr(Number(values.sessionRevenue || 0))}`} note="Closed sessions" tone="cyan" /><StatCard label="Played hours" value={hours.toFixed(2)} note="Completed session duration" tone="purple" /><StatCard label="Inventory sales" value={`${formatBirr(inventorySales)}`} note="Product sales in range" tone="orange" /></div>
    <section className="panel analytics-chart-panel analytics-chart-featured"><div className="panel-heading"><div><span className="eyebrow">Performance overview</span><h3>Revenue &amp; playing hours</h3></div><span className="report-date-range">{report?.range?.start ? `${new Date(report.range.start).toLocaleDateString()} – ${new Date(report.range.end).toLocaleDateString()}` : selectedPeriodLabel}</span></div><AnalyticsChart buckets={buckets} /></section>
    <section className="panel report-breakdown"><div className="panel-heading"><div><span className="eyebrow">Period breakdown</span><h3>{selectedPeriodLabel}</h3></div><span className="status-pill available">{report?.count ?? 0} records</span></div><div className="report-breakdown-grid"><span>Completed sessions <strong>{values.sessionCount ?? 0}</strong></span><span>Inventory units sold <strong>{values.inventoryUnitsSold ?? 0}</strong></span><span>Payments received <strong>{formatBirr(Number(values.paymentTotal ?? revenue))}</strong></span></div></section>
    <section className="panel report-table-panel"><div className="panel-heading"><div><span className="eyebrow">Detailed results</span><h3>Revenue & activity by {report?.range?.bucket || 'period'}</h3></div><span className="report-date-range">{report?.range?.start ? `${new Date(report.range.start).toLocaleDateString()} – ${new Date(report.range.end).toLocaleDateString()}` : ''}</span></div><div className="report-table-scroll"><table className="report-table"><thead><tr><th>Date / period</th><th>Total revenue</th><th>Gaming</th><th>Product sales</th><th>Memberships</th><th>Play hours</th><th>Sessions</th><th>Units sold</th></tr></thead><tbody>{buckets.map((bucket) => <tr key={bucket.date}><td>{formatBucketDate(bucket.date)}</td><td>{formatBirr(Number(bucket.revenue || 0))}</td><td>{formatBirr(Number(bucket.sessionRevenue || 0))}</td><td>{formatBirr(Number(bucket.inventorySales || 0))}</td><td>{formatBirr(Number(bucket.membershipRevenue || 0))}</td><td>{Number(bucket.playedHours || 0).toFixed(2)}</td><td>{bucket.completedSessions || 0}</td><td>{bucket.productUnitsSold || 0}</td></tr>)}</tbody></table>{!buckets.length && !loading && <div className="empty-state">{error ? 'Report data is unavailable.' : 'No activity was recorded for this period.'}</div>}</div></section>
    <div className="settings-grid"><div className="panel settings-card"><span className="eyebrow">Audit trail</span><h3>Staff activity</h3><Activity entries={auditLog} /></div><div className="panel settings-card"><span className="eyebrow">Data source</span><h3>Accurate period totals</h3><p>Reports are calculated from persisted, completed sessions and recorded inventory sales, not browser sample values.</p></div></div>
  </ModulePage>
}

function AnalyticsChart({ buckets }) {
  const width = 900
  const height = 320
  const left = 58
  const right = 18
  const top = 22
  const bottom = 48
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const maxRevenue = Math.max(1, ...buckets.map((bucket) => Number(bucket.revenue || 0)))
  const maxHours = Math.max(1, ...buckets.map((bucket) => Number(bucket.playedHours || 0)))
  const x = (index) => left + (buckets.length <= 1 ? chartWidth / 2 : index / (buckets.length - 1) * chartWidth)
  const y = (value, max) => top + chartHeight - Number(value || 0) / max * chartHeight
  const revenuePoints = buckets.map((bucket, index) => `${x(index)},${y(bucket.revenue, maxRevenue)}`).join(' ')
  const hoursPoints = buckets.map((bucket, index) => `${x(index)},${y(bucket.playedHours, maxHours)}`).join(' ')
  const revenueArea = buckets.length
    ? `${left},${top + chartHeight} ${revenuePoints} ${x(buckets.length - 1)},${top + chartHeight}`
    : ''
  const labelIndexes = [...new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1])]

  return <div className="analytics-chart">
    <div className="analytics-chart-legend"><span><i className="dot lime" />Revenue ({formatBirr(maxRevenue)} scale)</span><span><i className="dot cyan" />Playing hours ({maxHours.toFixed(1)} hrs scale)</span></div>
    {buckets.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Revenue and playing hours by reporting period">
      <defs><linearGradient id="analytics-revenue-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--lime)" stopOpacity=".24" /><stop offset="100%" stopColor="var(--lime)" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((line) => {
        const lineY = top + line * chartHeight / 4
        return <line className="analytics-grid-line" key={line} x1={left} x2={width - right} y1={lineY} y2={lineY} />
      })}
      <polygon className="analytics-revenue-area" points={revenueArea} />
      <polyline className="analytics-revenue-line" points={revenuePoints} />
      <polyline className="analytics-hours-line" points={hoursPoints} />
      {buckets.map((bucket, index) => <g key={bucket.date}>
        <circle className="analytics-revenue-point" cx={x(index)} cy={y(bucket.revenue, maxRevenue)} r="4"><title>{new Date(bucket.date).toLocaleDateString()}: {formatBirr(Number(bucket.revenue || 0))}</title></circle>
        <circle className="analytics-hours-point" cx={x(index)} cy={y(bucket.playedHours, maxHours)} r="4"><title>{new Date(bucket.date).toLocaleDateString()}: {Number(bucket.playedHours || 0).toFixed(2)} playing hours</title></circle>
      </g>)}
      {labelIndexes.map((index) => <text className="analytics-axis-label" key={index} x={x(index)} y={height - 12} textAnchor={index === 0 ? 'start' : index === buckets.length - 1 ? 'end' : 'middle'}>{new Date(buckets[index].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>)}
    </svg> : <div className="empty-state">No trend data is available for this period.</div>}
  </div>
}

function StationsManagement() {
  const { stations, refreshStations } = useApp()
  const occupancy = getStationOccupancy(stations)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [loading, setLoading] = useState(true)
  const selectedStation = modal?.station
    ? stations.find((station) => station.id === modal.station.id) || modal.station
    : null
  useEffect(() => {
    refreshStations()
      .catch((requestError) => setError(requestError.message || 'Unable to load stations.'))
      .finally(() => setLoading(false))
  }, [refreshStations])
  const changeStatus = async (station, status) => {
    let reason = ''
    if (status === 'maintenance') {
      const enteredReason = window.prompt('Maintenance note (optional)', '')
      if (enteredReason === null) return
      reason = enteredReason.trim()
    }
    await updateStationStatus(station.id, status, reason)
    try {
      await refreshStations()
    } catch (requestError) {
      throw new Error(`Station status updated, but the floor plan could not refresh: ${requestError.message || 'Unable to load stations.'}`)
    }
    setError('')
  }
  const remove = async (station) => {
    if (!window.confirm(`Delete station ${station.name}?`)) return
    await deleteStation(station.id)
    try {
      await refreshStations()
    } catch (requestError) {
      throw new Error(`Station deleted, but the floor plan could not refresh: ${requestError.message || 'Unable to load stations.'}`)
    }
  }
  return <><main className="workspace"><div className="page-toolbar"><div><p className="breadcrumb">Operations / Stations</p><h2>Station management</h2><p className="page-description">One live floor plan to monitor and control all gaming stations.</p></div><div className="toolbar-actions"><span className="occupancy-indicator" aria-label={`${occupancy.occupied} occupied of ${occupancy.operational} operational stations`}>OCCUPIED: {occupancy.percent}% <small>{occupancy.occupied}/{occupancy.operational}</small></span></div></div>
    {error && !modal && <small className="form-error" role="alert">{error}</small>}
    {loading ? <div className="panel empty-state">Loading stations…</div> : stations.length ? <div className="station-grid station-management-grid">{stations.map((station) => <StationCard station={station} key={station.id} onView={(selected) => setModal({ kind: 'details', station: selected })} onAction={(kind, selected) => setModal({ kind, station: selected })} onStatusChange={changeStatus} onDelete={remove} />)}</div> : <div className="panel empty-state">No stations configured yet. Add stations from Settings.</div>}
  </main>{modal?.kind === 'details' && selectedStation && <StationDetailsModal station={selectedStation} onClose={() => setModal(null)} onAction={(kind, selected) => setModal({ kind, station: selected })} onStatusChange={changeStatus} />}{modal && modal.kind !== 'details' && <SessionModal station={selectedStation || modal.station} kind={modal.kind} onClose={() => setModal(null)} />}</>
}

function Memberships() {
  const [memberships, setMemberships] = useState([])
  const [form, setForm] = useState({ customerName: '', phone: '', plan: 'Monthly', amount: '', paymentMethod: 'Cash' })
  const [error, setError] = useState('')
  useEffect(() => { listMemberships().then((result) => setMemberships(result.memberships || [])).catch((requestError) => setError(requestError.message || 'Unable to load memberships.')) }, [])
  const add = async (event) => {
    event.preventDefault()
    try {
      const result = await createMembership({ ...form, amount: Number(form.amount) })
      setMemberships((items) => [result.membership, ...items])
      setForm({ customerName: '', phone: '', plan: 'Monthly', amount: '', paymentMethod: 'Cash' })
      setError('')
    } catch (requestError) { setError(requestError.message || 'Unable to register membership.') }
  }
  const cancel = async (membership) => {
    try {
      const result = await updateMembership(membership._id || membership.id, { status: 'cancelled' })
      setMemberships((items) => items.map((item) => (item._id || item.id) === (membership._id || membership.id) ? result.membership : item))
    } catch (requestError) { setError(requestError.message || 'Unable to cancel membership.') }
  }
  const renew = async (membership) => {
    const amount = Number(window.prompt('Renewal amount', membership.price || membership.amount))
    if (!Number.isFinite(amount) || amount < 0) return
    const method = window.prompt('Payment method: cash, mobile_money, card, or bank', 'cash')
    if (!method) return
    try {
      const result = await recordMembershipPayment(membership._id || membership.id, { amount, paymentMethod: method })
      setMemberships((items) => items.map((item) => (item._id || item.id) === (membership._id || membership.id) ? result.membership : item))
      setError('')
    } catch (requestError) { setError(requestError.message || 'Unable to record membership payment.') }
  }
  return <ModulePage title="Memberships" eyebrow="Register monthly and annual members with recorded payment methods.">
    <form className="panel membership-form" onSubmit={add}><label>Customer name<input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required /></label><label>Phone<input inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label><label>Plan<select value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })}><option>Monthly</option><option>Yearly</option></select></label><label>Payment amount<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label><label>Payment method<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}><option>Cash</option><option>Mobile Money</option><option>Card</option><option>Bank</option></select></label><button className="button button-primary" type="submit">Register member</button></form>
    {error && <small className="form-error" role="alert">{error}</small>}
    <div className="table-panel"><TableHeader className="membership-header" columns={['Member', 'Phone', 'Plan', 'Paid', 'Payment method', 'Expires', 'Actions']} />{memberships.map((member) => <div className="table-row membership-row" key={member._id || member.id}><strong>{member.customerName || member.name}</strong><span>{member.phone}</span><span className={`status-pill ${member.status === 'cancelled' ? 'maintenance' : 'available'}`}>{member.plan}</span><span>{formatBirr(Number(member.amount || member.paymentAmount || 0))}</span><span>{member.paymentMethod}</span><span>{member.expiresAt ? new Date(member.expiresAt).toLocaleDateString() : '—'}</span><span><button className="text-button" type="button" onClick={() => renew(member)}>Renew</button>{member.status !== 'cancelled' && <button className="text-button" type="button" onClick={() => cancel(member)}>Cancel</button>}</span></div>)}</div>
  </ModulePage>
}

function CheckoutModal({ onClose, gamingCharge = 0 }) {
  const { cart, addToCart, removeFromCart, checkout, pricing, shop } = useApp()
  const [payment, setPayment] = useState({ Cash: 0, 'Mobile Money': 0, Bank: 0, Card: 0 })
  const [discount, setDiscount] = useState({ type: 'percent', value: 0, reason: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const groupedCart = groupCartItems(cart)
  const productTotal = cart.reduce((sum, product) => sum + Number(product.price || 0), 0)
  const subtotal = productTotal + gamingCharge
  const discountValue = discount.type === 'percent' ? subtotal * (Number(discount.value) / 100) : Number(discount.value)
  const total = Math.max(0, subtotal - discountValue)
  const paid = Object.values(payment).reduce((sum, value) => sum + Number(value), 0)
  const increaseQuantity = (item) => {
    const id = String(item._id || item.id || item.name)
    const quantity = cart.filter((line) => String(line._id || line.id || line.name) === id).length
    const stock = Number(item.stock)
    if (Number.isFinite(stock) && quantity >= stock) {
      setError(`Only ${stock} ${item.name} unit${stock === 1 ? '' : 's'} remain in stock.`)
      return
    }
    setError('')
    addToCart(item)
  }
  const submit = async (event) => {
    event.preventDefault()
    if (discountValue > 0 && !discount.reason.trim()) return
    if (Math.abs(paid - total) > .01) return
    setSubmitting(true)
    setError('')
    try {
      const items = cart.reduce((acc, item) => {
        const id = item._id || item.id
        if (!id || !/^[a-f\d]{24}$/i.test(String(id))) return acc
        const found = acc.find((line) => line.productId === id)
        if (found) found.quantity += 1
        else acc.push({ productId: id, quantity: 1 })
        return acc
      }, [])
      if (cart.length && !items.length) {
        throw new Error('Product sale could not be linked to inventory records. Refresh inventory and try again.')
      }
      if (items.length) {
        const payments = Object.entries(payment)
          .filter(([, amount]) => Number(amount) > 0)
          .map(([method, amount]) => ({
            paymentMethod: method.toLowerCase().replace(/\s+/g, '_'),
            amount: Number(amount)
          }))
        await createSale({ items, payments, discountAmount: discountValue })
        window.dispatchEvent(new Event('inventory-updated'))
      }
      checkout(total)
      printReceipt({ shop, items: groupedCart, gamingCharge, total })
      onClose()
    } catch (requestError) {
      setError(requestError.message || 'Unable to record payment.')
    } finally {
      setSubmitting(false)
    }
  }
  return <Modal title="Final bill & checkout" eyebrow="Gaming + products · audit ready" onClose={onClose}><form className="modal-form checkout-form" onSubmit={submit}><div className="bill-lines"><div><span>Gaming charges</span><b>{formatBirr(gamingCharge)}</b></div>{groupedCart.map((item) => <div className="bill-line-product" key={item.key}><span>{item.icon} {item.name} <small>{formatBirr(Number(item.price))} each</small></span><div className="quantity-control"><button type="button" aria-label={`Return one ${item.name}`} title="Remove one from this bill" disabled={submitting} onClick={() => removeFromCart(item.indexes[item.indexes.length - 1])}>−</button><b>{item.quantity}</b><button type="button" aria-label={`Add one ${item.name}`} title="Add one to this bill" disabled={submitting} onClick={() => increaseQuantity(item)}>+</button></div><strong>{formatBirr(Number(item.price) * item.quantity)}</strong></div>)}</div><div className="bill-total"><span>Subtotal</span><strong>{formatBirr(subtotal)}</strong></div><div className="discount-box"><label>Discount type<select value={discount.type} onChange={(event) => setDiscount({ ...discount, type: event.target.value })}><option value="percent">Percentage (%)</option><option value="fixed">Fixed amount</option></select></label><label>Amount<input min="0" max={discount.type === 'percent' ? Number(pricing.discountLimit) : subtotal} type="number" value={discount.value} onChange={(event) => setDiscount({ ...discount, value: event.target.value })} /></label><label className="wide">Reason required for staff discount<input value={discount.reason} onChange={(event) => setDiscount({ ...discount, reason: event.target.value })} placeholder={`Admin limit: ${pricing.discountLimit}%`} /></label></div><div className="payment-grid"><strong>Mixed payments</strong>{Object.keys(payment).map((method) => <label key={method}>{method}<input type="number" min="0" value={payment[method]} onChange={(event) => setPayment({ ...payment, [method]: event.target.value })} /></label>)}<small>Paid {formatBirr(paid)} of {formatBirr(total)} {Math.abs(paid - total) < .01 ? '✓' : '· enter exact total'}</small></div>{error && <small className="form-error" role="alert">{error}</small>}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={submitting}>Back</button><button className="button button-primary" type="submit" disabled={submitting || Math.abs(paid - total) > .01 || (discountValue > 0 && !discount.reason.trim())}>{submitting ? 'Recording…' : 'Complete payment'}</button></div></form></Modal>
}

function ModuleContent({ route }) {
  const { stations, products, expenses, reservations, credits, cart, hardware, remoteReservations, addExpense, addToCart, removeFromCart, addReservation, addCredit, repayCredit, auditLog, role, updateRemoteReservation, reportHardwareIssue } = useApp()
  const [modal, setModal] = useState(null)
  if (route === 'sessions') return <SessionManagement />
  if (route === 'stations') return role === 'Owner/Admin' ? <StationsManagement /> : <ModulePage title="Station management" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Only administrators can add or remove stations and change their operational status.</p></div></ModulePage>
  if (route === 'memberships') return <Memberships />
  if (route === 'inventory') return role === 'Owner/Admin' ? <Inventory initialProducts={products} /> : <ModulePage title="Inventory" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Cashiers can sell stocked items in POS. Product and stock management is reserved for administrators.</p></div></ModulePage>
  if (route === 'pos') return <><POS products={products} addToCart={addToCart} removeFromCart={removeFromCart} cart={cart} setModal={setModal} />{modal && <CheckoutModal onClose={() => setModal(null)} gamingCharge={0} />}</>
  if (route === 'reservations') return <Reservations stations={stations} reservations={reservations} addReservation={addReservation} credits={credits} addCredit={addCredit} repayCredit={repayCredit} />
  if (route === 'remote-booking') return <RemoteBooking bookings={remoteReservations} updateRemoteReservation={updateRemoteReservation} />
  if (route === 'hardware') return <HardwareHealth hardware={hardware} reportHardwareIssue={reportHardwareIssue} />
  if (route === 'expenses') return <Expenses expenses={expenses} addExpense={addExpense} />
  if (route === 'reports') return role === 'Owner/Admin' ? <Reports auditLog={auditLog} /> : <ModulePage title="Reports" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Financial reporting is available to administrators only.</p></div></ModulePage>
  if (route === 'settings') return role === 'Owner/Admin' ? <><SubscriptionPayments /><Settings /></> : <ModulePage title="Settings" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Cashier/Staff accounts can operate stations, sessions, reservations, POS, inventory, and expenses, but cannot change pricing or sensitive settings.</p></div></ModulePage>
  return <ModulePage title="Reports & exports" eyebrow="Revenue, expenses, staff performance, and audit records." />
}

function StationSettings() {
  const { refreshStations } = useApp()
  const [form, setForm] = useState({ name: '', type: 'PlayStation 5' })
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const add = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await createStation(form)
    } catch (requestError) {
      setError(requestError.message || 'Unable to add station.')
      setSaving(false)
      return
    }
    setForm({ name: '', type: 'PlayStation 5' })
    setModalOpen(false)
    try {
      await refreshStations()
    } catch (requestError) {
      setError(`Station created, but the floor plan could not refresh: ${requestError.message || 'Unable to load stations.'}`)
    }
    setSaving(false)
  }

  return <>
    <section className="panel settings-card">
      <span className="eyebrow">Admin only</span>
      <h3>Station management</h3>
      <p>Add a console to your gaming floor.</p>
      {error && <small className="form-error" role="alert">{error}</small>}
      <button className="button button-primary" type="button" onClick={() => { setError(''); setModalOpen(true) }}>+ Add station</button>
    </section>
    {modalOpen && <Modal title="Add station" eyebrow="Create a console in your floor plan" onClose={() => { if (!saving) { setModalOpen(false); setError('') } }}>
      <form className="modal-form" onSubmit={add}>
        <label>Station name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. PS5-11" maxLength="80" required disabled={saving} /></label>
        <label>Console type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} disabled={saving}><option>PlayStation 5</option><option>PlayStation 4</option></select></label>
        {error && <small className="form-error" role="alert">{error}</small>}
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={() => { setModalOpen(false); setError('') }} disabled={saving}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add station'}</button>
        </div>
      </form>
    </Modal>}
  </>
}

function Settings() {
  const { pricing, updatePricing, shift, closeShift, users, addUser, updateUser, deleteUser, user: currentUser, shop, saveShopSettings } = useApp()
  const [values, setValues] = useState(pricing)
  const [shopValues, setShopValues] = useState({ name: shop.name, phone: shop.phone, address: shop.address, rates: { ...shop.rates } })
  const [cash, setCash] = useState('')
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'Cashier', pin: '' })
  const [userError, setUserError] = useState('')
  const [shopError, setShopError] = useState('')
  const [shopSaved, setShopSaved] = useState(false)
  useEffect(() => {
    setShopValues({ name: shop.name || '', phone: shop.phone || '', address: shop.address || '', rates: { ...shop.rates } })
  }, [shop])
  const submitShop = async (event) => {
    event.preventDefault()
    try {
      await saveShopSettings(shopValues)
      setShopError('')
      setShopSaved(true)
      window.setTimeout(() => setShopSaved(false), 3000)
    } catch (error) {
      setShopSaved(false)
      setShopError(error.message || 'Unable to save shop settings.')
    }
  }
  const submitUser = async (event) => {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userForm.email.trim())) return setUserError('Enter a valid email address.')
    if (!/^\d{6}$/.test(userForm.pin)) return setUserError('PIN must contain exactly 6 digits.')
    if (users.some((managedUser) => managedUser.email.toLowerCase() === userForm.email.trim().toLowerCase())) return setUserError('That email address is already assigned.')
    try {
      await addUser({ ...userForm, email: userForm.email.trim().toLowerCase() })
      setUserForm({ name: '', email: '', role: 'Cashier', pin: '' })
      setUserError('')
    } catch (error) {
      setUserError(error.message || 'Unable to create user.')
    }
  }
  const editUser = async (managedUser) => {
    const name = window.prompt('Full name', managedUser.name)
    const email = window.prompt('Email address', managedUser.email)?.trim().toLowerCase()
    const role = window.prompt('Role: Admin or Cashier', managedUser.role)
    const pin = window.prompt('6-digit PIN', managedUser.pin)
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^(Admin|Cashier)$/.test(role) || !/^\d{6}$/.test(pin)) {
      setUserError('Edit cancelled or invalid. Enter a valid email and a 6-digit PIN.')
      return
    }
    if (users.some((candidate) => candidate.id !== managedUser.id && candidate.email.toLowerCase() === email)) {
      setUserError('That email address is already assigned.')
      return
    }
    try {
      await updateUser({ ...managedUser, name, email, role, pin, password: pin })
      setUserError('')
    } catch (error) {
      setUserError(error.message || 'Unable to update user.')
    }
  }
  return <ModulePage title="Settings & pricing" eyebrow="Owner/Admin controls for your shop identity, receipt details, rates, users, and shift close.">
    <form className="panel shop-settings-form" onSubmit={submitShop}>
      <div className="panel-heading"><div><span className="eyebrow">Business profile</span><h3>Shop settings</h3></div><span className="status-pill available">Admin only</span></div>
      <div className="form-grid">
        <label>Shop name<input value={shopValues.name} onChange={(event) => setShopValues({ ...shopValues, name: event.target.value })} required /></label>
        <label>Phone<input value={shopValues.phone} onChange={(event) => setShopValues({ ...shopValues, phone: event.target.value })} /></label>
        <label className="wide">Receipt address<textarea value={shopValues.address} onChange={(event) => setShopValues({ ...shopValues, address: event.target.value })} /></label>
        <label>PS4 hourly rate<input type="number" min="0" step="0.01" value={shopValues.rates.ps4} onChange={(event) => setShopValues({ ...shopValues, rates: { ...shopValues.rates, ps4: event.target.value } })} /></label>
        <label>PS5 hourly rate<input type="number" min="0" step="0.01" value={shopValues.rates.ps5} onChange={(event) => setShopValues({ ...shopValues, rates: { ...shopValues.rates, ps5: event.target.value } })} /></label>
        <label>VIP hourly rate<input type="number" min="0" step="0.01" value={shopValues.rates.vip} onChange={(event) => setShopValues({ ...shopValues, rates: { ...shopValues.rates, vip: event.target.value } })} /></label>
        <label>Other hourly rate<input type="number" min="0" step="0.01" value={shopValues.rates.other} onChange={(event) => setShopValues({ ...shopValues, rates: { ...shopValues.rates, other: event.target.value } })} /></label>
      </div>
      {shopError && <small className="form-error">{shopError}</small>}
      {shopSaved && <small className="form-success" role="status">Shop settings saved successfully.</small>}
      <button className="button button-primary" type="submit">Save business settings</button>
    </form>
    <div className="settings-grid">
      <StationSettings />
      <form className="panel settings-card" onSubmit={(event) => { event.preventDefault(); updatePricing(values) }}>
        <span className="eyebrow">Admin only</span><h3>Pricing control</h3>
        <div className="pricing-form">
          <label>PS4 / minute<input type="number" step="0.01" min="0" value={values.ps4} onChange={(event) => setValues({ ...values, ps4: event.target.value })} /></label>
          <label>PS5 / minute<input type="number" step="0.01" min="0" value={values.ps5} onChange={(event) => setValues({ ...values, ps5: event.target.value })} /></label>
          <label>Other / minute<input type="number" step="0.01" min="0" value={values.other} onChange={(event) => setValues({ ...values, other: event.target.value })} /></label>
          <label>Staff discount max %<input type="number" min="0" max="100" value={values.discountLimit} onChange={(event) => setValues({ ...values, discountLimit: event.target.value })} /></label>
        </div>
        <button className="button button-primary" type="submit">Save pricing</button>
      </form>
      <form className="panel settings-card" onSubmit={(event) => { event.preventDefault(); if (cash !== '') closeShift(cash) }}>
        <span className="eyebrow">Cashier control</span><h3>Close current shift</h3>
        <p>Expected cash: <b>{formatBirr(shift.expectedCash)}</b>{shift.closedAt && ` · Closed at ${shift.closedAt}`}</p>
        <label>Actual physical cash<input type="number" min="0" step="0.01" value={cash} onChange={(event) => setCash(event.target.value)} required /></label>
        <button className="button button-secondary" type="submit">Close shift</button>
      </form>
    </div>
    <div className="user-management panel">
      <div className="panel-heading"><div><span className="eyebrow">Admin only</span><h3>User management</h3></div><span className="status-pill available">{users.length} users</span></div>
      <form className="user-form" onSubmit={submitUser}>
        <input placeholder="Full name" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} required />
        <input type="email" autoComplete="email" placeholder="Email address" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} required />
        <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option>Cashier</option><option>Admin</option></select>
        <input inputMode="numeric" pattern="\d{6}" maxLength="6" placeholder="6-digit PIN" value={userForm.pin} onChange={(event) => setUserForm({ ...userForm, pin: event.target.value.replace(/\D/g, '') })} required />
        <button className="button button-primary" type="submit">Add user</button>
        {userError && <small className="form-error">{userError}</small>}
      </form>
      <div className="user-list">{users.map((managedUser) => <div className="user-row" key={managedUser.id}>
        <span className="avatar">{managedUser.name.split(' ').map((name) => name[0]).join('')}</span>
        <span><strong>{managedUser.name}</strong><small>{managedUser.email}</small></span>
        <span className="status-pill">{managedUser.role}</span>
        {managedUser.name !== currentUser && <>
          <button className="button button-secondary edit-user-button" type="button" onClick={() => editUser(managedUser)}>Edit</button>
          <button className="button button-danger delete-user-button" type="button" onClick={() => { if (window.confirm(`Delete ${managedUser.name}?`)) deleteUser(managedUser.email) }}>Delete</button>
        </>}
      </div>)}</div>
    </div>
  </ModulePage>
}

function POS({ products: initialProducts, addToCart, removeFromCart, cart, setModal }) {
  const [products, setProducts] = useState(initialProducts)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    listProducts().then((result) => { if (!cancelled) setProducts(result.products || []) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || 'Unable to load inventory products.') })
    const reload = () => listProducts().then((result) => setProducts(result.products || []))
      .catch((requestError) => setError(requestError.message || 'Unable to refresh inventory.'))
    window.addEventListener('inventory-updated', reload)
    return () => {
      cancelled = true
      window.removeEventListener('inventory-updated', reload)
    }
  }, [])
  const groupedCart = groupCartItems(cart)
  const increaseQuantity = (item) => {
    const id = String(item._id || item.id || item.name)
    const quantity = cart.filter((line) => String(line._id || line.id || line.name) === id).length
    const stock = Number(item.stock)
    if (Number.isFinite(stock) && quantity >= stock) {
      setError(`Only ${stock} ${item.name} unit${stock === 1 ? '' : 's'} remain in stock.`)
      return
    }
    setError('')
    addToCart(item)
  }
  const decreaseQuantity = (item) => {
    setError('')
    removeFromCart(item.indexes[item.indexes.length - 1])
  }
  return <ModulePage title="POS & Sales" eyebrow="Combine gaming charges and product sales into one final bill."><div className="pos-layout"><div className="product-picker panel"><div className="panel-heading"><div><span className="eyebrow">Quick sale</span><h3>Products</h3></div></div>{error && <small className="form-error" role="alert">{error}</small>}<div className="product-grid">{products.map((product) => <button type="button" key={product._id || product.id} disabled={Number(product.stock) === 0} onClick={() => increaseQuantity({ ...product, price: Number(product.price) })}><span className="product-visual"><img src={product.imageUrl || getProductImage(product.name, product.category)} alt="" onError={(event) => { event.currentTarget.hidden = true }} /><i>{product.icon || '◈'}</i></span><strong>{product.name}</strong><small>{formatBirr(Number(product.price))} · {product.stock} left</small></button>)}</div></div><div className="checkout panel"><span className="eyebrow">Current bill</span><h3>{cart.length ? `${cart.length} item(s) selected` : 'Walk-in sale'}</h3><div className="cart-lines">{groupedCart.length ? groupedCart.map((item) => <div className="cart-line" key={item.key}><span>{item.name}<small>{formatBirr(Number(item.price))} each</small></span><div className="quantity-control"><button type="button" aria-label={`Return one ${item.name}`} title="Remove one from this bill" onClick={() => decreaseQuantity(item)}>−</button><b>{item.quantity}</b><button type="button" aria-label={`Add one ${item.name}`} title="Add one to this bill" onClick={() => increaseQuantity(item)}>+</button></div><strong>{formatBirr(Number(item.price) * item.quantity)}</strong></div>) : <div className="empty-state">Select products to add them to this bill.</div>}</div><div className="checkout-total"><span>Total</span><strong>{formatBirr(cart.reduce((sum, item) => sum + Number(item.price), 0))}</strong></div><button className="button button-primary full-button" type="button" disabled={!cart.length} onClick={() => setModal('checkout')}>Review final bill</button></div></div></ModulePage>
}

function Reservations({ stations, reservations, addReservation, credits, addCredit, repayCredit }) {
  const [form, setForm] = useState({ customer: '', phone: '', stationId: stations[0].id, amount: 20 })
  const [credit, setCredit] = useState({ customer: '', phone: '', amount: 0 })
  const [phoneError, setPhoneError] = useState('')
  const phoneChange = (setFormState) => (event) => {
    const value = event.target.value
    if (!/^[0-9+ ]*$/.test(value)) return
    setFormState((current) => ({ ...current, phone: value }))
    setPhoneError(value && !/^\+?[0-9 ]{7,18}$/.test(value) ? 'Use numbers only (7-18 digits).' : '')
  }
  const validPhone = (phone) => /^\+?[0-9 ]{7,18}$/.test(phone)
  return <ModulePage title="Reservations & credit" eyebrow="Bookings require 50% deposit, a 15-minute grace period, and tracked balances."><div className="form-columns"><form className="reservation-card panel" onSubmit={(event) => { event.preventDefault(); if (!validPhone(form.phone)) { setPhoneError('Enter a valid phone number using numbers only.'); return } addReservation({ ...form, deposit: Number(form.amount) * .5 }); setForm({ ...form, customer: '', phone: '' }); setPhoneError('') }}><span className="eyebrow">Reservation desk</span><h3>New reservation</h3><div className="form-grid"><label>Customer name<input value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} required /></label><label>Phone number<input inputMode="tel" pattern="\+?[0-9 ]{7,18}" value={form.phone} onChange={phoneChange(setForm)} required />{phoneError && <small className="form-error">{phoneError}</small>}</label><label>Station<select value={form.stationId} onChange={(event) => setForm({ ...form, stationId: event.target.value })}>{stations.filter((station) => station.status !== 'playing').map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label><label>Booking total<input type="number" min="1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label></div><p className="deposit-note">Required deposit: <b>{formatBirr(Number(form.amount) * .5)}</b> · 15 min grace period</p><button className="button button-primary" type="submit">Create reservation</button></form><div className="panel settings-card"><span className="eyebrow">Credit / unpaid balance</span><h3>Track customer debt</h3><form className="credit-form" onSubmit={(event) => { event.preventDefault(); if (!validPhone(credit.phone)) return; addCredit({ ...credit, total: Number(credit.amount) }); setCredit({ customer: '', phone: '', amount: 0 }) }}><input placeholder="Customer name" value={credit.customer} onChange={(event) => setCredit({ ...credit, customer: event.target.value })} required /><input inputMode="tel" pattern="\+?[0-9 ]{7,18}" placeholder="Phone number (numbers only)" value={credit.phone} onChange={phoneChange(setCredit)} required /><input type="number" min="0" placeholder="Total owed" value={credit.amount} onChange={(event) => setCredit({ ...credit, amount: event.target.value })} required /><button className="button button-secondary" type="submit">Add balance</button></form><div className="credit-list">{credits.map((item) => <div className="credit-row" key={item.id}><span><strong>{item.customer}</strong><small>{item.phone} · {formatBirr(item.total - item.paid)} remaining</small></span><button className="text-button" type="button" onClick={() => repayCredit(item.id, item.customer, 5)}>Repay {formatBirr(5)}</button></div>)}</div></div></div><div className="table-panel reservation-table"><TableHeader columns={['Customer', 'Phone', 'Station', 'Deposit', 'Status', 'Grace']} />{reservations.map((item) => <div className="table-row" key={item.id}><strong>{item.customer}</strong><span>{item.phone}</span><span>{item.stationId}</span><span>{formatBirr(item.deposit)}</span><span className="status-pill reserved">{item.status}</span><span>{item.graceMinutes} min</span></div>)}</div></ModulePage>
}

function RemoteBooking({ bookings, updateRemoteReservation }) {
  return <ModulePage title="Remote booking" eyebrow="Customer requests arrive here for approval before a station is reserved."><div className="table-panel reservation-table"><TableHeader columns={['Confirmation', 'Customer', 'Station', 'Date', 'Time', 'Status', 'Decision']} />{bookings.map((booking) => <div className="table-row" key={booking.confirmation}><strong>{booking.confirmation}</strong><span>{booking.customer}</span><span>{booking.stationId}</span><span>{booking.date}</span><span>{booking.time}</span><span className={`status-pill ${booking.status === 'Approved' ? 'available' : booking.status === 'Rejected' ? 'maintenance' : 'reserved'}`}>{booking.status}</span>{booking.status === 'Pending approval' ? <span><button className="text-button" type="button" onClick={() => updateRemoteReservation(booking, 'Approved')}>Approve</button><button className="text-button" type="button" onClick={() => updateRemoteReservation(booking, 'Rejected')}>Reject</button></span> : <span>—</span>}</div>)}</div></ModulePage>
}

function HardwareHealth({ hardware, reportHardwareIssue }) {
  const [selected, setSelected] = useState(null)
  const [reason, setReason] = useState('')
  const submit = (event) => {
    event.preventDefault()
    if (!reason.trim()) return
    reportHardwareIssue(selected.station, selected.component, reason)
    setSelected(null)
    setReason('')
  }
  return <ModulePage title="Hardware health" eyebrow="Monitor console and controller health with remote alerts for administrators."><div className="health-summary"><StatCard label="Healthy stations" value={`${hardware.filter((item) => item.console === 'Healthy' && item.controller === 'Healthy').length}/${hardware.length}`} note="Last checks are live" /><StatCard label="Needs attention" value={hardware.filter((item) => item.console !== 'Healthy' || item.controller !== 'Healthy').length} note="Admin alert queue" tone="orange" /></div><div className="table-panel health-table"><TableHeader columns={['Station', 'Console', 'Controller', 'Last check', 'Alert']} />{hardware.map((item) => <div className="table-row" key={item.id}><strong>{item.station}</strong><span className={item.console === 'Healthy' ? 'health-good' : 'health-bad'}>{item.console}</span><span className={item.controller === 'Healthy' ? 'health-good' : 'health-bad'}>{item.controller}</span><span>{item.lastCheck}</span><button className="text-button" type="button" onClick={() => setSelected({ station: item.station, component: item.controller === 'Healthy' ? 'controller' : 'console' })}>Report issue</button></div>)}</div>{selected && <Modal title={`Report issue · ${selected.station}`} eyebrow="Remote failure alert" onClose={() => setSelected(null)}><form className="modal-form" onSubmit={submit}><label>Component<select value={selected.component} onChange={(event) => setSelected({ ...selected, component: event.target.value })}><option value="controller">Controller</option><option value="console">Console</option></select></label><label>Issue details<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the failure for the admin..." required /></label><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setSelected(null)}>Cancel</button><button className="button button-danger" type="submit">Send admin alert</button></div></form></Modal>}</ModulePage>
}

function Expenses({ expenses, addExpense }) { const [form, setForm] = useState({ title: '', category: 'Utilities', amount: '' }); return <ModulePage title="Expenses" eyebrow="Record daily expenses and notify the admin team immediately."><form className="expense-form panel" onSubmit={(event) => { event.preventDefault(); addExpense({ ...form, amount: Number(form.amount) }); setForm({ ...form, title: '', amount: '' }) }}><label>Expense description<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Electricity bill" required /></label><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Utilities</option><option>Rent</option><option>Maintenance</option><option>Supplies</option></select></label><label>Amount<input type="number" min="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label><button className="button button-primary" type="submit">Save expense</button></form><div className="table-panel"><TableHeader columns={['Description', 'Category', 'Date', 'Added by', 'Amount']} />{expenses.map((expense) => <div className="table-row" key={expense.id}><strong>{expense.title}</strong><span>{expense.category}</span><span>Today</span><span>{expense.by}</span><b className="negative">−{formatBirr(expense.amount)}</b></div>)}</div></ModulePage> }

function TableHeader({ columns, className = '' }) { return <div className={`table-header ${className}`}>{columns.map((column) => <span key={column}>{column}</span>)}</div> }
function Dashboard() {
  const { route, role, shop } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const admin = role === 'Owner/Admin'
  const restrictedForCashier = ['stations', 'inventory', 'reports', 'settings']
  const visibleNav = navItems.filter(([id]) => admin || !restrictedForCashier.includes(id))
  return <>
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-heading">
        <a className="sidebar-brand" href="#dashboard">
          <BrandMark />
          {menuOpen && <span>{shop.name || 'GAME ZONE'}<br /><b>MANAGEMENT</b></span>}
        </a>
        <button className="sidebar-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? '×' : '☰'}</button>
      </div>
      {menuOpen && <nav aria-label="Main navigation">{visibleNav.map(([id, icon, label]) => <a className={route === id ? 'active' : ''} href={`#${id}`} key={id} onClick={() => setMenuOpen(false)}>{icon}<span>{label}</span></a>)}</nav>}
      {menuOpen && <div className="sidebar-footer"><div className="network-status"><i /> Local network <b>Online</b></div><small>© 2026 {shop.name || 'Game Zone'}<br />v1.0.0</small></div>}
    </aside>
    {route === 'dashboard' ? <DashboardContent /> : <ModuleContent route={route} />}
  </>
}

export default Dashboard
