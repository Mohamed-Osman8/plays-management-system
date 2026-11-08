import { useEffect, useId, useState } from 'react'
import { useApp } from '../context/useApp'
import { cancelStationSession, createMembership, createProduct, createSale, createStation, deleteProduct, deleteStation, getBookingSummary, getFinancialReports, getSessions, listMemberships, listProducts, pauseStationSession, recordMembershipPayment, reverseStationSession, resumeStationSession, stopStationSession, updateBooking, updateMembership, updateProduct, updateStationSessionPayment, updateStationStatus } from '../services/api'
import { formatBirr } from '../utils/currency'
import { getProductImage } from '../utils/productImage'
import { printReceipt } from '../utils/receipt'
import BrandMark from '../components/BrandMark'
import SubscriptionPayments from '../components/SubscriptionPayments'

const navItems = [['dashboard', '▦', 'Dashboard'], ['stations', '▣', 'Stations'], ['reservations', '▣', 'Reservations'], ['pos', '⊞', 'POS & Sales'], ['inventory', '◈', 'Inventory'], ['expenses', '↘', 'Expenses'], ['reports', '▤', 'Reports'], ['settings', '⚙', 'Settings']]

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

function getElapsedSessionSeconds(session, now) {
  if (!session?.startedAt) return Number(session?.elapsedSeconds || 0)
  const startedAt = new Date(session.startedAt).getTime()
  if (!Number.isFinite(startedAt)) return Number(session.elapsedSeconds || 0)
  const pausedAt = session.pausedAt ? new Date(session.pausedAt).getTime() : null
  const pausedTime = Number(session.pausedDurationMs || 0) + (pausedAt ? Math.max(0, now - pausedAt) : 0)
  return Math.max(0, Math.floor((now - startedAt - pausedTime) / 1000))
}

function formatElapsed(seconds) {
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function StationsOverview({ stations, onManage }) {
  const [now, setNow] = useState(() => Date.now())
  const counts = {
    total: stations.length,
    playing: stations.filter((station) => station.status === 'playing').length,
    available: stations.filter((station) => station.status === 'available').length,
    maintenance: stations.filter((station) => station.status === 'maintenance').length
  }

  useEffect(() => {
    if (!stations.some((station) => station.status === 'playing' && !station.session?.paused)) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [stations])

  return <section className="panel stations-overview-panel">
    <div className="panel-heading">
      <div><span className="eyebrow">Live floor plan</span><h3>Station overview</h3></div>
      <button className="button button-secondary" type="button" onClick={onManage}>Manage stations <span aria-hidden="true">→</span></button>
    </div>
    <div className="station-overview-grid">
      <div><strong>{counts.total}</strong><span>Total stations</span></div>
      <div className="station-count-playing"><strong>{counts.playing}</strong><span>Playing</span></div>
      <div className="station-count-available"><strong>{counts.available}</strong><span>Available</span></div>
      <div className="station-count-maintenance"><strong>{counts.maintenance}</strong><span>Maintenance</span></div>
    </div>
    {stations.length ? <div className="station-preview-grid">
      {stations.map((station) => {
        const session = station.session
        const elapsed = getElapsedSessionSeconds(session, now)
        const type = String(station.type || '').replace('PlayStation ', 'PS')
        const rate = Number(session?.ratePerMinute ?? Number(station.hourlyRate || 0) / 60)
        const state = session?.paused ? 'paused' : station.status
        const status = session?.paused ? 'Paused' : station.status === 'playing' ? 'Playing' : station.status === 'available' ? 'Available' : station.status === 'maintenance' ? 'Maintenance' : 'Reserved'
        return <button className={`station-preview-card station-${state}`} type="button" key={station.id} onClick={onManage} aria-label={`${station.name}, ${status}, open station management`}>
          <span className="station-preview-top"><strong>{station.name}</strong><span className={`status-pill ${state}`}>{status}</span></span>
          <span className="station-preview-screen"><span>{type}</span><strong>{station.status === 'playing' ? station.session?.customer || 'In session' : station.status === 'maintenance' ? 'Service required' : station.status === 'reserved' ? station.reservation?.customer || 'Reserved' : 'Ready to play'}</strong></span>
          <span className="station-preview-meta">{station.status === 'playing'
            ? <><b>{formatElapsed(elapsed)}</b><span>{formatBirr(elapsed / 60 * rate)}</span></>
            : <><span>{formatBirr(Number(station.hourlyRate || 0))} / hr</span><span>{station.status === 'maintenance' ? station.reason || 'Unavailable' : 'Open station'}</span></>}</span>
        </button>
      })}
    </div> : <div className="empty-state station-overview-empty">No stations are configured yet.</div>}
  </section>
}

function OperationsOverview({ pendingBookings, maintenanceStations, lowStock, onNavigate }) {
  const items = [
    { label: 'Pending reservations', count: pendingBookings, route: 'reservations', detail: 'Review customer requests' },
    { label: 'Stations in maintenance', count: maintenanceStations, route: 'stations', detail: 'Check the floor plan' },
    { label: 'Low-stock products', count: lowStock, route: 'inventory', detail: 'Review stock levels' }
  ]

  return <section className="panel operations-overview">
    <div className="panel-heading"><div><span className="eyebrow">Operational priorities</span><h3>Needs attention</h3></div></div>
    <div className="operations-list">{items.map((item) => <button type="button" key={item.route} onClick={() => onNavigate(item.route)}>
      <span className={item.count === null ? 'operation-count operation-count-unavailable' : item.count ? 'operation-count operation-count-active' : 'operation-count'}>{item.count === null ? '—' : item.count}</span>
      <span><strong>{item.label}</strong><small>{item.count === null ? 'Data unavailable' : item.count ? item.detail : 'All clear'}</small></span>
      <span aria-hidden="true">→</span>
    </button>)}</div>
  </section>
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
      </dl>
      {error && <small className="form-error" role="alert">{error}</small>}
      <div className="modal-actions station-detail-actions">
        {['available', 'reserved'].includes(station.status) && <button className="button button-primary" type="button" disabled={busy} onClick={start}>{busy ? 'Starting…' : 'Start session'}</button>}
        {station.status === 'playing' && <button className="button button-secondary" type="button" disabled={busy} onClick={() => onAction('pause', station)}>{paused ? 'Resume' : 'Pause'}</button>}
        {station.status === 'playing' && <button className="button button-secondary" type="button" disabled={busy} onClick={() => onAction('transfer', station)}>Change station</button>}
        {station.status === 'playing' && <button className="button button-danger" type="button" disabled={busy} onClick={() => onAction('end', station)}>End session</button>}
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
      if (kind === 'end') await endSession(station.id, '')
      if (kind === 'reverse') await reverseSession(station.id, reason)
      onClose()
    } catch (actionError) {
      setError(actionError.message || 'Unable to complete the session action.')
    } finally {
      setSubmitting(false)
    }
  }
  const labels = { transfer: ['Change station', 'Move the player to a free console. Session time and billing continue.'], extend: ['Extend fixed session', 'Add time before the countdown expires.'], pause: [station.session?.paused ? 'Resume session' : 'Pause session', 'Change the session state.'], cancel: ['Cancel session', 'Cancellation requires a reason and is added to the audit log.'], reopen: ['Reopen expired session', 'Reopen within the display grace window.'], end: ['End session', 'Close the session; payment remains unpaid until confirmed separately.'], reverse: ['Reverse payment', 'Reverse a completed session.'] }
  return <Modal title={labels[kind][0]} eyebrow={labels[kind][1]} onClose={onClose}><form className="modal-form" onSubmit={submit}>{kind === 'transfer' && <label>Free destination station<select value={target} onChange={(event) => setTarget(event.target.value)} required disabled={!available.length}>{available.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.type}</option>)}</select>{!available.length && <small className="form-error">No free stations are available right now.</small>}</label>}{['extend', 'reopen'].includes(kind) && <label>{kind === 'extend' ? 'Additional minutes' : 'Reopen for minutes'}<input type="number" min="1" max="240" value={minutes} onChange={(event) => setMinutes(event.target.value)} required /></label>}{kind === 'cancel' && <label>Cancellation reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} required placeholder="Enter why this session is being cancelled..." /></label>}{error && <small className="form-error" role="alert">{error}</small>}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={submitting}>← Back</button><button className="button button-primary" type="submit" disabled={submitting || (kind === 'transfer' && !available.length)}>{submitting ? 'Saving…' : kind === 'cancel' ? 'Cancel session' : kind === 'transfer' ? 'Transfer now' : kind === 'pause' && station.session?.paused ? 'Resume session' : kind === 'pause' ? 'Pause session' : kind === 'end' ? 'End session' : kind === 'reverse' ? 'Reverse payment' : 'Confirm'}</button></div></form></Modal>
}

