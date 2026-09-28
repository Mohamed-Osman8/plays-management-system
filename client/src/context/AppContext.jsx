import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { AppContext } from './context'
import { approveBooking, cancelStationSession, createUser, getBookings, getSessions, listStations, pauseStationSession, rejectBooking, resumeStationSession, reverseStationSession, staffLogin, startStationSession, stopStationSession, submitBooking } from '../services/api'
import { formatBirr } from '../utils/currency'

function storedRemoteReservations() {
  try {
    const stored = window.localStorage.getItem('playstation-game-zone-bookings')
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function normalizeBooking(booking) {
  return {
    ...booking,
    id: booking.id || booking._id,
    confirmation: booking.confirmation || `PGZ-${String(booking._id || Date.now()).slice(-6)}`,
    customer: booking.customer || booking.customerName,
    stationId: booking.stationId || booking.stationName,
    consoleType: booking.consoleType?.replace('PS4', 'PlayStation 4').replace('PS5', 'PlayStation 5'),
    time: booking.time || booking.arrivalTime,
    status: booking.status === 'Pending' ? 'Pending approval' : booking.status,
    graceMinutes: booking.graceMinutes || 15
  }
}

const initialState = {
  route: window.location.hash.replace('#', '') || 'booking',
  authenticated: false,
  role: null,
  loginAttempts: 0,
  lockoutUntil: null,
  locked: false,
  user: '',
  stations: [],
  transactions: [],
  products: [],
  expenses: [],
  reservations: [],
  cart: [],
  credits: [],
  auditLog: [],
  notifications: [],
  pricing: { ps4: 0.12, ps5: 0.18, other: 0.1, discountLimit: 10 },
  shift: { openedAt: '08:00 AM', expectedCash: 620, closedAt: null, actualCash: null },
  hardware: [],
  remoteReservations: storedRemoteReservations(),
  users: [],
}

function reducer(state, action) {
  const audit = (entry) => ({ ...state, auditLog: [{ id: Date.now(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), user: state.user, ...entry }, ...state.auditLog] })
  switch (action.type) {
    case 'ROUTE': return { ...state, route: action.route }
    case 'SYNC_STATIONS': return { ...state, stations: action.stations }
    case 'LOGIN': return { ...state, authenticated: true, user: action.user, role: action.role, loginAttempts: 0, lockoutUntil: null, locked: false }
    case 'LOGIN_FAILED': {
      const attempts = state.loginAttempts + 1
      return { ...state, loginAttempts: attempts, lockoutUntil: attempts >= 5 ? Date.now() + 120000 : state.lockoutUntil }
    }
    case 'LOGIN_LOCKOUT': return { ...state, lockoutUntil: new Date(action.lockoutUntil).getTime() }
    case 'LOGOUT': return { ...state, authenticated: false, role: null, locked: false }
    case 'LOCK': return { ...state, locked: true }
    case 'START': return { ...audit({ action: `started ${action.sessionType.toLowerCase()} session at ${action.id}`, value: 'New session', tone: 'lime' }), stations: state.stations.map((station) => station.id === action.id ? { ...station, status: 'playing', session: { customer: action.sessionInfo?.customerName || action.customer || 'Walk-in player', elapsed: '00:00:00', elapsedSeconds: 0, pausedDurationMs: 0, amount: formatBirr(0), type: action.sessionType, paused: false, fixedMinutes: action.fixedMinutes || 60, products: [], sessionId: action.sessionInfo?._id, startedAt: action.sessionInfo?.startedAt || new Date().toISOString(), ratePerMinute: Number(action.sessionInfo?.hourlyRate || 0) / 60 } } : station) }
    case 'END': return { ...audit({ action: `ended session at ${action.id}`, value: action.reason || 'Final bill', tone: 'lime' }), stations: state.stations.map((station) => station.id === action.id ? { ...station, status: 'available', session: undefined } : station) }
    case 'PAUSE': return { ...audit({ action: `${action.paused ? 'paused' : 'resumed'} session at ${action.id}`, value: action.reason || 'Session control', tone: 'purple' }), stations: state.stations.map((station) => station.id === action.id ? { ...station, session: { ...station.session, paused: action.paused, pausedAt: action.paused ? new Date().toISOString() : null, pausedDurationMs: action.pausedDurationMs ?? station.session?.pausedDurationMs } } : station) }
    case 'TRANSFER': return { ...audit({ action: `transferred session from ${action.from} to ${action.to}`, value: 'Products carried over', tone: 'cyan' }), stations: state.stations.map((station) => station.id === action.from ? { ...station, status: 'available', session: undefined } : station.id === action.to ? { ...station, status: 'playing', session: action.session } : station) }
    case 'EXTEND': return { ...audit({ action: `extended session at ${action.id}`, value: `+${action.minutes} minutes`, tone: 'cyan' }), stations: state.stations.map((station) => station.id === action.id ? { ...station, session: { ...station.session, fixedMinutes: (station.session.fixedMinutes || 0) + Number(action.minutes) } } : station) }
    case 'CANCEL': return { ...audit({ action: `cancelled session at ${action.id}`, value: action.reason, tone: 'orange' }), stations: state.stations.map((station) => station.id === action.id ? { ...station, status: 'available', session: undefined } : station) }
    case 'REOPEN': return { ...audit({ action: `reopened expired session at ${action.id}`, value: `${action.minutes} minutes`, tone: 'lime' }), stations: state.stations.map((station) => station.id === action.id ? { ...station, status: 'playing', session: { ...action.session, expired: false, fixedMinutes: action.minutes } } : station) }
    case 'REVERSE': return { ...audit({ action: `reversed session at ${action.id}`, value: action.reason || 'Payment reversal', tone: 'orange' }), stations: state.stations.map((station) => station.id === action.id ? { ...station, status: 'available', session: undefined } : station) }
    case 'STOCK': return { ...audit({ action: `updated stock for ${action.name || 'product'}`, value: `+${action.quantity || 1} units`, tone: 'orange' }), products: state.products.map((product) => product.id === action.id ? { ...product, stock: product.stock + (action.quantity || 1) } : product) }
    case 'CART_ADD': return { ...state, cart: [...state.cart, action.product] }
    case 'CART_REMOVE': return { ...state, cart: state.cart.filter((_, index) => index !== action.index) }
    case 'CHECKOUT': return { ...audit({ action: 'processed mixed payment checkout', value: formatBirr(action.total), tone: 'cyan' }), cart: [], transactions: [...state.transactions, { id: Date.now(), amount: action.total }], products: state.products.map((product) => { const sold = state.cart.filter((item) => item.id === product.id).length; return sold ? { ...product, stock: Math.max(0, product.stock - sold) } : product }), notifications: [{ id: Date.now(), title: 'Payment completed', detail: `Mixed payment checkout for ${formatBirr(action.total)}`, tone: 'cyan' }, ...state.notifications] }
    case 'EXPENSE': return { ...audit({ action: `recorded expense: ${action.expense.title}`, value: formatBirr(action.expense.amount), tone: 'orange' }), expenses: [...state.expenses, { id: Date.now(), title: action.expense.title, category: action.expense.category || 'Other', amount: action.expense.amount, by: state.user }], notifications: [{ id: Date.now(), title: 'New expense entry', detail: `${state.user} added ${action.expense.title}`, tone: 'orange' }, ...state.notifications] }
    case 'RESERVE': return { ...audit({ action: `created reservation for ${action.reservation.stationId}`, value: '50% deposit', tone: 'purple' }), reservations: [...state.reservations, { ...action.reservation, id: Date.now(), status: 'Confirmed', graceMinutes: 15 }], stations: state.stations.map((station) => station.id === action.reservation.stationId ? { ...station, status: 'reserved', reservation: { customer: action.reservation.customer } } : station) }
    case 'CREDIT': return { ...audit({ action: `recorded credit for ${action.credit.customer}`, value: formatBirr(action.credit.amount), tone: 'orange' }), credits: [...state.credits, { ...action.credit, id: Date.now(), paid: 0 }] }
    case 'REPAY': return { ...audit({ action: `received partial repayment from ${action.customer}`, value: formatBirr(action.amount), tone: 'lime' }), credits: state.credits.map((credit) => credit.id === action.id ? { ...credit, paid: Math.min(credit.total, credit.paid + Number(action.amount)) } : credit) }
    case 'CLEAR_NOTIFICATIONS': return { ...state, notifications: [] }
    case 'PRICING': return { ...state, pricing: { ...state.pricing, ...action.pricing }, auditLog: [{ id: Date.now(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), user: state.user, action: 'updated pricing controls', value: 'Admin settings', tone: 'purple' }, ...state.auditLog] }
    case 'SHIFT_CLOSE': return { ...audit({ action: 'closed cashier shift', value: `${formatBirr(action.actualCash)} actual cash`, tone: 'cyan' }), shift: { ...state.shift, closedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), actualCash: action.actualCash } }
    case 'REMOTE_RESERVATION': return { ...audit({ action: `received remote booking from ${action.reservation.customer}`, value: action.reservation.confirmation, tone: 'cyan' }), remoteReservations: [...state.remoteReservations, { ...action.reservation, status: 'Pending approval' }], notifications: [{ id: Date.now(), title: 'Remote booking request', detail: `${action.reservation.customer} requested ${action.reservation.stationId}`, tone: 'cyan' }, ...state.notifications] }
    case 'SYNC_REMOTE_RESERVATIONS': return { ...state, remoteReservations: action.reservations.map(normalizeBooking) }
    case 'REMOTE_RESERVATION_STATUS': return { ...audit({ action: `${action.status.toLowerCase()} remote booking ${action.confirmation}`, value: 'Customer portal request', tone: action.status === 'Approved' ? 'lime' : 'orange' }), remoteReservations: state.remoteReservations.map((reservation) => reservation.confirmation === action.confirmation ? { ...reservation, status: action.status } : reservation), stations: action.status === 'Approved' ? state.stations.map((station) => station.id === action.stationId ? { ...station, status: 'reserved', reservation: { customer: action.customer } } : station) : state.stations, notifications: [{ id: Date.now(), title: `Booking ${action.status.toLowerCase()}`, detail: action.confirmation, tone: action.status === 'Approved' ? 'lime' : 'orange' }, ...state.notifications] }
    case 'HARDWARE_ALERT': return { ...audit({ action: `reported ${action.component} issue at ${action.station}`, value: action.reason, tone: 'orange' }), hardware: state.hardware.map((item) => item.station === action.station ? { ...item, [action.component]: 'Needs attention' } : item), notifications: [{ id: Date.now(), title: 'Remote hardware alert', detail: `${action.station}: ${action.reason}`, tone: 'orange' }, ...state.notifications] }
    case 'ADD_USER': return { ...audit({ action: `created ${action.user.role.toLowerCase()} user ${action.user.username}`, value: 'User management', tone: 'purple' }), users: [...state.users, { ...action.user, id: Date.now() }] }
    case 'DELETE_USER': return { ...audit({ action: `deleted user ${action.username}`, value: 'User management', tone: 'orange' }), users: state.users.filter((user) => user.username !== action.username) }
    case 'UPDATE_USER': return { ...audit({ action: `updated user ${action.user.username}`, value: 'User management', tone: 'purple' }), users: state.users.map((user) => user.id === action.user.id ? { ...user, ...action.user } : user) }
    default: return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  useEffect(() => {
    window.localStorage.setItem('playstation-game-zone-bookings', JSON.stringify(state.remoteReservations))
  }, [state.remoteReservations])
  const refreshStations = useCallback(async () => {
    const [stationResult, sessionResult] = await Promise.all([
      listStations(),
      state.authenticated ? getSessions() : Promise.resolve({ sessions: [] })
    ])
    const sessionsByStation = new Map((sessionResult.sessions || [])
      .filter((session) => ['active', 'paused'].includes(session.status))
      .map((session) => [String(session.station), session]))
    const stations = (stationResult.stations || []).map((station) => {
      const activeSession = sessionsByStation.get(String(station._id))
      const normalizedStatus = activeSession
        ? 'playing'
        : station.status === 'playing' ? 'available' : station.status
      return {
        id: String(station._id),
        name: station.name,
        type: station.type === 'PS5' ? 'PlayStation 5' : 'PlayStation 4',
        status: normalizedStatus,
        reason: station.maintenanceReason,
        session: activeSession ? {
          customer: activeSession.customerName,
          type: activeSession.sessionType,
          sessionId: String(activeSession._id),
          startedAt: activeSession.startedAt,
          paused: activeSession.status === 'paused',
          pausedAt: activeSession.pausedAt,
          pausedDurationMs: activeSession.pausedDurationMs,
          ratePerMinute: Number(activeSession.hourlyRate || 0) / 60,
          elapsedSeconds: Number(activeSession.playedHours || 0) * 3600
        } : undefined
      }
    })
    dispatch({ type: 'SYNC_STATIONS', stations })
    return stations
  }, [state.authenticated])
  useEffect(() => {
    let mounted = true
    const refresh = () => {
      refreshStations().catch((error) => {
        if (mounted) console.error('Station refresh failed.', error)
      })
    }
    refresh()
    const handleStationChange = () => refresh()
    window.addEventListener('stations-updated', handleStationChange)
    const interval = state.authenticated ? window.setInterval(refresh, 10000) : null
    return () => {
      mounted = false
      window.removeEventListener('stations-updated', handleStationChange)
      if (interval) window.clearInterval(interval)
    }
  }, [state.authenticated, refreshStations])
  useEffect(() => {
    const syncBookings = (event) => {
      if (event.key !== 'playstation-game-zone-bookings' || !event.newValue) return
      const reservations = JSON.parse(event.newValue)
      dispatch({ type: 'SYNC_REMOTE_RESERVATIONS', reservations })
    }
    window.addEventListener('storage', syncBookings)
    return () => window.removeEventListener('storage', syncBookings)
  }, [])
  useEffect(() => {
    if (!state.authenticated) return undefined
    const refresh = async () => {
      try {
        const [result] = await Promise.all([getBookings()])
        dispatch({ type: 'SYNC_REMOTE_RESERVATIONS', reservations: result.bookings || [] })
      } catch (error) {
        console.error('Unable to refresh remote bookings.', error)
      }
    }
    const interval = window.setInterval(refresh, 10000)
    return () => window.clearInterval(interval)
  }, [state.authenticated])
  const setRoute = useCallback((route) => { window.location.hash = route; dispatch({ type: 'ROUTE', route }) }, [])
  const lockApp = useCallback(() => dispatch({ type: 'LOCK' }), [])
  const value = useMemo(() => ({
    ...state, bookingRequests: state.remoteReservations, setRoute, lockApp, refreshStations,
    login: async (username, password) => {
      try {
        const result = await staffLogin({ username, password })
        const token = result.accessToken || result.token
        if (!token) {
          throw new Error('Login succeeded without an authentication token.')
        }
        window.localStorage.setItem('playstation-game-zone-token', token)
        window.localStorage.setItem('token', token)
        window.localStorage.setItem('authToken', token)
        const bookings = await getBookings()
        dispatch({ type: 'SYNC_REMOTE_RESERVATIONS', reservations: bookings.bookings || [] })
        const role = String(result.user.role || '').trim().toLowerCase()
        if (!['admin', 'cashier'].includes(role)) {
          throw new Error('Your account does not have an authorized staff role.')
        }
        dispatch({ type: 'LOGIN', user: result.user.name, role: role === 'admin' ? 'Owner/Admin' : 'Cashier/Staff' })
        return { ok: true }
      } catch (error) {
        window.localStorage.removeItem('playstation-game-zone-token')
        window.localStorage.removeItem('token')
        window.localStorage.removeItem('authToken')
        dispatch({ type: 'LOGOUT' })
        if (error.status === 401 || error.status === 429) dispatch({ type: 'LOGIN_FAILED' })
        if (error.lockoutUntil) dispatch({ type: 'LOGIN_LOCKOUT', lockoutUntil: error.lockoutUntil })
        return { ok: false, message: error.message || 'Invalid username or password.', remainingSeconds: error.remainingSeconds }
      }
    },
    addUser: async (user) => {
      const result = await createUser(user)
      dispatch({ type: 'ADD_USER', user: result.user })
      return result.user
    },
    deleteUser: (username) => dispatch({ type: 'DELETE_USER', username }),
    updateUser: (user) => dispatch({ type: 'UPDATE_USER', user }),
    logout: () => {
      window.localStorage.removeItem('playstation-game-zone-token')
      window.localStorage.removeItem('token')
      window.localStorage.removeItem('authToken')
      dispatch({ type: 'LOGOUT' })
    },
    startSession: async (id, sessionType, details = {}) => {
      const station = state.stations.find((item) => item.id === id)
      const pricePerMinute = station?.type === 'PlayStation 5' ? state.pricing.ps5 : state.pricing.ps4
      const result = await startStationSession({
        stationName: station?.name || id,
        sessionType,
        hourlyRate: Number(pricePerMinute) * 60,
        ...details
      })
      dispatch({ type: 'START', id, sessionType, sessionInfo: result.session, ...details })
    },
    endSession: async (id, reason, paymentMethod = 'cash') => {
      const station = state.stations.find((item) => item.id === id)
      const sessionId = station?.session?.sessionId
      if (!sessionId) throw new Error('This session has no server record. Refresh stations before ending it.')
      await stopStationSession(sessionId, { reason, paymentMethod })
      dispatch({ type: 'END', id, reason })
    },
    pauseSession: async (id, paused, reason) => {
      const station = state.stations.find((item) => item.id === id)
      const sessionId = station?.session?.sessionId
      if (!sessionId) throw new Error('This session has no server record. Refresh stations before changing its state.')
      const result = paused
        ? await pauseStationSession(sessionId, { reason })
        : await resumeStationSession(sessionId, { reason })
      dispatch({ type: 'PAUSE', id, paused, reason, pausedDurationMs: result.session?.pausedDurationMs })
    },
    transferSession: (from, to, session) => dispatch({ type: 'TRANSFER', from, to, session }),
    extendSession: (id, minutes) => dispatch({ type: 'EXTEND', id, minutes }),
    cancelSession: async (id, reason) => {
      const station = state.stations.find((item) => item.id === id)
      const sessionId = station?.session?.sessionId
      if (!sessionId) throw new Error('This session has no server record. Refresh stations before cancelling it.')
      await cancelStationSession(sessionId, { reason })
      dispatch({ type: 'CANCEL', id, reason })
    },
    reverseSession: async (id, reason) => {
      const station = state.stations.find((item) => item.id === id)
      const sessionId = station?.session?.sessionId
      if (!sessionId) throw new Error('This session has no server record to reverse.')
      await reverseStationSession(sessionId, { reason })
      dispatch({ type: 'REVERSE', id, reason })
    },
    reopenSession: (id, session, minutes) => dispatch({ type: 'REOPEN', id, session, minutes }),
    addProduct: (id, name, quantity) => dispatch({ type: 'STOCK', id, name, quantity }),
    addToCart: (product) => dispatch({ type: 'CART_ADD', product }),
    removeFromCart: (index) => dispatch({ type: 'CART_REMOVE', index }),
    checkout: (total) => dispatch({ type: 'CHECKOUT', total }),
    addExpense: (expense) => dispatch({ type: 'EXPENSE', expense }),
    addReservation: (reservation) => dispatch({ type: 'RESERVE', reservation }),
    addCredit: (credit) => dispatch({ type: 'CREDIT', credit }),
    repayCredit: (id, customer, amount) => dispatch({ type: 'REPAY', id, customer, amount }),
    clearNotifications: () => dispatch({ type: 'CLEAR_NOTIFICATIONS' }),
    updatePricing: (pricing) => dispatch({ type: 'PRICING', pricing }),
    closeShift: (actualCash) => dispatch({ type: 'SHIFT_CLOSE', actualCash: Number(actualCash) }),
    addRemoteReservation: async (reservation) => {
      const result = await submitBooking(reservation)
      const saved = normalizeBooking(result.booking)
      dispatch({ type: 'REMOTE_RESERVATION', reservation: saved })
      return saved
    },
    updateRemoteReservation: async (reservation, status) => {
      const result = status === 'Approved' ? await approveBooking(reservation.id) : await rejectBooking(reservation.id)
      dispatch({ type: 'REMOTE_RESERVATION_STATUS', confirmation: reservation.confirmation, stationId: reservation.stationId, customer: reservation.customer, status })
      return result.booking
    },
    reportHardwareIssue: (station, component, reason) => dispatch({ type: 'HARDWARE_ALERT', station, component, reason }),
  }), [state, setRoute, lockApp, refreshStations])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
