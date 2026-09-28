import { useEffect, useState } from 'react'
import { useApp } from '../context/useApp'
import { cancelStationSession, createMembership, createProduct, createSale, createStation, deleteProduct, deleteStation, getDashboardSummary, getFinancialReports, getSessions, listMemberships, listProducts, pauseStationSession, recordMembershipPayment, reverseStationSession, resumeStationSession, stopStationSession, updateMembership, updateProduct, updateStationStatus } from '../services/api'
import { formatBirr } from '../utils/currency'
import { getProductImage } from '../utils/productImage'

const navItems = [['dashboard', '▦', 'Dashboard'], ['sessions', '◷', 'Sessions'], ['stations', '▣', 'Stations'], ['reservations', '▣', 'Reservations'], ['remote-booking', '⌁', 'Remote booking'], ['hardware', '⚡', 'Hardware health'], ['pos', '⊞', 'POS & Sales'], ['inventory', '◈', 'Inventory'], ['memberships', '◎', 'Memberships'], ['expenses', '↘', 'Expenses'], ['reports', '▤', 'Reports'], ['settings', '⚙', 'Settings']]

function StatCard({ label, value, note, tone = 'lime' }) { return <div className={`stat-card stat-${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div> }

function Modal({ title, eyebrow, onClose, children }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal panel" role="dialog" aria-modal="true"><div className="modal-heading"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><button className="modal-close" type="button" onClick={onClose}>×</button></div>{children}</div></div>
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
    if ((kind === 'cancel' || (kind === 'pause' && !station.session?.paused) || kind === 'reverse') && !reason.trim()) {
      setError('A reason is required for this action.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      if (kind === 'transfer') transferSession(station.id, target, station.session)
      if (kind === 'extend') extendSession(station.id, minutes)
      if (kind === 'pause') await pauseSession(station.id, !station.session.paused, reason)
      if (kind === 'cancel') await cancelSession(station.id, reason)
      if (kind === 'reopen') reopenSession(station.id, station.session, minutes)
      if (kind === 'end') await endSession(station.id, reason || 'Final bill', paymentMethod)
      if (kind === 'reverse') await reverseSession(station.id, reason)
      onClose()
    } catch (actionError) {
      setError(actionError.message || 'Unable to complete the session action.')
    } finally {
      setSubmitting(false)
    }
  }
  const labels = { transfer: ['Transfer session', 'Choose an available station. Products and session details move with the player.'], extend: ['Extend fixed session', 'Add time before the countdown expires.'], pause: [station.session?.paused ? 'Resume session' : 'Pause session', 'A reason is required for the audit trail.'], cancel: ['Cancel session', 'Cancellation requires a reason and is added to the audit log.'], reopen: ['Reopen expired session', 'Reopen within the display grace window.'], end: ['End session', 'Review the session and close it for billing.'], reverse: ['Reverse payment', 'Reverse a completed session and record the reason.'] }
  return <Modal title={labels[kind][0]} eyebrow={labels[kind][1]} onClose={onClose}><form className="modal-form" onSubmit={submit}>{kind === 'transfer' && <label>Available station<select value={target} onChange={(event) => setTarget(event.target.value)} required>{available.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.type}</option>)}</select></label>}{['extend', 'reopen'].includes(kind) && <label>{kind === 'extend' ? 'Additional minutes' : 'Reopen for minutes'}<input type="number" min="1" max="240" value={minutes} onChange={(event) => setMinutes(event.target.value)} required /></label>}{['pause', 'cancel', 'end', 'reverse'].includes(kind) && <label>Reason{kind === 'end' ? ' (optional)' : ''}<textarea value={reason} onChange={(event) => setReason(event.target.value)} required={kind === 'cancel' || kind === 'reverse' || (kind === 'pause' && !station.session?.paused)} placeholder="Enter a clear reason..." /></label>}{kind === 'end' && <label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank">Bank</option><option value="membership">Membership</option><option value="other">Other</option></select></label>}{error && <small className="form-error" role="alert">{error}</small>}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={submitting}>Back</button><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : kind === 'cancel' ? 'Cancel session' : kind === 'transfer' ? 'Transfer now' : kind === 'pause' && station.session?.paused ? 'Resume session' : kind === 'pause' ? 'Pause session' : kind === 'end' ? 'End & bill' : kind === 'reverse' ? 'Reverse payment' : 'Confirm'}</button></div></form></Modal>
}

function StationCard({ station, onAction, management = false, onStatusChange, onDelete }) {
  const { startSession, setRoute } = useApp()
  const [now, setNow] = useState(Date.now())
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
    setNow(Date.now())
    if (station.status !== 'playing' || station.session?.paused || !station.session?.startedAt) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [station.status, station.session?.paused, station.session?.startedAt])
  const elapsedSeconds = station.session?.startedAt
    ? Math.max(0, Math.floor((now - new Date(station.session.startedAt).getTime() - Number(station.session.pausedDurationMs || 0) - (station.session.pausedAt ? now - new Date(station.session.pausedAt).getTime() : 0)) / 1000))
    : Number(station.session?.elapsedSeconds || 0)
  const liveElapsed = elapsedSeconds ? `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}` : station.session?.elapsed
  const rate = Number(station.session?.ratePerMinute ?? (normalizedType === 'PlayStation 5' ? 0.18 : 0.12))
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
  const statusText = station.status === 'playing' ? (isPaused ? 'Paused' : 'Playing') : station.status
  return <article className={`station-card station-${station.status} ${isPaused ? 'station-paused' : ''}`}>
    <div className="station-card-head"><span className="station-id">{station.name}</span><span className={`status-pill ${statusClass}`}>{statusText}</span></div>
    <div className="station-screen">
      <span className="station-type"><svg viewBox="0 0 40 30" aria-hidden="true"><rect x="2" y="2" width="36" height="22" rx="3" /><path d="M14 28h12M20 24v4" /></svg>{normalizedType}</span>
      <strong>{station.status === 'playing' ? station.session?.customer : station.status === 'reserved' ? station.reservation?.customer || 'Reserved' : station.status === 'maintenance' ? 'Maintenance' : 'Ready to play'}</strong>
      <small>{station.status === 'playing' ? `${liveElapsed || '00:00:00'} · ${liveAmount || formatBirr(0)}` : station.status === 'maintenance' ? station.reason || 'Unavailable for service' : 'No active session'}</small>
    </div>
    {actionError && <small className="form-error" role="alert">{actionError}</small>}
    {management ? <div className="station-actions station-management-actions">
      {station.status === 'available' && <><button type="button" className="button button-primary" disabled={busy} onClick={() => start('Open')}>Start</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('reserved')}>Reserve</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('maintenance')}>Maintenance</button></>}
      {station.status === 'reserved' && <><button type="button" className="button button-primary" disabled={busy} onClick={() => start('Fixed')}>Start</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('available')}>Available</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('maintenance')}>Maintenance</button></>}
      {station.status === 'maintenance' && <><button type="button" className="button button-primary" disabled={busy} onClick={() => changeStatus('available')}>Set available</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => changeStatus('reserved')}>Reserve</button></>}
      {station.status === 'playing' && <><button type="button" className="button button-secondary" disabled={busy} onClick={() => onAction('pause', station)}>{isPaused ? 'Resume' : 'Pause'}</button><button type="button" className="button button-danger" disabled={busy} onClick={() => onAction('end', station)}>End</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => onAction('cancel', station)}>Cancel</button></>}
      <button type="button" className="button button-danger" disabled={busy || station.status === 'playing'} onClick={runDelete}>Delete</button>
    </div> : <div className="station-actions">
      {station.status === 'available' && <button type="button" className="button button-primary" disabled={busy} onClick={() => start('Open')}>Start</button>}
      {station.status === 'playing' && <><button type="button" className="button button-secondary" onClick={() => onAction('pause', station)}>{isPaused ? 'Resume' : 'Pause'}</button><button type="button" className="button button-danger" onClick={() => onAction('end', station)}>End</button><button type="button" className="button button-secondary" onClick={() => onAction('cancel', station)}>Cancel</button></>}
      {station.status === 'reserved' && <button type="button" className="button button-primary" disabled={busy} onClick={() => start('Fixed')}>Start</button>}
      {station.status === 'maintenance' && <button type="button" className="button button-secondary" onClick={() => setRoute('stations')}>Manage</button>}
      <button type="button" className="button button-icon" aria-label="Manage stations" onClick={() => setRoute('stations')}>•••</button>
    </div>}
  </article>
}

function DashboardContent() {
  const { stations, auditLog, bookingRequests, updateRemoteReservation, setRoute, role } = useApp()
  const [period, setPeriod] = useState('today')
  const [modal, setModal] = useState(null)
  const [metrics, setMetrics] = useState({ report: null, products: [], loading: true, error: '' })

  useEffect(() => {
    let cancelled = false
    const end = new Date()
    const start = new Date(end)
    if (period === 'week') start.setUTCDate(start.getUTCDate() - 6)
    if (period === 'month') start.setUTCDate(start.getUTCDate() - 29)
    const filters = { period: 'custom', from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
    const refresh = async () => {
      try {
        const [report, productResult] = await Promise.all([getDashboardSummary(filters), listProducts()])
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
  const activeStations = stations.filter((station) => station.status === 'playing').length
  const lowStock = metrics.products.filter((product) => Number(product.stock) <= 5).length
  const buckets = (metrics.report?.buckets || []).slice(-7)
  const maxRevenue = Math.max(1, ...buckets.map((bucket) => Number(bucket.revenue || 0)))
  const admin = role === 'Owner/Admin'
  const selectedLabel = period === 'today' ? 'Today' : period === 'week' ? 'Last 7 days' : 'Last 30 days'

  return <main className="workspace"><div className="page-toolbar"><div><p className="breadcrumb">Dashboard / Overview</p><h2>Station overview</h2></div><div className="toolbar-actions"><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select>{admin && <button className="button button-primary" type="button" onClick={() => setRoute('pos')}>+ New sale</button>}</div></div>
    {metrics.error && <div className="data-alert" role="alert">{metrics.error}</div>}
    <section className="stats-grid"><StatCard label={`${selectedLabel} revenue`} value={metrics.loading && !metrics.report ? 'Loading…' : `${formatBirr(revenue)}`} note="Completed sessions, sales, and memberships" /><StatCard label="Active stations" value={`${activeStations}/${stations.length}`} note="Live from station records" tone="cyan" /><StatCard label="Sessions completed" value={metrics.loading && !metrics.report ? 'Loading…' : Number(summary.completedSessions || 0).toLocaleString()} note={`${Number(summary.playedHours || 0).toFixed(2)} playing hours`} tone="purple" /><StatCard label="Low stock items" value={metrics.loading && !metrics.report ? 'Loading…' : lowStock.toLocaleString()} note="Products at 5 units or below" tone="orange" /></section>
    {bookingRequests.some((request) => request.status === 'Pending approval') && <section className="panel incoming-bookings"><div className="panel-heading"><div><span className="eyebrow">Customer portal</span><h3>Incoming remote bookings</h3></div><button className="text-button" type="button" onClick={() => setRoute('remote-booking')}>View all →</button></div>{bookingRequests.filter((request) => request.status === 'Pending approval').map((request) => <div className="incoming-booking-row" key={request.confirmation}><span><strong>{request.customer}</strong><small>{request.phone} · {request.consoleType || request.stationId} · {request.date} at {request.time}</small></span><span><button className="button button-primary" type="button" onClick={() => updateRemoteReservation(request, 'Approved')}>Approve</button><button className="button button-danger" type="button" onClick={() => updateRemoteReservation(request, 'Rejected')}>Reject</button></span></div>)}</section>}
    <section className="dashboard-grid"><div className="panel stations-panel"><div className="panel-heading"><div><span className="eyebrow">Live floor plan</span><h3>Gaming stations <em>● Live</em></h3></div><button className="text-button" type="button" onClick={() => setRoute('sessions')}>View sessions →</button></div>{stations.length ? <div className="station-grid">{stations.map((station) => <StationCard station={station} key={station.id} onAction={(kind, selected) => setModal({ kind, station: selected })} />)}</div> : <div className="empty-state">No stations were returned by the server.</div>}</div>
      <aside className="panel revenue-panel"><div className="panel-heading"><div><span className="eyebrow">Performance</span><h3>{selectedLabel} revenue</h3></div></div><div className="revenue-total"><strong>{formatBirr(revenue)}</strong><small>Realized revenue from MongoDB</small></div><div className="chart"><div className="chart-bars">{buckets.map((bucket) => <div className="bar-group" key={bucket.date}><i style={{ height: `${Math.max(3, Number(bucket.revenue || 0) / maxRevenue * 100)}%` }} /><small>{new Date(bucket.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div>)}</div></div>{!buckets.length && <div className="empty-state">No revenue records in this period.</div>}<div className="revenue-legend"><span><i className="dot lime" />Gaming <b>{formatBirr(gamingRevenue)}</b></span><span><i className="dot cyan" />Inventory <b>{formatBirr(inventoryRevenue)}</b></span><span><i className="dot purple" />Memberships <b>{formatBirr(membershipRevenue)}</b></span></div></aside></section>
    <section className="lower-grid"><div className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">Current session</span><h3>Recent activity</h3></div></div>{auditLog.length ? <Activity entries={auditLog.slice(0, 5)} /> : <div className="empty-state">Activity from this staff session will appear here.</div>}</div><div className="panel quick-panel"><span className="eyebrow">Quick actions</span><h3>What do you need?</h3><button type="button" onClick={() => setRoute('reservations')}>▣ Create reservation <span>→</span></button>{admin && <button type="button" onClick={() => setRoute('inventory')}>◈ Manage inventory <span>→</span></button>}<button type="button" onClick={() => setRoute('pos')}>＋ New sale <span>→</span></button>{admin && <button type="button" onClick={() => setRoute('reports')}>▤ Open reports <span>→</span></button>}</div></section><footer className="page-footer">PLAYSTATION GAME ZONE MANAGEMENT SYSTEM <span>MongoDB live data · {selectedLabel}</span></footer>{modal && <SessionModal station={modal.station} kind={modal.kind} onClose={() => setModal(null)} />}</main>
}

function Activity({ entries }) { return <div className="activity-list">{entries.map((entry) => <div className="activity-row" key={entry.id}><span className={`activity-dot ${entry.tone}`} /><small>{entry.time}</small><span><strong>{entry.user}</strong> {entry.action}</span><b>{entry.value}</b></div>)}</div> }

function ModulePage({ title, eyebrow, children }) { return <main className="workspace"><div className="page-toolbar"><div><p className="breadcrumb">Operations / {title}</p><h2>{title}</h2><p className="page-description">{eyebrow}</p></div></div>{children}</main> }

function Inventory({ initialProducts }) {
  const [products, setProducts] = useState(initialProducts)
  const [form, setForm] = useState({ name: '', category: 'Drinks', price: '', stock: '' })
  const [error, setError] = useState('')
  const previewImage = getProductImage(form.name, form.category)

  useEffect(() => {
    listProducts().then((result) => setProducts(result.products || [])).catch(() => {})
  }, [])

  const save = async (event) => {
    event.preventDefault()
    try {
      const result = await createProduct({ ...form, imageUrl: previewImage, price: Number(form.price), stock: Number(form.stock) })
      setProducts((current) => [...current, result.product])
      setForm({ name: '', category: 'Drinks', price: '', stock: '' })
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const edit = async (product) => {
    const name = window.prompt('Product name', product.name)
    const category = window.prompt('Category', product.category)
    const price = window.prompt('Price', product.price)
    const stock = window.prompt('Stock quantity', product.stock)
    if (name === null || category === null || price === null || stock === null) return
    try {
      const result = await updateProduct(product._id || product.id, { name, category, imageUrl: getProductImage(name, category), price: Number(price), stock: Number(stock) })
      setProducts((current) => current.map((item) => (item._id || item.id) === (product._id || product.id) ? result.product : item))
    } catch (requestError) {
      setError(requestError.message)
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
    <form className="panel modal-form" onSubmit={save}>
      <h3>Add product</h3>
      <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
      <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Drinks</option><option>Food</option><option>Accessories</option><option>Other</option></select></label>
      <div className="product-image-preview"><img src={previewImage} alt={form.name ? `${form.name} preview` : 'Suggested product image'} onError={(event) => { event.currentTarget.hidden = true }} /><span>{form.name || 'Product image preview'}</span><small>Image selected automatically from the product name</small></div>
      <label>Price<input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label>
      <label>Stock<input type="number" min="0" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} required /></label>
      {error && <small className="form-error">{error}</small>}
      <button className="button button-primary" type="submit">Add product</button>
    </form>
    <div className="table-panel"><TableHeader columns={['Product', 'Category', 'In stock', 'Price', 'Status', 'Actions']} />
      {products.map((product) => <div className="table-row" key={product._id || product.id}><strong className="inventory-product"><img src={product.imageUrl || getProductImage(product.name, product.category)} alt="" onError={(event) => { event.currentTarget.hidden = true }} />{product.name}</strong><span>{product.category}</span><span>{product.stock} units</span><span>{formatBirr(Number(product.price))}</span><span className={`status-pill ${product.stock <= 5 ? 'maintenance' : 'available'}`}>{product.stock <= 5 ? 'Low stock' : 'In stock'}</span><span><button className="text-button" type="button" onClick={() => edit(product)}>Edit</button><button className="text-button" type="button" onClick={() => remove(product)}>Delete</button></span></div>)}
    </div>
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
      if (action === 'reverse') {
        const reason = window.prompt('Reason for reversing this payment:')
        if (!reason?.trim()) return
        await reverseStationSession(session._id, { reason })
      }
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

function Reports({ auditLog }) {
  const [period, setPeriod] = useState('all')
  const [range, setRange] = useState({ from: '', to: '' })
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (period === 'custom' && (!range.from || !range.to)) {
      setReport(null)
      setLoading(false)
      return () => { cancelled = true }
    }
    setLoading(true)
    setError('')
    getFinancialReports({
      period,
      ...(period === 'custom' ? { from: range.from, to: range.to } : {})
    })
      .then((result) => { if (!cancelled) setReport(result) })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || 'Unable to load financial report.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period, range.from, range.to])

  const values = report?.summary || report || {}
  const revenue = Number(values.revenue ?? values.totalRevenue ?? 0)
  const hours = Number(values.playedHours ?? values.hoursPlayed ?? 0)
  const inventorySales = Number(values.inventorySales ?? values.productRevenue ?? 0)
  const buckets = report?.buckets || []
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

  return <ModulePage title="Reports & exports" eyebrow="Analyze realized session revenue, play time, and inventory sales for any period.">
    <section className="report-toolbar panel">
      <label>Reporting period<select value={period} onChange={(event) => { setLoading(true); setError(''); setPeriod(event.target.value) }}><option value="all">All-time overview</option><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="15days">15 days</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="custom">Custom date range</option></select></label>
      {period === 'custom' && <><label>From<input type="date" value={range.from} onChange={(event) => { setLoading(true); setError(''); setRange({ ...range, from: event.target.value }) }} required /></label><label>To<input type="date" value={range.to} min={range.from || undefined} onChange={(event) => { setLoading(true); setError(''); setRange({ ...range, to: event.target.value }) }} required /></label></>}
      <button className="button button-secondary" type="button" disabled={loading || (period === 'custom' && (!range.from || !range.to))} onClick={() => { setLoading(true); setError(''); getFinancialReports({ period, ...(period === 'custom' ? range : {}) }).then(setReport).catch((requestError) => setError(requestError.message || 'Unable to load financial report.')).finally(() => setLoading(false)) }}>Refresh</button>
      <button className="button button-primary" type="button" onClick={exportCsv} disabled={!report}>Export CSV</button>
    </section>
    {error && <small className="form-error" role="alert">{error}</small>}
    {loading && <p className="report-loading">Loading report…</p>}
    <div className="stats-grid report-stats"><StatCard label="Realized revenue" value={`${formatBirr(revenue)}`} note={`Selected period · ${period}`} /><StatCard label="Gaming revenue" value={`${formatBirr(Number(values.sessionRevenue || 0))}`} note="Closed sessions" tone="cyan" /><StatCard label="Played hours" value={hours.toFixed(2)} note="Completed session duration" tone="purple" /><StatCard label="Inventory sales" value={`${formatBirr(inventorySales)}`} note="Product sales in range" tone="orange" /></div>
    <section className="panel report-breakdown"><div className="panel-heading"><div><span className="eyebrow">Period breakdown</span><h3>{report?.periodLabel || period[0].toUpperCase() + period.slice(1)}</h3></div><span className="status-pill available">{report?.count ?? 0} records</span></div><div className="report-breakdown-grid"><span>Completed sessions <strong>{values.sessionCount ?? 0}</strong></span><span>Inventory units sold <strong>{values.inventoryUnitsSold ?? 0}</strong></span><span>Payments received <strong>{formatBirr(Number(values.paymentTotal ?? revenue))}</strong></span></div></section>
    <section className="panel report-table-panel"><div className="panel-heading"><div><span className="eyebrow">Detailed results</span><h3>Revenue & activity by {report?.range?.bucket || 'period'}</h3></div><span className="report-date-range">{report?.range?.start ? `${new Date(report.range.start).toLocaleDateString()} – ${new Date(report.range.end).toLocaleDateString()}` : ''}</span></div><div className="report-table-scroll"><table className="report-table"><thead><tr><th>Date / period</th><th>Total revenue</th><th>Gaming</th><th>Product sales</th><th>Memberships</th><th>Play hours</th><th>Sessions</th><th>Units sold</th></tr></thead><tbody>{buckets.map((bucket) => <tr key={bucket.date}><td>{formatBucketDate(bucket.date)}</td><td>{formatBirr(Number(bucket.revenue || 0))}</td><td>{formatBirr(Number(bucket.sessionRevenue || 0))}</td><td>{formatBirr(Number(bucket.inventorySales || 0))}</td><td>{formatBirr(Number(bucket.membershipRevenue || 0))}</td><td>{Number(bucket.playedHours || 0).toFixed(2)}</td><td>{bucket.completedSessions || 0}</td><td>{bucket.productUnitsSold || 0}</td></tr>)}</tbody></table>{!buckets.length && !loading && <div className="empty-state">{error ? 'Report data is unavailable.' : 'No activity was recorded for this period.'}</div>}</div></section>
    <div className="settings-grid"><div className="panel settings-card"><span className="eyebrow">Audit trail</span><h3>Staff activity</h3><Activity entries={auditLog} /></div><div className="panel settings-card"><span className="eyebrow">Data source</span><h3>Accurate period totals</h3><p>Reports are calculated from persisted, completed sessions and recorded inventory sales, not browser sample values.</p></div></div>
  </ModulePage>
}

function StationsManagement() {
  const { stations, refreshStations } = useApp()
  const [form, setForm] = useState({ name: '', type: 'PlayStation 5' })
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    refreshStations()
      .catch((requestError) => setError(requestError.message || 'Unable to load stations.'))
      .finally(() => setLoading(false))
  }, [refreshStations])
  const add = async (event) => {
    event.preventDefault()
    try {
      await createStation(form)
      await refreshStations()
      setForm({ name: '', type: 'PlayStation 5' })
      setError('')
    } catch (requestError) { setError(requestError.message || 'Unable to add station.') }
  }
  const changeStatus = async (station, status) => {
    let reason = ''
    if (status === 'maintenance') {
      const enteredReason = window.prompt('Maintenance note (optional)', '')
      if (enteredReason === null) return
      reason = enteredReason.trim()
    }
    try {
      await updateStationStatus(station.id, status, reason)
      await refreshStations()
      setError('')
    } catch (requestError) { throw requestError }
  }
  const remove = async (station) => {
    if (!window.confirm(`Delete station ${station.name}?`)) return
    try {
      await deleteStation(station.id)
      await refreshStations()
    } catch (requestError) { throw requestError }
  }
  return <><ModulePage title="Station management" eyebrow="Add and operate your floor plan with live session state, timers, and console cards.">
    <form className="panel station-create-form" onSubmit={add}><label>Station name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. PS5-11" required /></label><label>Console type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option>PlayStation 5</option><option>PlayStation 4</option></select></label><button className="button button-primary" type="submit">Add station</button></form>
    {error && <small className="form-error" role="alert">{error}</small>}
    {loading ? <div className="panel empty-state">Loading stations…</div> : stations.length ? <div className="station-grid station-management-grid">{stations.map((station) => <StationCard station={station} key={station.id} management onAction={(kind, selected) => setModal({ kind, station: selected })} onStatusChange={changeStatus} onDelete={remove} />)}</div> : <div className="panel empty-state">No stations are configured yet. Add a station above to build your floor plan.</div>}
  </ModulePage>{modal && <SessionModal station={modal.station} kind={modal.kind} onClose={() => setModal(null)} />}</>
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
  const { cart, removeFromCart, checkout, pricing } = useApp()
  const [payment, setPayment] = useState({ Cash: 0, 'Mobile Money': 0, Bank: 0, Card: 0 })
  const [discount, setDiscount] = useState({ type: 'percent', value: 0, reason: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const productTotal = cart.reduce((sum, product) => sum + product.price, 0)
  const subtotal = productTotal + gamingCharge
  const discountValue = discount.type === 'percent' ? subtotal * (Number(discount.value) / 100) : Number(discount.value)
  const total = Math.max(0, subtotal - discountValue)
  const paid = Object.values(payment).reduce((sum, value) => sum + Number(value), 0)
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
      onClose()
    } catch (requestError) {
      setError(requestError.message || 'Unable to record payment.')
    } finally {
      setSubmitting(false)
    }
  }
  return <Modal title="Final bill & checkout" eyebrow="Gaming + products · audit ready" onClose={onClose}><form className="modal-form checkout-form" onSubmit={submit}><div className="bill-lines"><div><span>Gaming charges</span><b>{formatBirr(gamingCharge)}</b></div>{cart.map((item, index) => <div key={`${item.id}-${index}`}><span>{item.icon} {item.name}</span><button type="button" className="text-button" onClick={() => removeFromCart(index)}>Remove</button><b>{formatBirr(item.price)}</b></div>)}</div><div className="bill-total"><span>Subtotal</span><strong>{formatBirr(subtotal)}</strong></div><div className="discount-box"><label>Discount type<select value={discount.type} onChange={(event) => setDiscount({ ...discount, type: event.target.value })}><option value="percent">Percentage (%)</option><option value="fixed">Fixed amount</option></select></label><label>Amount<input min="0" max={discount.type === 'percent' ? Number(pricing.discountLimit) : subtotal} type="number" value={discount.value} onChange={(event) => setDiscount({ ...discount, value: event.target.value })} /></label><label className="wide">Reason required for staff discount<input value={discount.reason} onChange={(event) => setDiscount({ ...discount, reason: event.target.value })} placeholder={`Admin limit: ${pricing.discountLimit}%`} /></label></div><div className="payment-grid"><strong>Mixed payments</strong>{Object.keys(payment).map((method) => <label key={method}>{method}<input type="number" min="0" value={payment[method]} onChange={(event) => setPayment({ ...payment, [method]: event.target.value })} /></label>)}<small>Paid {formatBirr(paid)} of {formatBirr(total)} {Math.abs(paid - total) < .01 ? '✓' : '· enter exact total'}</small></div>{error && <small className="form-error" role="alert">{error}</small>}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={submitting}>Back</button><button className="button button-primary" type="submit" disabled={submitting || Math.abs(paid - total) > .01 || (discountValue > 0 && !discount.reason.trim())}>{submitting ? 'Recording…' : 'Complete payment'}</button></div></form></Modal>
}

function ModuleContent({ route }) {
  const { stations, products, expenses, reservations, credits, cart, hardware, remoteReservations, addExpense, addToCart, addReservation, addCredit, repayCredit, auditLog, role, updateRemoteReservation, reportHardwareIssue } = useApp()
  const [modal, setModal] = useState(null)
  if (route === 'sessions') return <SessionManagement />
  if (route === 'stations') return role === 'Owner/Admin' ? <StationsManagement /> : <ModulePage title="Station management" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Only administrators can add or remove stations and change their operational status.</p></div></ModulePage>
  if (route === 'memberships') return <Memberships />
  if (route === 'inventory') return role === 'Owner/Admin' ? <Inventory initialProducts={products} /> : <ModulePage title="Inventory" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Cashiers can sell stocked items in POS. Product and stock management is reserved for administrators.</p></div></ModulePage>
  if (route === 'pos') return <><POS products={products} addToCart={addToCart} cart={cart} setModal={setModal} />{modal && <CheckoutModal onClose={() => setModal(null)} gamingCharge={0} />}</>
  if (route === 'reservations') return <Reservations stations={stations} reservations={reservations} addReservation={addReservation} credits={credits} addCredit={addCredit} repayCredit={repayCredit} />
  if (route === 'remote-booking') return <RemoteBooking bookings={remoteReservations} updateRemoteReservation={updateRemoteReservation} />
  if (route === 'hardware') return <HardwareHealth hardware={hardware} reportHardwareIssue={reportHardwareIssue} />
  if (route === 'expenses') return <Expenses expenses={expenses} addExpense={addExpense} />
  if (route === 'reports') return role === 'Owner/Admin' ? <Reports auditLog={auditLog} /> : <ModulePage title="Reports" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Financial reporting is available to administrators only.</p></div></ModulePage>
  if (route === 'settings') return role === 'Owner/Admin' ? <Settings /> : <ModulePage title="Settings" eyebrow="Restricted area"><div className="panel settings-card"><h3>Admin access required</h3><p>Cashier/Staff accounts can operate stations, sessions, reservations, POS, inventory, and expenses, but cannot change pricing or sensitive settings.</p></div></ModulePage>
  return <ModulePage title="Reports & exports" eyebrow="Revenue, expenses, staff performance, and audit records." />
}

function Settings() {
  const { pricing, updatePricing, shift, closeShift, users, addUser, updateUser, deleteUser, user: currentUser } = useApp()
  const [values, setValues] = useState(pricing)
  const [cash, setCash] = useState('')
  const [userForm, setUserForm] = useState({ name: '', username: '', phone: '', role: 'Cashier', pin: '' })
  const [userError, setUserError] = useState('')
  const submitUser = async (event) => {
    event.preventDefault()
    if (!/^[0-9]{7,18}$/.test(userForm.phone.replace(/\s/g, ''))) return setUserError('Phone must contain numbers only (7-18 digits).')
    if (!/^\d{6}$/.test(userForm.pin)) return setUserError('PIN must contain exactly 6 digits.')
    if (users.some((managedUser) => managedUser.username === userForm.username)) return setUserError('That username is already in use.')
    if (users.some((managedUser) => managedUser.phone.replace(/\s/g, '') === userForm.phone.replace(/\s/g, ''))) return setUserError('That phone number is already assigned.')
    try {
      await addUser(userForm)
      setUserForm({ name: '', username: '', phone: '', role: 'Cashier', pin: '' })
      setUserError('')
    } catch (error) {
      setUserError(error.message || 'Unable to create user.')
    }
  }
  const editUser = (managedUser) => {
    const name = window.prompt('Full name', managedUser.name)
    const username = window.prompt('Username', managedUser.username)?.trim().toLowerCase()
    const phone = window.prompt('Phone (numbers only)', managedUser.phone)?.replace(/\D/g, '')
    const role = window.prompt('Role: Admin or Cashier', managedUser.role)
    const pin = window.prompt('6-digit PIN', managedUser.pin)
    if (!name || !username || !phone || !/^[0-9]{7,18}$/.test(phone) || !/^(Admin|Cashier)$/.test(role) || !/^\d{6}$/.test(pin)) {
      setUserError('Edit cancelled or invalid. Phone must be 7-18 digits and PIN exactly 6 digits.')
      return
    }
    if (users.some((candidate) => candidate.id !== managedUser.id && (candidate.username === username || candidate.phone.replace(/\s/g, '') === phone))) {
      setUserError('That username or phone number is already assigned.')
      return
    }
    updateUser({ ...managedUser, name, username, phone, role, pin, password: pin })
    setUserError('')
  }
  return <ModulePage title="Settings & pricing" eyebrow="Owner/Admin controls for rates, discounts, users, backups, and shift close."><div className="settings-grid"><form className="panel settings-card" onSubmit={(event) => { event.preventDefault(); updatePricing(values) }}><span className="eyebrow">Admin only</span><h3>Pricing control</h3><div className="pricing-form"><label>PS4 / minute<input type="number" step="0.01" min="0" value={values.ps4} onChange={(event) => setValues({ ...values, ps4: event.target.value })} /></label><label>PS5 / minute<input type="number" step="0.01" min="0" value={values.ps5} onChange={(event) => setValues({ ...values, ps5: event.target.value })} /></label><label>Other / minute<input type="number" step="0.01" min="0" value={values.other} onChange={(event) => setValues({ ...values, other: event.target.value })} /></label><label>Staff discount max %<input type="number" min="0" max="100" value={values.discountLimit} onChange={(event) => setValues({ ...values, discountLimit: event.target.value })} /></label></div><button className="button button-primary" type="submit">Save pricing</button></form><form className="panel settings-card" onSubmit={(event) => { event.preventDefault(); if (cash !== '') closeShift(cash) }}><span className="eyebrow">Cashier control</span><h3>Close current shift</h3><p>Expected cash: <b>{formatBirr(shift.expectedCash)}</b>{shift.closedAt && ` · Closed at ${shift.closedAt}`}</p><label>Actual physical cash<input type="number" min="0" step="0.01" value={cash} onChange={(event) => setCash(event.target.value)} required /></label><button className="button button-secondary" type="submit">Close shift</button></form></div><div className="user-management panel"><div className="panel-heading"><div><span className="eyebrow">Admin only</span><h3>User management</h3></div><span className="status-pill available">{users.length} users</span></div><form className="user-form" onSubmit={submitUser}><input placeholder="Full name" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} required /><input placeholder="Username" value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value.toLowerCase().replace(/\s/g, '') })} required /><input inputMode="tel" pattern="[0-9]{7,18}" placeholder="Phone (numbers only)" value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value.replace(/\D/g, '') })} required /><select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option>Cashier</option><option>Admin</option></select><input inputMode="numeric" pattern="\d{6}" maxLength="6" placeholder="6-digit PIN" value={userForm.pin} onChange={(event) => setUserForm({ ...userForm, pin: event.target.value.replace(/\D/g, '') })} required /><button className="button button-primary" type="submit">Add user</button>{userError && <small className="form-error">{userError}</small>}</form><div className="user-list">{users.map((managedUser) => <div className="user-row" key={managedUser.id}><span className="avatar">{managedUser.name.split(' ').map((name) => name[0]).join('')}</span><span><strong>{managedUser.name}</strong><small>@{managedUser.username} · {managedUser.phone}</small></span>  <span className="status-pill">{managedUser.role}</span>{managedUser.name !== currentUser && <><button className="button button-secondary edit-user-button" type="button" onClick={() => editUser(managedUser)}>Edit</button><button className="button button-danger delete-user-button" type="button" onClick={() => { if (window.confirm(`Delete ${managedUser.name}?`)) deleteUser(managedUser.username) }}>  Delete</button></>}</div>)}</div></div></ModulePage>
}

function POS({ products: initialProducts, addToCart, cart, setModal }) {
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
  return <ModulePage title="POS & Sales" eyebrow="Combine gaming charges and product sales into one final bill."><div className="pos-layout"><div className="product-picker panel"><div className="panel-heading"><div><span className="eyebrow">Quick sale</span><h3>Products</h3></div></div>{error && <small className="form-error" role="alert">{error}</small>}<div className="product-grid">{products.map((product) => <button type="button" key={product._id || product.id} disabled={Number(product.stock) === 0} onClick={() => addToCart({ ...product, price: Number(product.price) })}><span className="product-visual"><img src={product.imageUrl || getProductImage(product.name, product.category)} alt="" onError={(event) => { event.currentTarget.hidden = true }} /><i>{product.icon || '◈'}</i></span><strong>{product.name}</strong><small>{formatBirr(Number(product.price))} · {product.stock} left</small></button>)}</div></div><div className="checkout panel"><span className="eyebrow">Current bill</span><h3>{cart.length ? `${cart.length} item(s) selected` : 'Walk-in sale'}</h3><div className="empty-state">{cart.length ? cart.map((item, index) => <div className="cart-line" key={`${item._id || item.id}-${index}`}>{item.name}<b>{formatBirr(Number(item.price))}</b></div>) : 'Select products to add them to this bill.'}</div><div className="checkout-total"><span>Total</span><strong>{formatBirr(cart.reduce((sum, item) => sum + Number(item.price), 0))}</strong></div><button className="button button-primary full-button" type="button" disabled={!cart.length} onClick={() => setModal('checkout')}>Review final bill</button></div></div></ModulePage>
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
function Dashboard() { const { route, role } = useApp(); const admin = role === 'Owner/Admin'; const restrictedForCashier = ['stations', 'inventory', 'reports', 'settings']; const visibleNav = navItems.filter(([id]) => admin || !restrictedForCashier.includes(id)); return <><aside className="sidebar"><a className="sidebar-brand" href="#dashboard"><span className="brand-mark">P</span><span>PLAYSTATION<br /><b>GAME ZONE</b></span></a><nav>{visibleNav.map(([id, icon, label]) => <a className={route === id ? 'active' : ''} href={`#${id}`} key={id}>{icon}<span>{label}</span></a>)}</nav><div className="sidebar-footer"><div className="network-status"><i /> Local network <b>Online</b></div><small>© 2024 Game Zone<br />v1.0.0</small></div></aside>{route === 'dashboard' ? <DashboardContent /> : <ModuleContent route={route} />}</> }

export default Dashboard