function StationCard({ station, onAction, onView, onStatusChange, onDelete, canManageStations }) {
  const { startSession } = useApp()
  const [now, setNow] = useState(() => Date.now())
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const isPaused = station.session?.paused
  const type = String(station.type || '').toUpperCase().replace('PLAYSTATION ', 'PS')
  const normalizedType = ({ PS4: 'PlayStation 4', PS5: 'PlayStation 5', VIP: 'VIP', OTHER: 'Other' })[type] || type
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
  const elapsedSeconds = getElapsedSessionSeconds(station.session, now)
  const liveElapsed = station.session?.startedAt ? formatElapsed(elapsedSeconds) : station.session?.elapsed
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
  const statusText = isPaused ? 'Paused' : station.status === 'playing' ? 'Playing' : station.status === 'available' ? 'Available' : station.status === 'maintenance' ? 'Maintenance' : 'Reserved'
  const openDetails = () => onView?.(station)
  return <article className={`station-card station-card-interactive station-${station.status} ${isPaused ? 'station-paused' : ''}`} aria-label={`${station.name}, ${statusText}`} tabIndex={0} onClick={(event) => { if (!event.target.closest('button')) openDetails() }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDetails() } }}>
    <div className="station-card-head"><span className="station-id">{station.name}</span><span className={`status-pill ${statusClass}`}>{statusText}</span></div>
    <div className="station-screen">
      <span className="station-type">{normalizedType}</span>
      <strong>{station.status === 'playing' ? station.session?.customer : station.status === 'reserved' ? station.reservation?.customer || 'Reserved' : station.status === 'maintenance' ? 'Maintenance' : 'Ready to play'}</strong>
      {station.status === 'playing'
        ? <small className="station-session-live"><span>{liveElapsed || '00:00:00'}</span><b>{liveAmount || formatBirr(0)}</b></small>
        : <small>{station.status === 'maintenance' ? station.reason || 'Unavailable for service' : station.status === 'available' ? `${formatBirr(Number(station.hourlyRate || 0))} / hour` : station.reservation?.customer || 'Reserved'}</small>}
    </div>
    <button className="station-details-trigger" type="button" onClick={openDetails} aria-label={`Show details for ${station.name}`}>Station information & live details <span>→</span></button>
    {actionError && <small className="form-error" role="alert">{actionError}</small>}
    <div className="station-actions station-management-actions">
      {station.status === 'available' && <><button type="button" className="button button-primary" disabled={busy} onClick={() => start('Open')}>Start</button>{canManageStations && <><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('reserved')}>Reserve</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('maintenance')}>Maintenance</button></>}</>}
      {station.status === 'reserved' && <><button type="button" className="button button-primary" disabled={busy} onClick={() => start('Fixed')}>Start</button>{canManageStations && <><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('available')}>Available</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('maintenance')}>Maintenance</button></>}</>}
      {station.status === 'maintenance' && canManageStations && <><button type="button" className="button button-primary" disabled={busy} onClick={() => changeStatus('available')}>Set available</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('reserved')}>Reserve</button></>}
      {station.status === 'playing' && <><button type="button" className="button button-secondary" disabled={busy} onClick={() => onAction('pause', station)}>{isPaused ? 'Resume' : 'Pause'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => onAction('transfer', station)}>Change station</button><button type="button" className="button button-danger" disabled={busy} onClick={() => onAction('end', station)}>End</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => onAction('cancel', station)}>Cancel</button></>}
      {canManageStations && <button type="button" className="button button-danger" disabled={busy || station.status === 'playing'} onClick={runDelete}>Delete</button>}
    </div>
  </article>
}

function DashboardContent() {
  const { stations, bookingRequests, updateRemoteReservation, setRoute, role } = useApp()
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
    <section className="stats-grid"><StatCard label={`${selectedLabel} revenue`} value={metrics.report ? formatBirr(revenue) : metrics.loading ? 'Loading…' : 'Unavailable'} note="Paid sessions, sales, and memberships" /><StatCard label="Playing stations" value={`${activeStations}/${stations.length}`} note="Live from station and session records" tone="cyan" /><StatCard label="Low stock items" value={metrics.report ? lowStock.toLocaleString() : metrics.loading ? 'Loading…' : 'Unavailable'} note="Products at 5 units or below" tone="orange" /></section>
    <StationsOverview stations={stations} onManage={() => setRoute('stations')} />
    {bookingRequests.some((request) => request.status === 'Pending') && <section className="panel incoming-bookings"><div className="panel-heading"><div><span className="eyebrow">Customer portal</span><h3>Incoming remote bookings</h3></div><button className="text-button" type="button" onClick={() => setRoute('reservations')}>View all →</button></div>{bookingRequests.filter((request) => request.status === 'Pending').map((request) => <div className="incoming-booking-row" key={request.confirmation}><span><strong>{request.customerName}</strong><small>{request.phone} · {request.consoleType || request.stationName} · {request.date} at {request.arrivalTime}</small></span><span><button className="button button-primary" type="button" onClick={() => updateRemoteReservation(request, 'Confirmed')}>Confirm</button><button className="button button-danger" type="button" onClick={() => updateRemoteReservation(request, 'Cancelled')}>Cancel</button></span></div>)}</section>}
    <section className="dashboard-grid"><aside className="panel revenue-panel"><div className="panel-heading"><div><span className="eyebrow">Performance</span><h3>{selectedLabel} revenue</h3></div></div><div className="revenue-total"><strong>{metrics.report ? formatBirr(revenue) : metrics.loading ? 'Loading…' : 'Unavailable'}</strong><small>Realized revenue from paid records</small></div><AnalyticsChart buckets={buckets} /><div className="revenue-legend"><span><i className="dot lime" />Gaming <b>{formatBirr(gamingRevenue)}</b></span><span><i className="dot cyan" />Inventory <b>{formatBirr(inventoryRevenue)}</b></span><span><i className="dot purple" />Memberships <b>{formatBirr(membershipRevenue)}</b></span></div><div className="dashboard-hours"><div><span className="eyebrow">Completed play time</span><strong>{metrics.report ? `${Number(summary.playedHours || 0).toFixed(2)} hrs` : metrics.loading ? 'Loading…' : 'Unavailable'}</strong></div><PlayingHoursChart buckets={buckets} /></div></aside></section>
    <section className="lower-grid"><OperationsOverview pendingBookings={bookingRequests.filter((request) => request.status === 'Pending').length} maintenanceStations={stations.filter((station) => station.status === 'maintenance').length} lowStock={metrics.report ? lowStock : null} onNavigate={setRoute} /><div className="panel quick-panel"><span className="eyebrow">Quick actions</span><h3>What do you need?</h3><button type="button" onClick={() => setRoute('stations')}>▣ Open station floor plan <span>→</span></button><button type="button" onClick={() => setRoute('reservations')}>▣ Create reservation <span>→</span></button>{admin && <button type="button" onClick={() => setRoute('inventory')}>◈ Manage inventory <span>→</span></button>}<button type="button" onClick={() => setRoute('pos')}>＋ New sale <span>→</span></button>{admin && <button type="button" onClick={() => setRoute('reports')}>▤ Open reports <span>→</span></button>}</div></section><footer className="page-footer">PLAYSTATION GAME ZONE MANAGEMENT SYSTEM <span>MongoDB live data · {selectedLabel}</span><small>© 2026 {metrics.report?.shopName || 'Game Zone'}</small></footer></main>
}

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

function SessionHistory() {
  const { role } = useApp()
  const [sessions, setSessions] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [loading, setLoading] = useState(true)
  const refresh = () => getSessions().then((result) => setSessions(result.sessions || []))
    .catch((requestError) => { setError(requestError.message || 'Unable to load session history.'); throw requestError })
    .finally(() => setLoading(false))
  useEffect(() => { refresh().catch(() => {}) }, [])
  const perform = async (session, action) => {
    setBusy(`${session._id}-${action}`)
    setError('')
    try {
      if (action === 'payment') await updateStationSessionPayment(session._id, { paymentStatus: 'paid', paymentMethod })
      if (action === 'reverse') await reverseStationSession(session._id, {})
      await refresh()
    } catch (requestError) {
      setError(requestError.message || 'Session action failed.')
    } finally {
      setBusy('')
    }
  }
  const closedSessions = sessions.filter((session) => ['completed', 'reversed', 'cancelled'].includes(session.status))
  return <section className="panel session-history-panel">
    <div className="panel-heading"><div><span className="eyebrow">Station operations</span><h3>Session history</h3></div><button className="button button-secondary" type="button" disabled={loading} onClick={() => refresh().catch(() => {})}>Refresh history</button></div>
    <div className="session-history-payment"><span className="eyebrow">Payment method for explicit payment confirmation</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank">Bank</option><option value="membership">Membership</option><option value="other">Other</option></select></div>
    {error && <small className="form-error" role="alert">{error}</small>}
    {loading ? <div className="empty-state">Loading session history…</div> : <div className="table-panel"><TableHeader className="session-history-header" columns={['Station', 'Player', 'Ended', 'Duration', 'Revenue', 'Status', 'Payment', 'Action']} />{closedSessions.length ? closedSessions.map((session) => <div className="table-row session-history-row" key={session._id}><strong>{session.stationName}</strong><span>{session.customerName}{session.booking && <small>Reservation linked</small>}</span><span>{session.endedAt ? new Date(session.endedAt).toLocaleString() : '—'}</span><span>{Number(session.playedHours || 0).toFixed(2)} hrs</span><b>{formatBirr(Number(session.revenue || 0))}</b><span className={`status-pill ${session.status === 'reversed' || session.status === 'cancelled' ? 'maintenance' : 'available'}`}>{session.status}</span><span className={`status-pill ${session.paymentStatus === 'paid' ? 'available' : 'reserved'}`}>{session.paymentStatus || 'unpaid'}</span><span>{session.status === 'completed' && session.paymentStatus !== 'paid' && <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => perform(session, 'payment')}>Confirm payment</button>}{session.status === 'completed' && role === 'Owner/Admin' && <button className="text-button" type="button" disabled={Boolean(busy)} onClick={() => perform(session, 'reverse')}>Reverse</button>}{busy.startsWith(session._id) && <small>Saving…</small>}</span></div>) : <div className="empty-state">No completed session history is available.</div>}</div>}
  </section>
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

function Reports() {
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
  const completedSessions = Number(values.completedSessions ?? values.sessionCount ?? 0)
  const averageSessionMinutes = completedSessions > 0 ? hours * 60 / completedSessions : null
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
      <label>Reporting period<select value={period} onChange={(event) => { const nextPeriod = event.target.value; setError(''); setReport(null); setLoading(nextPeriod !== 'custom' || Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo)); setPeriod(nextPeriod) }}><option value="yesterday">Yesterday</option><option value="today">Today</option><option value="last-week">Last week</option><option value="this-week">This week</option><option value="last-month">Last month</option><option value="this-month">This month</option><option value="custom">Custom range</option></select></label>
      {period === 'custom' && <><label>From<input type="date" value={rangeFrom} max={rangeTo || undefined} onChange={(event) => { const nextRange = { ...range, from: event.target.value }; setRange(nextRange); setReport(null); setError(''); setLoading(Boolean(nextRange.from && nextRange.to && nextRange.from <= nextRange.to)) }} required /></label><label>To<input type="date" value={rangeTo} min={rangeFrom || undefined} onChange={(event) => { const nextRange = { ...range, to: event.target.value }; setRange(nextRange); setReport(null); setError(''); setLoading(Boolean(nextRange.from && nextRange.to && nextRange.from <= nextRange.to)) }} required /></label></>}
      <button className="button button-primary" type="button" onClick={exportCsv} disabled={!report}>Export CSV</button>
    </section>
    {error && <small className="form-error" role="alert">{error}</small>}
    {loading && <p className="report-loading">Loading report…</p>}
    <div className="stats-grid report-stats"><StatCard label="Realized revenue" value={report ? formatBirr(revenue) : loading ? 'Loading…' : 'Unavailable'} note={`Selected period · ${selectedPeriodLabel}`} /><StatCard label="Completed sessions" value={report ? completedSessions.toLocaleString() : loading ? 'Loading…' : 'Unavailable'} note="Completed, non-cancelled sessions" tone="cyan" /><StatCard label="Average session" value={report ? averageSessionMinutes === null ? '—' : `${averageSessionMinutes.toFixed(0)} min` : loading ? 'Loading…' : 'Unavailable'} note={completedSessions ? 'Across completed sessions' : 'No completed sessions in range'} tone="purple" /><StatCard label="Playing hours" value={report ? hours.toFixed(2) : loading ? 'Loading…' : 'Unavailable'} note="Completed session duration" tone="orange" /></div>
    <section className="report-visual-grid">
      <div className="panel analytics-chart-panel analytics-chart-featured"><div className="panel-heading"><div><span className="eyebrow">Revenue trend</span><h3>Realized revenue by period</h3></div><span className="report-date-range">{report?.range?.start ? `${new Date(report.range.start).toLocaleDateString()} – ${new Date(report.range.end).toLocaleDateString()}` : selectedPeriodLabel}</span></div>{report ? <AnalyticsChart buckets={buckets} /> : <div className="empty-state">{loading ? 'Loading revenue data…' : 'Revenue data is unavailable.'}</div>}</div>
      <div className="panel analytics-chart-panel"><div className="panel-heading"><div><span className="eyebrow">Session performance</span><h3>Playing hours by period</h3></div></div>{report ? <AnalyticsChart buckets={buckets} metric="hours" /> : <div className="empty-state">{loading ? 'Loading session data…' : 'Session data is unavailable.'}</div>}</div>
      <div className="panel analytics-chart-panel"><div className="panel-heading"><div><span className="eyebrow">Session volume</span><h3>Completed sessions by period</h3></div></div>{report ? <SessionBucketsChart buckets={buckets} /> : <div className="empty-state">{loading ? 'Loading session data…' : 'Session data is unavailable.'}</div>}</div>
      <div className="panel analytics-chart-panel"><div className="panel-heading"><div><span className="eyebrow">Revenue composition</span><h3>Paid revenue categories</h3></div></div>{report ? <RevenueCategoryBreakdown summary={values} /> : <div className="empty-state">{loading ? 'Loading revenue data…' : 'Revenue data is unavailable.'}</div>}</div>
      <div className="panel analytics-chart-panel"><div className="panel-heading"><div><span className="eyebrow">Period comparison</span><h3>Revenue by reporting bucket</h3></div></div>{report ? <RevenueBucketsChart buckets={buckets} /> : <div className="empty-state">{loading ? 'Loading revenue data…' : 'Revenue data is unavailable.'}</div>}</div>
    </section>
    <section className="panel report-breakdown"><div className="panel-heading"><div><span className="eyebrow">Period breakdown</span><h3>{selectedPeriodLabel}</h3></div><span className="status-pill available">{report?.count ?? 0} records</span></div><div className="report-breakdown-grid"><span>Completed sessions <strong>{completedSessions}</strong></span><span>Inventory units sold <strong>{values.inventoryUnitsSold ?? 0}</strong></span><span>Payments received <strong>{report ? formatBirr(Number(values.paymentTotal ?? revenue)) : '—'}</strong></span><span>Inventory sales <strong>{report ? formatBirr(inventorySales) : '—'}</strong></span></div></section>
    <section className="panel report-table-panel"><div className="panel-heading"><div><span className="eyebrow">Detailed results</span><h3>Revenue & activity by {report?.range?.bucket || 'period'}</h3></div><span className="report-date-range">{report?.range?.start ? `${new Date(report.range.start).toLocaleDateString()} – ${new Date(report.range.end).toLocaleDateString()}` : ''}</span></div><div className="report-table-scroll"><table className="report-table"><thead><tr><th>Date / period</th><th>Total revenue</th><th>Gaming</th><th>Product sales</th><th>Memberships</th><th>Play hours</th><th>Sessions</th><th>Units sold</th></tr></thead><tbody>{buckets.map((bucket) => <tr key={bucket.date}><td>{formatBucketDate(bucket.date)}</td><td>{formatBirr(Number(bucket.revenue || 0))}</td><td>{formatBirr(Number(bucket.sessionRevenue || 0))}</td><td>{formatBirr(Number(bucket.inventorySales || 0))}</td><td>{formatBirr(Number(bucket.membershipRevenue || 0))}</td><td>{Number(bucket.playedHours || 0).toFixed(2)}</td><td>{bucket.completedSessions || 0}</td><td>{bucket.productUnitsSold || 0}</td></tr>)}</tbody></table>{!buckets.length && !loading && <div className="empty-state">{error ? 'Report data is unavailable.' : 'No activity was recorded for this period.'}</div>}</div></section>
    <div className="settings-grid"><div className="panel settings-card"><span className="eyebrow">Data source</span><h3>Verified financial records</h3><p>Revenue includes paid completed sessions, recorded product sales, and membership payments for the selected period. Cancelled and unpaid sessions are excluded from realized revenue.</p></div><div className="panel settings-card"><span className="eyebrow">Reporting limit</span><h3>Historical station utilization</h3><p>Station uptime history is not stored, so this report does not estimate historical utilization. Current station status remains available on the live floor plan.</p></div></div>
  </ModulePage>
}

function AnalyticsChart({ buckets, metric = 'revenue' }) {
  const gradientId = `report-area-${useId().replaceAll(':', '')}`
  const width = 900
  const height = 320
  const left = 76
  const right = 18
  const top = 22
  const bottom = 48
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const valueKey = metric === 'hours' ? 'playedHours' : 'revenue'
  const label = metric === 'hours' ? 'Playing hours' : 'Revenue'
  const values = buckets.map((bucket) => Number(bucket[valueKey] || 0))
  const maxValue = Math.max(1, ...values)
  const x = (index) => left + (buckets.length <= 1 ? chartWidth / 2 : index / (buckets.length - 1) * chartWidth)
  const y = (value) => top + chartHeight - Number(value || 0) / maxValue * chartHeight
  const points = buckets.map((bucket, index) => `${x(index)},${y(bucket[valueKey])}`).join(' ')
  const area = buckets.length
    ? `${left},${top + chartHeight} ${points} ${x(buckets.length - 1)},${top + chartHeight}`
    : ''
  const labelIndexes = [...new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1])]
  const formatValue = (value) => metric === 'hours' ? `${Number(value || 0).toFixed(2)} hrs` : formatBirr(Number(value || 0))
  const lineClass = metric === 'hours' ? 'analytics-hours-line' : 'analytics-revenue-line'
  const pointClass = metric === 'hours' ? 'analytics-hours-point' : 'analytics-revenue-point'

  return <div className={`analytics-chart analytics-chart-${metric}`}>
    <div className="analytics-chart-legend"><span><i className={`dot ${metric === 'hours' ? 'cyan' : 'lime'}`} />{label} · scale to {formatValue(maxValue)}</span></div>
    {buckets.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} by reporting period`}>
      <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={metric === 'hours' ? 'var(--cyan)' : 'var(--lime)'} stopOpacity=".2" /><stop offset="100%" stopColor={metric === 'hours' ? 'var(--cyan)' : 'var(--lime)'} stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((line) => {
        const lineY = top + line * chartHeight / 4
        const tickValue = maxValue * (4 - line) / 4
        return <g key={line}><line className="analytics-grid-line" x1={left} x2={width - right} y1={lineY} y2={lineY} /><text className="analytics-axis-label analytics-y-axis-label" x={left - 8} y={lineY + 4} textAnchor="end">{metric === 'hours' ? tickValue.toFixed(1) : new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(tickValue)}</text></g>
      })}
      <polygon className="analytics-revenue-area" points={area} style={{ fill: `url(#${gradientId})` }} />
      <polyline className={lineClass} points={points} />
      {buckets.map((bucket, index) => <circle className={pointClass} key={bucket.date} cx={x(index)} cy={y(bucket[valueKey])} r="4"><title>{new Date(bucket.date).toLocaleDateString()}: {formatValue(bucket[valueKey])}</title></circle>)}
      {labelIndexes.map((index) => <text className="analytics-axis-label" key={index} x={x(index)} y={height - 12} textAnchor={index === 0 ? 'start' : index === buckets.length - 1 ? 'end' : 'middle'}>{new Date(buckets[index].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>)}
    </svg> : <div className="empty-state">No trend data is available for this period.</div>}
  </div>
}

function PlayingHoursChart({ buckets }) {
  return <AnalyticsChart buckets={buckets} metric="hours" />
}

function RevenueCategoryBreakdown({ summary }) {
  const categories = [
    { label: 'Gaming', value: Number(summary.sessionRevenue || 0), tone: 'lime' },
    { label: 'Products', value: Number(summary.inventorySales || 0), tone: 'cyan' },
    { label: 'Memberships', value: Number(summary.membershipRevenue || 0), tone: 'purple' }
  ]
  const scale = Math.max(1, ...categories.map(({ value }) => value))
  return <div className="category-chart" role="img" aria-label="Realized revenue by category">
    {categories.map((category) => <div className="category-chart-row" key={category.label}>
      <div><span>{category.label}</span><strong>{formatBirr(category.value)}</strong></div>
      <span className="category-chart-track"><i className={`category-chart-bar ${category.tone}`} style={{ width: `${category.value / scale * 100}%` }} /></span>
    </div>)}
  </div>
}

function RevenueBucketsChart({ buckets }) {
  const maxRevenue = Math.max(1, ...buckets.map((bucket) => Number(bucket.revenue || 0)))
  return buckets.length ? <div className="bucket-chart" role="img" aria-label="Realized revenue by reporting bucket">
    {buckets.map((bucket) => {
      const value = Number(bucket.revenue || 0)
      const label = new Date(bucket.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      return <div className="bucket-chart-column" key={bucket.date} title={`${label}: ${formatBirr(value)}`}>
        <strong>{formatBirr(value)}</strong><span className="bucket-chart-track"><i style={{ height: `${value / maxRevenue * 100}%` }} /></span><small>{label}</small>
      </div>
    })}
  </div> : <div className="empty-state">No revenue buckets are available for this period.</div>
}

function SessionBucketsChart({ buckets }) {
  const maxSessions = Math.max(1, ...buckets.map((bucket) => Number(bucket.completedSessions || 0)))
  return buckets.length ? <div className="bucket-chart session-bucket-chart" role="img" aria-label="Completed sessions by reporting bucket">
    {buckets.map((bucket) => {
      const count = Number(bucket.completedSessions || 0)
      const label = new Date(bucket.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      return <div className="bucket-chart-column" key={bucket.date} title={`${label}: ${count} completed sessions`}>
        <strong>{count}</strong><span className="bucket-chart-track"><i style={{ height: `${count / maxSessions * 100}%` }} /></span><small>{label}</small>
      </div>
    })}
  </div> : <div className="empty-state">No completed sessions are available for this period.</div>
}

function StationsManagement() {
  const { stations, refreshStations, role } = useApp()
  const isAdmin = role === 'Owner/Admin'
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
    {loading ? <div className="panel empty-state">Loading stations…</div> : stations.length ? <div className="station-grid station-management-grid">{stations.map((station) => <StationCard station={station} key={station.id} canManageStations={isAdmin} onView={(selected) => setModal({ kind: 'details', station: selected })} onAction={(kind, selected) => setModal({ kind, station: selected })} onStatusChange={isAdmin ? changeStatus : undefined} onDelete={isAdmin ? remove : undefined} />)}</div> : <div className="panel empty-state">{isAdmin ? 'No stations configured yet. Add stations from Settings.' : 'No stations are configured yet.'}</div>}
    <SessionHistory />
  </main>{modal?.kind === 'details' && selectedStation && <StationDetailsModal station={selectedStation} onClose={() => setModal(null)} onAction={(kind, selected) => setModal({ kind, station: selected })} onStatusChange={isAdmin ? changeStatus : undefined} />}{modal && modal.kind !== 'details' && <SessionModal station={selectedStation || modal.station} kind={modal.kind} onClose={() => setModal(null)} />}</>
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

function ModuleContent({ route, theme, onThemeChange }) {
  const { stations, products, expenses, credits, creditsLoading, creditsError, cart, hardware, remoteReservations, remoteReservationsLoading, remoteReservationsError, refreshBookings, refreshCustomerBalances, addExpense, addToCart, removeFromCart, addCredit, repayCredit, role, shop, updateRemoteReservation, createReservation, updateReservationPayment, startReservationSession, completeReservationSession, reportHardwareIssue } = useApp()
  const [modal, setModal] = useState(null)
  if (route === 'stations' || route === 'sessions') return <StationsManagement />
  if (route === 'memberships') return <Memberships />
  if (route === 'inventory') return role === 'Owner/Admin' ? <Inventory initialProducts={products} /> : <ModulePage title="Inventory" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Cashiers can sell stocked items in POS. Product and stock management is reserved for administrators.</p></div></ModulePage>
  if (route === 'pos') return <><POS products={products} addToCart={addToCart} removeFromCart={removeFromCart} cart={cart} setModal={setModal} />{modal && <CheckoutModal onClose={() => setModal(null)} gamingCharge={0} />}</>
  if (route === 'reservations' || route === 'remote-booking') return <RemoteBooking bookings={remoteReservations} bookingsLoading={remoteReservationsLoading} bookingsError={remoteReservationsError} refreshBookings={refreshBookings} stations={stations} shop={shop} role={role} credits={credits} creditsLoading={creditsLoading} creditsError={creditsError} refreshCustomerBalances={refreshCustomerBalances} addCredit={addCredit} repayCredit={repayCredit} updateRemoteReservation={updateRemoteReservation} createReservation={createReservation} updateReservationPayment={updateReservationPayment} startReservationSession={startReservationSession} completeReservationSession={completeReservationSession} />
  if (route === 'hardware') return <HardwareHealth hardware={hardware} reportHardwareIssue={reportHardwareIssue} />
  if (route === 'expenses') return <Expenses expenses={expenses} addExpense={addExpense} />
  if (route === 'reports') return role === 'Owner/Admin' ? <Reports /> : <ModulePage title="Reports" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Financial reporting is available to administrators only.</p></div></ModulePage>
  if (route === 'settings') return role === 'Owner/Admin' ? <><SubscriptionPayments /><Settings theme={theme} onThemeChange={onThemeChange} /></> : <ModulePage title="Settings" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Cashier/Staff accounts can operate stations, sessions, reservations, POS, inventory, and expenses, but cannot change pricing or sensitive settings.</p></div></ModulePage>
  return <ModulePage title="Reports & exports" eyebrow="Revenue, expenses, staff performance, and audit records." />
}

function StationSettings() {
  const { refreshStations } = useApp()
  const [form, setForm] = useState({ name: '', type: 'PlayStation 5', hourlyRate: '' })
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const add = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const station = { name: form.name.trim(), type: form.type }
      if (form.hourlyRate !== '') station.hourlyRate = Number(form.hourlyRate)
      await createStation(station)
    } catch (requestError) {
      setError(requestError.message || 'Unable to add station.')
      setSaving(false)
      return
    }
    setForm({ name: '', type: 'PlayStation 5', hourlyRate: '' })
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
        <label>Console type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} disabled={saving}><option>PlayStation 5</option><option>PlayStation 4</option><option>VIP</option><option>Other</option></select></label>
        <details className="settings-advanced">
          <summary>Advanced settings</summary>
          <label>Station hourly rate (ETB, optional)<input type="number" min="0" step="0.01" value={form.hourlyRate} onChange={(event) => setForm({ ...form, hourlyRate: event.target.value })} placeholder="Use the system default" disabled={saving} /></label>
          <small className="station-create-note">Leave blank to use the server's default station rate. New stations start as available.</small>
        </details>
        {error && <small className="form-error" role="alert">{error}</small>}
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={() => { setModalOpen(false); setError('') }} disabled={saving}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add station'}</button>
        </div>
      </form>
    </Modal>}
  </>
}

function Settings({ theme = 'dark', onThemeChange }) {
  const { users, addUser, updateUser, deleteUser, user: currentUser, role, shop, saveShopSettings } = useApp()
  const [shopValues, setShopValues] = useState({
    name: shop.name || '',
    phone: shop.phone || '',
    address: shop.address || '',
    rates: { ...shop.rates },
    bookingSettings: { ...shop.bookingSettings },
    notificationSettings: {
      bookingRequestsEmail: shop.notificationSettings?.bookingRequestsEmail !== false,
      bookingUpdatesEmail: shop.notificationSettings?.bookingUpdatesEmail !== false
    }
  })
  const [durationInput, setDurationInput] = useState((shop.bookingSettings?.durationOptionsMinutes || [30, 60, 90, 120]).join(', '))
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'Cashier', pin: '' })
  const [userError, setUserError] = useState('')
  const [userSaving, setUserSaving] = useState(false)
  const [shopError, setShopError] = useState('')
  const [shopSaved, setShopSaved] = useState(false)
  const [shopSaving, setShopSaving] = useState(false)
  const [appearanceSaved, setAppearanceSaved] = useState(false)
  useEffect(() => {
    setShopValues({
      name: shop.name || '',
      phone: shop.phone || '',
      address: shop.address || '',
      rates: { ps4: 0, ps5: 0, vip: 0, other: 0, ...shop.rates },
      bookingSettings: {
        openTime: shop.bookingSettings?.openTime || '09:00',
        closeTime: shop.bookingSettings?.closeTime || '23:00',
        timeZone: shop.bookingSettings?.timeZone || 'Africa/Addis_Ababa',
        slotIntervalMinutes: shop.bookingSettings?.slotIntervalMinutes || 30,
        durationOptionsMinutes: shop.bookingSettings?.durationOptionsMinutes || [30, 60, 90, 120]
      },
      notificationSettings: {
        bookingRequestsEmail: shop.notificationSettings?.bookingRequestsEmail !== false,
        bookingUpdatesEmail: shop.notificationSettings?.bookingUpdatesEmail !== false
      }
    })
    setDurationInput((shop.bookingSettings?.durationOptionsMinutes || [30, 60, 90, 120]).join(', '))
  }, [shop])
  const submitShop = async (event) => {
    event.preventDefault()
    setShopError('')
    setShopSaved(false)
    if (shopValues.name.trim().length < 2 || shopValues.name.trim().length > 120) {
      setShopError('Shop name must contain 2 to 120 characters.')
      return
    }
    if (shopValues.phone.trim().length > 30 || shopValues.address.trim().length > 240) {
      setShopError('Phone must be 30 characters or fewer and address must be 240 characters or fewer.')
      return
    }
    const rates = Object.fromEntries(Object.entries(shopValues.rates).map(([key, value]) => [key, Number(value)]))
    if (Object.values(rates).some((rate) => !Number.isFinite(rate) || rate < 0)) {
      setShopError('All hourly rates must be valid non-negative amounts.')
      return
    }
    const { openTime, closeTime, timeZone, slotIntervalMinutes } = shopValues.bookingSettings
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(closeTime) ||
      closeTime <= openTime) {
      setShopError('Closing time must be after a valid opening time.')
      return
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format(new Date())
    } catch {
      setShopError('Enter a valid IANA time zone, such as Africa/Addis_Ababa.')
      return
    }
    if (!Number.isInteger(Number(slotIntervalMinutes)) || Number(slotIntervalMinutes) < 5 || Number(slotIntervalMinutes) > 240) {
      setShopError('Booking interval must be a whole number from 5 to 240 minutes.')
      return
    }
    const durationTokens = durationInput.split(',').map((value) => value.trim())
    const durations = durationTokens.map(Number)
    if (durationTokens.length < 1 || durationTokens.length > 12 ||
      durationTokens.some((value, index) => !/^\d+$/.test(value) || durations[index] < 5 || durations[index] > 720)) {
      setShopError('Provide 1 to 12 booking durations as whole numbers from 5 to 720 minutes.')
      return
    }
    setShopSaving(true)
    try {
      await saveShopSettings({
        ...shopValues,
        name: shopValues.name.trim(),
        phone: shopValues.phone.trim(),
        address: shopValues.address.trim(),
        rates,
        bookingSettings: {
          ...shopValues.bookingSettings,
          slotIntervalMinutes: Number(slotIntervalMinutes),
          durationOptionsMinutes: [...new Set(durations)].sort((a, b) => a - b)
        }
      })
      setShopSaved(true)
    } catch (error) {
      setShopError(error.message || 'Unable to save shop settings.')
    } finally {
      setShopSaving(false)
    }
  }
  const submitUser = async (event) => {
    event.preventDefault()
    setUserError('')
    if (userForm.name.trim().length < 2 || userForm.name.trim().length > 100) return setUserError('Name must contain 2 to 100 characters.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userForm.email.trim())) return setUserError('Enter a valid email address.')
    if (!/^\d{6}$/.test(userForm.pin)) return setUserError('PIN must contain exactly 6 digits.')
    if (users.some((managedUser) => managedUser.email.toLowerCase() === userForm.email.trim().toLowerCase())) return setUserError('That email address is already assigned.')
    setUserSaving(true)
    try {
      await addUser({ ...userForm, name: userForm.name.trim(), email: userForm.email.trim().toLowerCase() })
      setUserForm({ name: '', email: '', role: 'Cashier', pin: '' })
    } catch (error) {
      setUserError(error.message || 'Unable to create user.')
    } finally {
      setUserSaving(false)
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
  const removeUser = async (managedUser) => {
    if (!window.confirm(`Delete ${managedUser.name}?`)) return
    setUserError('')
    setUserSaving(true)
    try {
      await deleteUser(managedUser)
    } catch (error) {
      setUserError(error.message || 'Unable to delete user.')
    } finally {
      setUserSaving(false)
    }
  }
  return <ModulePage title="Settings" eyebrow="Configure your shop profile, operating rules, notifications, appearance, and staff access.">
    <nav className="settings-section-nav" aria-label="Settings sections">
      <button type="button" onClick={() => document.getElementById('settings-business')?.scrollIntoView({ behavior: 'smooth' })}>General &amp; business</button>
      <button type="button" onClick={() => document.getElementById('settings-hours')?.scrollIntoView({ behavior: 'smooth' })}>Operating hours</button>
      <button type="button" onClick={() => document.getElementById('settings-stations')?.scrollIntoView({ behavior: 'smooth' })}>Stations</button>
      <button type="button" onClick={() => document.getElementById('settings-pricing')?.scrollIntoView({ behavior: 'smooth' })}>Pricing &amp; rules</button>
      <button type="button" onClick={() => document.getElementById('settings-notifications')?.scrollIntoView({ behavior: 'smooth' })}>Notifications</button>
      <button type="button" onClick={() => document.getElementById('settings-appearance')?.scrollIntoView({ behavior: 'smooth' })}>Appearance</button>
      <button type="button" onClick={() => document.getElementById('settings-account')?.scrollIntoView({ behavior: 'smooth' })}>Account &amp; security</button>
    </nav>
    <form id="settings-shop" className="panel shop-settings-form settings-section" onSubmit={submitShop} aria-busy={shopSaving}>
      <div className="panel-heading"><div><span className="eyebrow">Shop configuration</span><h3>General &amp; business information</h3></div><span className="status-pill available">Admin only</span></div>
      <section id="settings-business" className="settings-form-section">
        <div className="settings-section-heading"><span className="eyebrow">General / Shop Profile</span><h3>Business information</h3><p>These details appear across the shop workspace and printed receipts.</p></div>
        <div className="form-grid">
          <label>Shop name<input value={shopValues.name} onChange={(event) => setShopValues({ ...shopValues, name: event.target.value })} maxLength="120" required /></label>
          <label>Business phone<input type="tel" value={shopValues.phone} onChange={(event) => setShopValues({ ...shopValues, phone: event.target.value })} maxLength="30" /></label>
          <label className="wide">Business / receipt address<textarea value={shopValues.address} onChange={(event) => setShopValues({ ...shopValues, address: event.target.value })} maxLength="240" /></label>
        </div>
      </section>
      <section id="settings-hours" className="settings-form-section">
        <div className="settings-section-heading"><span className="eyebrow">Operating Hours</span><h3>Shop schedule</h3><p>Booking availability uses the shop's local time zone.</p></div>
        <div className="form-grid">
          <label>Opening time<input type="time" value={shopValues.bookingSettings.openTime} onChange={(event) => setShopValues({ ...shopValues, bookingSettings: { ...shopValues.bookingSettings, openTime: event.target.value } })} required /></label>
          <label>Closing time<input type="time" value={shopValues.bookingSettings.closeTime} onChange={(event) => setShopValues({ ...shopValues, bookingSettings: { ...shopValues.bookingSettings, closeTime: event.target.value } })} required /></label>
          <label>Shop time zone<input value={shopValues.bookingSettings.timeZone} onChange={(event) => setShopValues({ ...shopValues, bookingSettings: { ...shopValues.bookingSettings, timeZone: event.target.value } })} placeholder="Africa/Addis_Ababa" required /></label>
        </div>
      </section>
      <section id="settings-pricing" className="settings-form-section">
        <div className="settings-section-heading"><span className="eyebrow">Pricing and Session Rules</span><h3>Rates &amp; booking rules</h3><p>Rates apply to new sessions and reservations; booking rules are also used by the public reservation form.</p></div>
        <div className="form-grid">
          <label>PS4 hourly rate<input type="number" min="0" step="0.01" value={shopValues.rates.ps4} onChange={(event) => setShopValues({ ...shopValues, rates: { ...shopValues.rates, ps4: event.target.value } })} required /></label>
          <label>PS5 hourly rate<input type="number" min="0" step="0.01" value={shopValues.rates.ps5} onChange={(event) => setShopValues({ ...shopValues, rates: { ...shopValues.rates, ps5: event.target.value } })} required /></label>
          <label>VIP hourly rate<input type="number" min="0" step="0.01" value={shopValues.rates.vip} onChange={(event) => setShopValues({ ...shopValues, rates: { ...shopValues.rates, vip: event.target.value } })} required /></label>
          <label>Other hourly rate<input type="number" min="0" step="0.01" value={shopValues.rates.other} onChange={(event) => setShopValues({ ...shopValues, rates: { ...shopValues.rates, other: event.target.value } })} required /></label>
          <label>Booking interval (minutes)<input type="number" min="5" max="240" step="1" value={shopValues.bookingSettings.slotIntervalMinutes} onChange={(event) => setShopValues({ ...shopValues, bookingSettings: { ...shopValues.bookingSettings, slotIntervalMinutes: event.target.value } })} required /></label>
          <label className="wide">Allowed booking durations (minutes, comma-separated)<input value={durationInput} onChange={(event) => setDurationInput(event.target.value)} placeholder="30, 60, 90, 120" required aria-describedby="booking-duration-help" /><small id="booking-duration-help">Enter 1 to 12 whole-minute options from 5 to 720.</small></label>
        </div>
      </section>
      <section id="settings-notifications" className="settings-form-section">
        <div className="settings-section-heading"><span className="eyebrow">Notifications</span><h3>Customer booking emails</h3><p>These preferences control the email notifications already supported by the booking workflow.</p></div>
        <div className="settings-check-list">
          <label><input type="checkbox" checked={shopValues.notificationSettings.bookingRequestsEmail} onChange={(event) => setShopValues({ ...shopValues, notificationSettings: { ...shopValues.notificationSettings, bookingRequestsEmail: event.target.checked } })} /> Send customer email when a reservation is created</label>
          <label><input type="checkbox" checked={shopValues.notificationSettings.bookingUpdatesEmail} onChange={(event) => setShopValues({ ...shopValues, notificationSettings: { ...shopValues.notificationSettings, bookingUpdatesEmail: event.target.checked } })} /> Send customer email when a reservation changes status or details</label>
        </div>
      </section>
      {shopError && <small className="form-error" role="alert">{shopError}</small>}
      {shopSaved && <small className="form-success" role="status">Settings saved successfully.</small>}
      <div className="settings-form-actions"><button className="button button-secondary" type="button" disabled={shopSaving} onClick={() => { setShopValues({ name: shop.name || '', phone: shop.phone || '', address: shop.address || '', rates: { ps4: 0, ps5: 0, vip: 0, other: 0, ...shop.rates }, bookingSettings: { openTime: shop.bookingSettings?.openTime || '09:00', closeTime: shop.bookingSettings?.closeTime || '23:00', timeZone: shop.bookingSettings?.timeZone || 'Africa/Addis_Ababa', slotIntervalMinutes: shop.bookingSettings?.slotIntervalMinutes || 30, durationOptionsMinutes: shop.bookingSettings?.durationOptionsMinutes || [30, 60, 90, 120] }, notificationSettings: { bookingRequestsEmail: shop.notificationSettings?.bookingRequestsEmail !== false, bookingUpdatesEmail: shop.notificationSettings?.bookingUpdatesEmail !== false } }); setDurationInput((shop.bookingSettings?.durationOptionsMinutes || [30, 60, 90, 120]).join(', ')); setShopError(''); setShopSaved(false) }}>{shopSaving ? 'Saving…' : 'Discard changes'}</button><button className="button button-primary" type="submit" disabled={shopSaving}>{shopSaving ? 'Saving settings…' : 'Save settings'}</button></div>
    </form>
    <section id="settings-stations" className="settings-section">
      <div className="settings-section-heading"><span className="eyebrow">Gaming floor</span><h3>Station configuration</h3></div>
      <StationSettings />
    </section>
    <section id="settings-appearance" className="settings-section panel settings-card">
      <div className="settings-section-heading"><span className="eyebrow">Appearance</span><h3>Workspace theme</h3><p>Theme preference is saved on this device.</p></div>
      <div className="appearance-controls" role="group" aria-label="Workspace theme">
        <button className={`button ${theme === 'dark' ? 'button-primary' : 'button-secondary'}`} type="button" aria-pressed={theme === 'dark'} onClick={() => { onThemeChange?.('dark'); setAppearanceSaved(true) }}>Dark</button>
        <button className={`button ${theme === 'light' ? 'button-primary' : 'button-secondary'}`} type="button" aria-pressed={theme === 'light'} onClick={() => { onThemeChange?.('light'); setAppearanceSaved(true) }}>Light</button>
      </div>
      {appearanceSaved && <small className="form-success" role="status">Appearance preference saved on this device.</small>}
    </section>
    <section id="settings-account" className="settings-section">
      <div className="settings-section-heading"><span className="eyebrow">Account and Security</span><h3>Account access</h3><p>Manage staff access using the existing secure account controls.</p></div>
      <div className="panel settings-card current-account-card"><span className="avatar" aria-hidden="true">{currentUser.split(' ').map((name) => name[0]).join('')}</span><span><strong>{currentUser}</strong><small>{role} · signed-in account</small></span><span className="status-pill available">Authenticated</span></div>
      <section id="settings-staff" className="settings-section user-management panel">
        <div className="panel-heading"><div><span className="eyebrow">Admin only</span><h3>Staff accounts &amp; security</h3></div><span className="status-pill available">{users.length} users</span></div>
        <form className="user-form" onSubmit={submitUser} aria-busy={userSaving}>
          <input placeholder="Full name" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} maxLength="100" required disabled={userSaving} />
          <input type="email" autoComplete="email" placeholder="Email address" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} required disabled={userSaving} />
          <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })} disabled={userSaving}><option>Cashier</option><option>Admin</option></select>
          <input inputMode="numeric" pattern="\d{6}" maxLength="6" placeholder="6-digit PIN" value={userForm.pin} onChange={(event) => setUserForm({ ...userForm, pin: event.target.value.replace(/\D/g, '') })} required disabled={userSaving} />
          <button className="button button-primary" type="submit" disabled={userSaving}>{userSaving ? 'Saving…' : 'Add user'}</button>
          {userError && <small className="form-error" role="alert">{userError}</small>}
        </form>
        <div className="user-list">{users.map((managedUser) => <div className="user-row" key={managedUser.id}>
          <span className="avatar">{managedUser.name.split(' ').map((name) => name[0]).join('')}</span>
          <span><strong>{managedUser.name}</strong><small>{managedUser.email}</small></span>
          <span className="status-pill">{managedUser.role}</span>
          {managedUser.name !== currentUser && <>
            <button className="button button-secondary edit-user-button" type="button" onClick={() => editUser(managedUser)}>Edit</button>
            <button className="button button-danger delete-user-button" type="button" disabled={userSaving} onClick={() => removeUser(managedUser)}>Delete</button>
          </>}
        </div>)}</div>
      </section>
    </section>
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

function CreditManagement({ credits, loading, loadError, refreshBalances, addCredit, repayCredit }) {
  const [form, setForm] = useState({ customer: '', phone: '', amount: '' })
  const [repaymentAmounts, setRepaymentAmounts] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (form.customer.trim().length < 2) {
      setError('Customer name must contain at least 2 characters.')
      return
    }
    if (!/^\+?[0-9 ]{7,18}$/.test(form.phone)) {
      setError('Enter a valid phone number using numbers only.')
      return
    }
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) {
      setError('Enter a balance amount greater than zero.')
      return
    }
    setBusy('create')
    try {
      await addCredit({ ...form, customer: form.customer.trim(), amount: Number(form.amount) })
      setForm({ customer: '', phone: '', amount: '' })
      setSuccess('Customer balance saved.')
    } catch (requestError) {
      setError(requestError.message || 'Unable to save the customer balance.')
    } finally {
      setBusy('')
    }
  }
  const submitRepayment = async (item) => {
    const remaining = Number((item.total - item.paid).toFixed(2))
    const amount = Number(repaymentAmounts[item.id] ?? Math.min(5, remaining))
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setError('Enter a payment greater than zero and no more than the remaining balance.')
      return
    }
    setError('')
    setSuccess('')
    setBusy(item.id)
    try {
      await repayCredit(item.id, amount)
      setSuccess(`Payment of ${formatBirr(amount)} recorded for ${item.customer}.`)
    } catch (requestError) {
      setError(requestError.message || 'Unable to record the customer payment.')
    } finally {
      setBusy('')
    }
  }
  return <section className="panel credit-management">
    <span className="eyebrow">Shop customer accounts</span>
    <h3>Customer balances</h3>
    <form className="credit-form" onSubmit={submit} aria-busy={busy === 'create'}>
      <label>Customer<input value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} maxLength="100" required disabled={Boolean(busy)} /></label>
      <label>Phone<input value={form.phone} onChange={(event) => { if (/^[0-9+ ]*$/.test(event.target.value)) setForm({ ...form, phone: event.target.value }) }} inputMode="tel" pattern="\+?[0-9 ]{7,18}" required disabled={Boolean(busy)} /></label>
      <label>Balance<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required disabled={Boolean(busy)} /></label>
      <button className="button button-secondary" type="submit" disabled={Boolean(busy)}>{busy === 'create' ? 'Saving…' : 'Add balance'}</button>
    </form>
    {error && <small className="form-error" role="alert">{error}</small>}
    {loadError && <div className="data-alert" role="alert"><span>{loadError}</span><button className="text-button" type="button" disabled={loading} onClick={() => refreshBalances().catch(() => {})}>{loading ? 'Retrying…' : 'Retry'}</button></div>}
    {success && <small className="form-success" role="status">{success}</small>}
    <div className="credit-list">{loading ? <div className="empty-state" aria-live="polite">Loading customer balances…</div> : credits.length ? credits.map((item) => {
      const remaining = Number((item.total - item.paid).toFixed(2))
      const payment = repaymentAmounts[item.id] ?? Math.min(5, remaining)
      return <div className="credit-row" key={item.id}>
        <span><strong>{item.customer}</strong><small>{item.phone} · {formatBirr(remaining)} remaining of {formatBirr(item.total)}</small></span>
        <label className="credit-payment">Payment<input type="number" min="0.01" max={remaining} step="0.01" value={payment} onChange={(event) => setRepaymentAmounts({ ...repaymentAmounts, [item.id]: event.target.value })} disabled={Boolean(busy) || remaining <= 0} /></label>
        <button className="text-button" type="button" disabled={Boolean(busy) || remaining <= 0} onClick={() => submitRepayment(item)}>{busy === item.id ? 'Saving…' : 'Record payment'}</button>
      </div>
    }) : <div className="empty-state">No customer balances recorded.</div>}</div>
  </section>
}

function RemoteBooking({ bookings, bookingsLoading, bookingsError, refreshBookings, stations, shop, role, credits, creditsLoading, creditsError, refreshCustomerBalances, addCredit, repayCredit, updateRemoteReservation, createReservation, updateReservationPayment, startReservationSession, completeReservationSession }) {
  const dateParts = new Intl.DateTimeFormat('en', {
    timeZone: shop.bookingSettings?.timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
  const localToday = `${dateValues.year}-${dateValues.month}-${dateValues.day}`
  const durations = shop.bookingSettings?.durationOptionsMinutes || [60]
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [calendarView, setCalendarView] = useState('day')
  const [filters, setFilters] = useState({ date: localToday, search: '', type: '', station: '', status: 'All' })
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ customerName: '', phone: '', customerEmail: '', stationId: stations[0]?.id || '', date: localToday, startTime: '', durationMinutes: Number(durations[0] || 60), status: 'Pending', notes: '' })
  const [editForm, setEditForm] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ paymentStatus: 'Unpaid', amountPaid: 0, paymentMethod: 'cash' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const availableStations = stations.filter((station) => station.status !== 'maintenance')
  const selectedStation = availableStations.find((station) => station.id === form.stationId)

  const loadSummary = async () => {
    setSummaryLoading(true)
    try {
      const result = await getBookingSummary()
      setSummary(result.summary)
      setSummaryError('')
    } catch (requestError) {
      setSummaryError(requestError.message || 'Unable to load reservation totals.')
    } finally {
      setSummaryLoading(false)
    }
  }
  useEffect(() => {
    refreshBookings().catch(() => {})
    refreshCustomerBalances({ showLoading: false }).catch(() => {})
    loadSummary()
    const timer = window.setInterval(loadSummary, 30000)
    return () => window.clearInterval(timer)
  }, [refreshBookings, refreshCustomerBalances])

  const visibleBookings = bookings.filter((booking) => {
    const bookingType = String(booking.consoleType || '').replace('PlayStation ', 'PS')
    const query = filters.search.trim().toLowerCase()
    let matchesDate = true
    if (calendarView === 'day') matchesDate = booking.date === filters.date
    if (calendarView === 'month') matchesDate = booking.date?.slice(0, 7) === filters.date.slice(0, 7)
    if (calendarView === 'week') {
      const selectedDate = new Date(`${filters.date}T12:00:00Z`)
      const mondayOffset = (selectedDate.getUTCDay() + 6) % 7
      selectedDate.setUTCDate(selectedDate.getUTCDate() - mondayOffset)
      const weekStart = `${selectedDate.getUTCFullYear()}-${String(selectedDate.getUTCMonth() + 1).padStart(2, '0')}-${String(selectedDate.getUTCDate()).padStart(2, '0')}`
      const weekEndDate = new Date(selectedDate)
      weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6)
      const weekEnd = `${weekEndDate.getUTCFullYear()}-${String(weekEndDate.getUTCMonth() + 1).padStart(2, '0')}-${String(weekEndDate.getUTCDate()).padStart(2, '0')}`
      matchesDate = booking.date >= weekStart && booking.date <= weekEnd
    }
    return matchesDate &&
      (!filters.type || bookingType === filters.type) &&
      (!filters.station || booking.stationName === filters.station || String(booking.station) === filters.station) &&
      (filters.status === 'All' || booking.status === filters.status) &&
      (!query || `${booking.customerName} ${booking.phone} ${booking.confirmation}`.toLowerCase().includes(query))
  })

  const runAction = async (booking, action, callback) => {
    setBusy(`${booking.id}-${action}`)
    setError('')
    setSuccess('')
    try {
      await callback()
      await loadSummary()
      if (selected?.id === booking.id) {
        const refreshed = (await refreshBookings()).find((item) => (item._id || item.id) === booking.id)
        if (refreshed) setSelected({ ...refreshed, id: refreshed._id || refreshed.id })
      }
      setSuccess(`Reservation ${booking.confirmation} updated.`)
    } catch (requestError) {
      setError(requestError.message || 'Unable to update reservation.')
    } finally {
      setBusy('')
    }
  }

  const submitCreate = async (event) => {
    event.preventDefault()
    if (!selectedStation) return setError('Select a gaming station.')
    setBusy('create')
    setError('')
    setSuccess('')
    try {
      const type = selectedStation.type.replace('PlayStation ', 'PS')
      const result = await createReservation({ ...form, consoleType: type })
      setSuccess(`Reservation created. Reference: ${result.booking.confirmation}`)
      setShowCreate(false)
      setForm({ customerName: '', phone: '', customerEmail: '', stationId: availableStations[0]?.id || '', date: localToday, startTime: '', durationMinutes: Number(durations[0] || 60), status: 'Pending', notes: '' })
      await loadSummary()
    } catch (requestError) {
      setError(requestError.message || 'Unable to create reservation.')
    } finally {
      setBusy('')
    }
  }

  const openDetails = (booking) => {
    setSelected({ ...booking, id: booking._id || booking.id })
    setEditing(false)
    setEditForm({
      customerName: booking.customerName,
      phone: booking.phone,
      customerEmail: booking.customerEmail || '',
      stationId: String(booking.station),
      date: booking.date,
      startTime: booking.arrivalTime,
      durationMinutes: booking.durationMinutes,
      consoleType: booking.consoleType,
      notes: booking.notes || ''
    })
    setPaymentForm({ paymentStatus: booking.paymentStatus || 'Unpaid', amountPaid: booking.amountPaid || 0, paymentMethod: booking.paymentMethod || 'cash' })
    setError('')
  }

  const submitEdit = async (event) => {
    event.preventDefault()
    setBusy('edit')
    setError('')
    try {
      await updateBooking(selected.id, editForm)
      const refreshed = (await refreshBookings()).find((item) => String(item._id || item.id) === selected.id)
      if (refreshed) openDetails({ ...refreshed, id: refreshed._id || refreshed.id })
      setEditing(false)
      setSuccess('Reservation details saved.')
      await loadSummary()
    } catch (requestError) {
      setError(requestError.message || 'Unable to save reservation changes.')
    } finally {
      setBusy('')
    }
  }

  const submitPayment = async (event) => {
    event.preventDefault()
    setBusy('payment')
    setError('')
    try {
      await updateReservationPayment(selected, {
        ...paymentForm,
        amountPaid: Number(paymentForm.amountPaid)
      })
      const refreshed = (await refreshBookings()).find((item) => String(item._id || item.id) === selected.id)
      if (refreshed) openDetails({ ...refreshed, id: refreshed._id || refreshed.id })
      setSuccess('Reservation payment status saved.')
      await loadSummary()
    } catch (requestError) {
      setError(requestError.message || 'Unable to save payment status.')
    } finally {
      setBusy('')
    }
  }

  const bookingTypeOptions = [...new Set(bookings.map((booking) => String(booking.consoleType || '').replace('PlayStation ', 'PS')))]
  const payableTotal = selected ? Number(selected.finalPrice ?? selected.totalPrice ?? 0) : 0
  const statusTone = (status) => status === 'Confirmed' || status === 'Completed' ? 'available'
    : status === 'Cancelled' || status === 'No Show' ? 'maintenance'
      : status === 'In Progress' ? 'playing' : 'reserved'

  return <ModulePage title="Reservation management" eyebrow="Bookings, station availability, walk-ins, session links, and payment status.">
    <div className="reservation-dashboard">
      {summaryError && <div className="data-alert reservation-load-error" role="alert"><span>{summaryError}</span><button className="text-button" type="button" disabled={summaryLoading} onClick={loadSummary}>{summaryLoading ? 'Retrying…' : 'Retry totals'}</button></div>}
      <div className="reservation-metrics">
        <StatCard label="Today" value={summary ? summary.today : summaryLoading ? 'Loading…' : 'Unavailable'} note="Scheduled reservations" />
        <StatCard label="Upcoming" value={summary ? summary.upcoming : summaryLoading ? 'Loading…' : 'Unavailable'} note="Future bookings" tone="cyan" />
        <StatCard label="Pending" value={summary ? summary.pending : summaryLoading ? 'Loading…' : 'Unavailable'} note="Awaiting confirmation" tone="orange" />
        <StatCard label="Active sessions" value={summary ? summary.active : summaryLoading ? 'Loading…' : 'Unavailable'} note="Linked reservation sessions" tone="purple" />
        <StatCard label="Completed" value={summary ? summary.completed : summaryLoading ? 'Loading…' : 'Unavailable'} note="Finished reservations" />
        <StatCard label="Paid revenue" value={summary ? formatBirr(summary.reservationRevenue) : summaryLoading ? 'Loading…' : 'Unavailable'} note="Paid, non-refunded reservation amounts" tone="cyan" />
        <StatCard label="Cancelled" value={summary ? summary.cancelled : summaryLoading ? 'Loading…' : 'Unavailable'} note="Cancelled and no-show bookings" tone="orange" />
      </div>
      <section className="panel reservation-calendar">
        <div className="panel-heading reservation-toolbar-heading">
          <div><span className="eyebrow">Shop schedule</span><h3>Reservations calendar</h3></div>
          <button className="button button-primary" type="button" onClick={() => { setError(''); setShowCreate(true) }}>+ New reservation</button>
        </div>
        <div className="reservation-filters">
          <div className="view-switch" role="group" aria-label="Calendar view">
            {['day', 'week', 'month'].map((view) => <button className={calendarView === view ? 'active' : ''} type="button" key={view} onClick={() => setCalendarView(view)}>{view[0].toUpperCase() + view.slice(1)}</button>)}
          </div>
          <label>Reference, customer or phone<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search reservations" /></label>
          <label>Date<input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} /></label>
          <label>Type<select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">All types</option>{bookingTypeOptions.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
          <label>Station<select value={filters.station} onChange={(event) => setFilters({ ...filters, station: event.target.value })}><option value="">All stations</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
          <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option>All</option>{['Pending', 'Confirmed', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show'].map((status) => <option key={status}>{status}</option>)}</select></label>
        </div>
        {bookingsError && <div className="data-alert reservation-load-error" role="alert"><span>{bookingsError}</span><button className="text-button" type="button" disabled={bookingsLoading} onClick={() => refreshBookings().catch(() => {})}>{bookingsLoading ? 'Retrying…' : 'Retry reservations'}</button></div>}
        <div className="table-panel reservation-table">
          <TableHeader columns={['Reference / Customer', 'Station', 'Date & time', 'Duration', 'Estimate', 'Payment', 'Status', 'Actions']} />
          {bookingsLoading && !bookings.length ? <div className="empty-state">Loading reservations…</div> : bookingsError && !bookings.length ? <div className="empty-state">Reservations could not be loaded. Use retry to try again.</div> : visibleBookings.length ? visibleBookings.map((booking) => <div className="table-row managed-reservation-row" key={booking.id} onDoubleClick={() => openDetails(booking)}>
            <button type="button" className="reservation-reference" onClick={() => openDetails(booking)}><strong>{booking.confirmation}</strong><small>{booking.customerName} · {booking.phone}</small></button>
            <span>{booking.stationName}<small>{booking.consoleType}</small></span>
            <span>{booking.date}<small>{booking.arrivalTime} · {booking.timeZone || ''}</small></span>
            <span>{booking.durationMinutes} min</span>
            <b>{formatBirr(Number(booking.finalPrice ?? booking.totalPrice ?? 0))}</b>
            <span>{booking.paymentStatus || 'Unpaid'}<small>{formatBirr(Number(booking.amountPaid || 0))} paid</small></span>
            <span className={`status-pill ${statusTone(booking.status)}`}>{booking.status}</span>
            <span className="reservation-row-actions">
              <button className="text-button" type="button" onClick={() => openDetails(booking)}>Details</button>
              {booking.status === 'Pending' && <button className="text-button" disabled={Boolean(busy)} type="button" onClick={() => runAction(booking, 'confirm', () => updateRemoteReservation(booking, 'Confirmed'))}>Confirm</button>}
              {['Pending', 'Confirmed', 'Checked In'].includes(booking.status) && <button className="text-button" disabled={Boolean(busy)} type="button" onClick={() => runAction(booking, 'cancel', () => updateRemoteReservation(booking, 'Cancelled'))}>Cancel</button>}
              {booking.status === 'Confirmed' && <button className="text-button" disabled={Boolean(busy)} type="button" onClick={() => runAction(booking, 'check-in', () => updateRemoteReservation(booking, 'Checked In'))}>Check in</button>}
              {['Confirmed', 'Checked In'].includes(booking.status) && <button className="text-button" disabled={Boolean(busy)} type="button" onClick={() => runAction(booking, 'no-show', () => updateRemoteReservation(booking, 'No Show'))}>No show</button>}
              {booking.status === 'Checked In' && <button className="text-button" disabled={Boolean(busy)} type="button" onClick={() => runAction(booking, 'start', () => startReservationSession(booking))}>Start session</button>}
              {booking.status === 'In Progress' && <button className="text-button" disabled={Boolean(busy)} type="button" onClick={() => runAction(booking, 'complete', () => completeReservationSession(booking))}>Complete</button>}
            </span>
          </div>) : <div className="reservation-empty-state">{bookings.length ? 'No reservations match these filters.' : 'No reservations have been recorded.'}</div>}
        </div>
        {error && !selected && <small className="form-error" role="alert">{error}</small>}
        {success && <small className="form-success" role="status">{success}</small>}
      </section>
    </div>
      <CreditManagement credits={credits} loading={creditsLoading} loadError={creditsError} refreshBalances={refreshCustomerBalances} addCredit={addCredit} repayCredit={repayCredit} />

    {showCreate && <Modal title="Create reservation" eyebrow="Manual or walk-in booking · server-checked availability" onClose={() => { if (!busy) setShowCreate(false) }}>
      <form className="modal-form reservation-editor" onSubmit={submitCreate}>
        <label>Customer name<input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required maxLength="100" /></label>
        <label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required inputMode="tel" /></label>
        <label>Email (optional)<input type="email" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} /></label>
        <label>Station<select value={form.stationId} onChange={(event) => setForm({ ...form, stationId: event.target.value })} required>{availableStations.map((station) => <option key={station.id} value={station.id}>{station.name} · {station.type}</option>)}</select></label>
        <label>Date<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
        <label>Start time<input type="time" step={Number(shop.bookingSettings?.slotIntervalMinutes || 30) * 60} value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required /></label>
        <label>Duration<select value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })}>{durations.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
        <label>Initial status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>Pending</option><option>Confirmed</option></select></label>
        <label className="wide">Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength="1000" /></label>
        {error && <small className="form-error" role="alert">{error}</small>}
        <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setShowCreate(false)} disabled={busy === 'create'}>Cancel</button><button className="button button-primary" type="submit" disabled={busy === 'create' || !availableStations.length}>{busy === 'create' ? 'Saving…' : 'Create reservation'}</button></div>
      </form>
    </Modal>}

    {selected && <Modal title={selected.confirmation} eyebrow={`${selected.status} · ${selected.stationName}`} onClose={() => { setSelected(null); setEditing(false); setError('') }}>
      <div className="reservation-detail-summary">
        <div><span>Customer</span><strong>{selected.customerName}</strong><small>{selected.phone}{selected.customerEmail ? ` · ${selected.customerEmail}` : ''}</small></div>
        <div><span>Schedule</span><strong>{selected.date} · {selected.arrivalTime}</strong><small>{selected.durationMinutes} minutes · {selected.timeZone}</small></div>
        <div><span>PlayStation</span><strong>{selected.consoleType} · {selected.stationName}</strong><small>{selected.hourlyRate} / hour</small></div>
        <div><span>{selected.finalPrice == null ? 'Estimated total' : 'Final charge'}</span><strong>{formatBirr(Number(selected.finalPrice ?? selected.totalPrice ?? 0))}</strong><small>{selected.paymentStatus} · {formatBirr(Number(selected.amountPaid || 0))} paid</small></div>
        {selected.notes && <div className="wide"><span>Notes</span><p>{selected.notes}</p></div>}
      </div>
      {error && <small className="form-error" role="alert">{error}</small>}
      <div className="reservation-detail-actions">
        {['Pending', 'Confirmed'].includes(selected.status) && <button className="button button-secondary" type="button" onClick={() => setEditing((current) => !current)}>{editing ? 'Close editor' : 'Edit details'}</button>}
        {selected.status === 'Pending' && <button className="button button-primary" disabled={Boolean(busy)} type="button" onClick={() => runAction(selected, 'confirm', () => updateRemoteReservation(selected, 'Confirmed'))}>Confirm</button>}
        {selected.status === 'Confirmed' && <button className="button button-primary" disabled={Boolean(busy)} type="button" onClick={() => runAction(selected, 'check-in', () => updateRemoteReservation(selected, 'Checked In'))}>Check in</button>}
        {['Confirmed', 'Checked In'].includes(selected.status) && <button className="button button-secondary" disabled={Boolean(busy)} type="button" onClick={() => runAction(selected, 'no-show', () => updateRemoteReservation(selected, 'No Show'))}>Mark no-show</button>}
        {selected.status === 'Checked In' && <button className="button button-primary" disabled={Boolean(busy)} type="button" onClick={() => runAction(selected, 'start', () => startReservationSession(selected))}>Start session</button>}
        {selected.status === 'In Progress' && <button className="button button-primary" disabled={Boolean(busy)} type="button" onClick={() => runAction(selected, 'complete', () => completeReservationSession(selected))}>Complete session</button>}
        {['Pending', 'Confirmed', 'Checked In'].includes(selected.status) && <button className="button button-danger" disabled={Boolean(busy)} type="button" onClick={() => runAction(selected, 'cancel', () => updateRemoteReservation(selected, 'Cancelled'))}>Cancel</button>}
      </div>
      {editing && <form className="modal-form reservation-editor" onSubmit={submitEdit}>
        <h3>Edit reservation</h3>
        <label>Customer name<input value={editForm.customerName} onChange={(event) => setEditForm({ ...editForm, customerName: event.target.value })} required /></label>
        <label>Phone<input value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} required inputMode="tel" /></label>
        <label>Email<input type="email" value={editForm.customerEmail} onChange={(event) => setEditForm({ ...editForm, customerEmail: event.target.value })} /></label>
        <label>Station<select value={editForm.stationId} onChange={(event) => setEditForm({ ...editForm, stationId: event.target.value, consoleType: availableStations.find((station) => station.id === event.target.value)?.type.replace('PlayStation ', 'PS') || editForm.consoleType })}>{availableStations.map((station) => <option key={station.id} value={station.id}>{station.name} · {station.type}</option>)}</select></label>
        <label>Date<input type="date" value={editForm.date} onChange={(event) => setEditForm({ ...editForm, date: event.target.value })} required /></label>
        <label>Start time<input type="time" value={editForm.startTime} onChange={(event) => setEditForm({ ...editForm, startTime: event.target.value })} required /></label>
        <label>Duration<select value={editForm.durationMinutes} onChange={(event) => setEditForm({ ...editForm, durationMinutes: Number(event.target.value) })}>{durations.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
        <label className="wide">Notes<textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} maxLength="1000" /></label>
        <div className="modal-actions"><button className="button button-primary" type="submit" disabled={busy === 'edit'}>{busy === 'edit' ? 'Saving…' : 'Save changes'}</button></div>
      </form>}
      <form className="reservation-payment-form" onSubmit={submitPayment}>
        <h3>Payment confirmation</h3>
        <label>Status<select value={paymentForm.paymentStatus} onChange={(event) => setPaymentForm({ ...paymentForm, paymentStatus: event.target.value, amountPaid: event.target.value === 'Paid' ? payableTotal : event.target.value === 'Unpaid' ? 0 : paymentForm.amountPaid })}><option>Unpaid</option><option>Partially Paid</option><option>Paid</option>{role === 'Owner/Admin' && <option>Refunded</option>}</select></label>
        <label>Amount paid<input type="number" min="0" max={payableTotal} step="0.01" value={paymentForm.amountPaid} onChange={(event) => setPaymentForm({ ...paymentForm, amountPaid: event.target.value })} disabled={paymentForm.paymentStatus === 'Unpaid' || paymentForm.paymentStatus === 'Refunded'} /></label>
        <label>Payment method<select value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value })}><option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="bank">Bank</option><option value="other">Other</option></select></label>
        <button className="button button-secondary" type="submit" disabled={busy === 'payment'}>{busy === 'payment' ? 'Saving…' : 'Save payment status'}</button>
      </form>
    </Modal>}
  </ModulePage>
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
function Dashboard({ theme, onThemeChange }) {
  const { route, role, shop, setRoute } = useApp()
  const [menuOpen, setMenuOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches)
  const admin = role === 'Owner/Admin'
  const restrictedForCashier = ['stations', 'inventory', 'reports', 'settings']
  const visibleNav = navItems.filter(([id]) => admin || !restrictedForCashier.includes(id))
  return <>
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-heading">
        <a className="sidebar-brand" href="#dashboard" onClick={(event) => { event.preventDefault(); setRoute('dashboard'); setMenuOpen(false) }}>
          <BrandMark />
          {menuOpen && <span>{shop.name || 'GAME ZONE'}<br /><b>MANAGEMENT</b></span>}
        </a>
        <button className="sidebar-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? '×' : '☰'}</button>
      </div>
      <nav aria-label="Main navigation">{visibleNav.map(([id, icon, label]) => <a className={route === id ? 'active' : ''} href={`#${id}`} key={id} title={menuOpen ? undefined : label} aria-label={label} aria-current={route === id ? 'page' : undefined} onClick={(event) => { event.preventDefault(); setRoute(id); setMenuOpen(false) }}><span className="sidebar-nav-icon" aria-hidden="true">{icon}</span><span>{label}</span></a>)}</nav>
      {menuOpen && <div className="sidebar-footer"><div className="network-status"><i /> Local network <b>Online</b></div><small>© 2026 {shop.name || 'Game Zone'}<br />v1.0.0</small></div>}
    </aside>
    {route === 'dashboard' ? <DashboardContent /> : <ModuleContent route={route} theme={theme} onThemeChange={onThemeChange} />}
  </>
}

export default Dashboard
