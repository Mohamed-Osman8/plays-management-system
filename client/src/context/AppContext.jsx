import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { AppContext } from './context'
import { cancelStationSession, createBooking, createCustomerBalance, createUser, deleteUser as deleteUserRequest, getBookings, getCustomerBalances, getShopSettings, getSessions, getUsers, listStations, pauseStationSession, recordCustomerBalancePayment, resumeStationSession, reverseStationSession, setBookingStatus, staffLogin, startStationSession, stopStationSession, submitBooking, transferStationSession, updateBookingPayment, updateShopSettings, updateStationSessionPayment, updateUser as updateUserRequest } from '../services/api'
import { formatBirr } from '../utils/currency'

function normalizeBooking(booking) {
  const status = booking.status === 'Approved' ? 'Confirmed' : booking.status === 'Rejected' ? 'Cancelled' : booking.status
  return {
    ...booking,
    id: booking.id || booking._id,
    confirmation: booking.confirmation,
    customer: booking.customer || booking.customerName,
    stationId: booking.stationId || booking.stationName || String(booking.station || ''),
    consoleType: booking.consoleType?.replace('PS4', 'PlayStation 4').replace('PS5', 'PlayStation 5'),
    time: booking.time || booking.arrivalTime,
    status
  }
}

function normalizeCustomerBalance(balance) {
  return {
    ...balance,
    id: balance.id || String(balance._id),
    customer: balance.customer || balance.customerName,
    total: Number(balance.total ?? balance.amount),
    paid: Number(balance.paid ?? balance.amountPaid ?? 0)
  }
}

const initialState = {
  route: window.location.hash.replace('#', '') || 'login',
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
  creditsLoading: false,
  creditsError: '',
  auditLog: [],
  notifications: [],
  pricing: { ps4: 0.12, ps5: 0.18, other: 0.1, discountLimit: 10 },
  shift: { openedAt: '08:00 AM', expectedCash: 620, closedAt: null, actualCash: null },
  hardware: [],
  remoteReservations: [],
  remoteReservationsLoaded: false,
  remoteReservationsLoading: false,
  remoteReservationsError: '',
  users: [],
  shop: { name: 'Game Zone', phone: '', address: '', rates: { ps4: 0.12, ps5: 0.18, vip: 0.25, other: 0.1 }, bookingSettings: { openTime: '09:00', closeTime: '23:00', timeZone: 'Africa/Addis_Ababa', slotIntervalMinutes: 30, durationOptionsMinutes: [30, 60, 90, 120] }, notificationSettings: { bookingRequestsEmail: true, bookingUpdatesEmail: true } },
}

function notifyStationsChanged() {
  window.dispatchEvent(new Event('stations-updated'))
}

function reducer(state, action) {
  const audit = (entry) => ({ ...state, auditLog: [{ id: Date.now(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), user: state.user, ...entry }, ...state.auditLog] })
  switch (action.type) {
    case 'ROUTE': return { ...state, route: action.route }
    case 'SYNC_STATIONS': return { ...state, stations: action.stations }
    case 'SHOP': return { ...state, shop: action.shop }
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
    case 'TRANSFER': return { ...audit({ action: `transferred session from ${action.from} to ${action.to}`, value: 'Session timer and player carried over', tone: 'cyan' }), stations: state.stations.map((station) => station.id === action.from ? { ...station, status: 'available', session: undefined } : station.id === action.to ? { ...station, status: 'playing', session: { ...action.session, sessionId: action.sessionInfo?._id || action.session.sessionId, startedAt: action.sessionInfo?.startedAt || action.session.startedAt, paused: action.sessionInfo?.status === 'paused' || action.session.paused, pausedAt: action.sessionInfo?.pausedAt ?? action.session.pausedAt, pausedDurationMs: action.sessionInfo?.pausedDurationMs ?? action.session.pausedDurationMs } } : station) }
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
    case 'CREDITS_LOADING': return { ...state, creditsLoading: true, creditsError: '' }
    case 'SYNC_CREDITS': return { ...state, credits: action.balances.map(normalizeCustomerBalance), creditsLoading: false, creditsError: '' }
    case 'CREDITS_FAILED': return { ...state, creditsLoading: false, creditsError: action.error }
    case 'SYNC_USERS': return { ...state, users: action.users.map((user) => ({ ...user, id: String(user.id || user._id) })) }
    case 'CLEAR_NOTIFICATIONS': return { ...state, notifications: [] }
    case 'PRICING': return { ...state, pricing: { ...state.pricing, ...action.pricing }, auditLog: [{ id: Date.now(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), user: state.user, action: 'updated pricing controls', value: 'Admin settings', tone: 'purple' }, ...state.auditLog] }
    case 'SHIFT_CLOSE': return { ...audit({ action: 'closed cashier shift', value: `${formatBirr(action.actualCash)} actual cash`, tone: 'cyan' }), shift: { ...state.shift, closedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), actualCash: action.actualCash } }
    case 'REMOTE_RESERVATIONS_LOADING': return { ...state, remoteReservationsLoading: true, remoteReservationsError: '' }
    case 'REMOTE_RESERVATIONS_FAILED': return { ...state, remoteReservationsLoaded: true, remoteReservationsLoading: false, remoteReservationsError: action.error }
    case 'SYNC_REMOTE_RESERVATIONS': return { ...state, remoteReservations: action.reservations.map(normalizeBooking), remoteReservationsLoaded: true, remoteReservationsLoading: false, remoteReservationsError: '' }
    case 'REMOTE_RESERVATION_STATUS': return { ...audit({ action: `${action.status.toLowerCase()} reservation ${action.confirmation}`, value: 'Customer booking', tone: action.status === 'Confirmed' ? 'lime' : 'orange' }), remoteReservations: state.remoteReservations.map((reservation) => reservation.confirmation === action.confirmation ? { ...reservation, status: action.status } : reservation), notifications: [{ id: Date.now(), title: `Reservation ${action.status.toLowerCase()}`, detail: action.confirmation, tone: action.status === 'Confirmed' ? 'lime' : 'orange' }, ...state.notifications] }
    case 'HARDWARE_ALERT': return { ...audit({ action: `reported ${action.component} issue at ${action.station}`, value: action.reason, tone: 'orange' }), hardware: state.hardware.map((item) => item.station === action.station ? { ...item, [action.component]: 'Needs attention' } : item), notifications: [{ id: Date.now(), title: 'Remote hardware alert', detail: `${action.station}: ${action.reason}`, tone: 'orange' }, ...state.notifications] }
    case 'ADD_USER': return { ...audit({ action: `created ${action.user.role.toLowerCase()} user ${action.user.email}`, value: 'User management', tone: 'purple' }), users: [...state.users, { ...action.user, id: String(action.user.id || action.user._id) }] }
    case 'DELETE_USER': return { ...audit({ action: `deleted user ${action.user.email}`, value: 'User management', tone: 'orange' }), users: state.users.filter((user) => user.id !== String(action.user.id || action.user._id)) }
    case 'UPDATE_USER': return { ...audit({ action: `updated user ${action.user.email}`, value: 'User management', tone: 'purple' }), users: state.users.map((user) => user.id === String(action.user.id || action.user._id) ? { ...user, ...action.user, id: String(action.user.id || action.user._id) } : user) }
    default: return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
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
        type: ({ PS4: 'PlayStation 4', PS5: 'PlayStation 5', VIP: 'VIP', Other: 'Other' })[station.type] || station.type,
        status: normalizedStatus,
        hourlyRate: Number(station.hourlyRate || 0),
        reason: station.maintenanceReason,
        hardware: station.hardware,
        session: activeSession ? {
          customer: activeSession.customerName,
          customerPhone: activeSession.customerPhone,
          type: activeSession.sessionType,
          sessionId: String(activeSession._id),
          startedAt: activeSession.startedAt,
          paused: activeSession.status === 'paused',
          pausedAt: activeSession.pausedAt,
          pausedDurationMs: activeSession.pausedDurationMs,
          ratePerMinute: Number(activeSession.hourlyRate || 0) / 60,
          elapsedSeconds: Number(activeSession.playedHours || 0) * 3600,
          paymentMethod: activeSession.paymentMethod,
          reason: activeSession.reason
        } : undefined
      }
    })
    dispatch({ type: 'SYNC_STATIONS', stations })
    return stations
  }, [state.authenticated])
  const loadRemoteBookings = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) dispatch({ type: 'REMOTE_RESERVATIONS_LOADING' })
    try {
      const result = await getBookings()
      dispatch({ type: 'SYNC_REMOTE_RESERVATIONS', reservations: result.bookings || [] })
      return result.bookings || []
    } catch (error) {
      dispatch({ type: 'REMOTE_RESERVATIONS_FAILED', error: error.message || 'Unable to load reservations.' })
      throw error
    }
  }, [])
  const loadCustomerBalances = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) dispatch({ type: 'CREDITS_LOADING' })
    try {
      const result = await getCustomerBalances()
      dispatch({ type: 'SYNC_CREDITS', balances: result.balances || [] })
      return result.balances || []
    } catch (error) {
      dispatch({ type: 'CREDITS_FAILED', error: error.message || 'Unable to load customer balances.' })
      throw error
    }
  }, [])
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
    if (!state.authenticated) return undefined
    const refresh = () => {
      loadRemoteBookings({ showLoading: false }).catch((error) => console.error('Unable to refresh remote bookings.', error))
    }
    refresh()
    const interval = window.setInterval(refresh, 10000)
    return () => window.clearInterval(interval)
  }, [state.authenticated, loadRemoteBookings])
  useEffect(() => {
    if (!state.authenticated) return undefined
    const refresh = () => {
      loadCustomerBalances({ showLoading: false }).catch((error) => console.error('Unable to refresh customer balances.', error))
    }
    refresh()
    const interval = window.setInterval(refresh, 30000)
    return () => window.clearInterval(interval)
  }, [state.authenticated, loadCustomerBalances])
  const setRoute = useCallback((route) => { window.location.hash = route; dispatch({ type: 'ROUTE', route }) }, [])
  const lockApp = useCallback(() => dispatch({ type: 'LOCK' }), [])
  const value = useMemo(() => ({
    ...state, bookingRequests: state.remoteReservations, setRoute, lockApp, refreshStations,
    login: async (email, password) => {
      try {
        const result = await staffLogin({ email, password })
        const token = result.accessToken || result.token
        if (!token) {
          throw new Error('Login succeeded without an authentication token.')
        }
        const role = String(result.user?.role || '').trim().toLowerCase()
        if (role === 'superadmin') {
          const user = { ...result.user, role: 'superadmin' }
          window.localStorage.setItem('game-zone-super-admin-token', token)
          window.localStorage.setItem('game-zone-super-admin-user', JSON.stringify(user))
          window.localStorage.removeItem('playstation-game-zone-token')
          window.localStorage.removeItem('token')
          window.localStorage.removeItem('authToken')
          dispatch({ type: 'LOGIN', user: user.email || user.name || email, role: 'SuperAdmin' })
          return { ok: true, superAdmin: true, user }
        }
        if (!['admin', 'cashier'].includes(role)) {
          throw new Error('Your account does not have an authorized staff role.')
        }
        window.localStorage.setItem('playstation-game-zone-token', token)
        window.localStorage.setItem('token', token)
        window.localStorage.setItem('authToken', token)
        window.localStorage.removeItem('game-zone-super-admin-token')
        window.localStorage.removeItem('game-zone-super-admin-user')
        const appRole = role === 'admin' ? 'Owner/Admin' : 'Cashier/Staff'
        dispatch({ type: 'LOGIN', user: result.user.name, role: appRole })

        dispatch({ type: 'REMOTE_RESERVATIONS_LOADING' })
        const usersPromise = role === 'admin' ? getUsers() : Promise.resolve({ users: [] })
        const [bookingsResult, shopResult, balancesResult, usersResult] = await Promise.allSettled([getBookings(), getShopSettings(), getCustomerBalances(), usersPromise])
        const hydrationResults = [bookingsResult, shopResult, balancesResult, usersResult]
        const hydrationErrors = hydrationResults
          .filter((item) => item.status === 'rejected')
          .map((item) => item.reason)

        if (hydrationErrors.some((error) => error.status === 402)) {
          return { ok: true, licenseRequired: true }
        }

        if (hydrationErrors.some((error) => error.status === 401)) {
          window.localStorage.removeItem('playstation-game-zone-token')
          window.localStorage.removeItem('token')
          window.localStorage.removeItem('authToken')
          window.localStorage.removeItem('game-zone-super-admin-token')
          window.localStorage.removeItem('game-zone-super-admin-user')
          dispatch({ type: 'LOGOUT' })
          return { ok: false, message: 'Your sign-in session could not be verified. Please sign in again.' }
        }

        if (bookingsResult.status === 'fulfilled') {
          dispatch({ type: 'SYNC_REMOTE_RESERVATIONS', reservations: bookingsResult.value.bookings || [] })
        } else {
          dispatch({ type: 'REMOTE_RESERVATIONS_FAILED', error: bookingsResult.reason.message || 'Unable to load reservations.' })
        }
        if (shopResult.status === 'fulfilled') {
          dispatch({ type: 'SHOP', shop: shopResult.value.shop })
        }
        if (balancesResult.status === 'fulfilled') {
          dispatch({ type: 'SYNC_CREDITS', balances: balancesResult.value.balances || [] })
        } else {
          dispatch({ type: 'CREDITS_FAILED', error: balancesResult.reason.message || 'Unable to load customer balances.' })
        }
        if (usersResult.status === 'fulfilled') dispatch({ type: 'SYNC_USERS', users: usersResult.value.users || [] })
        hydrationErrors.forEach((error) => console.error('Initial staff data load failed.', error))
        return { ok: true }
      } catch (error) {
        window.localStorage.removeItem('playstation-game-zone-token')
        window.localStorage.removeItem('token')
        window.localStorage.removeItem('authToken')
        window.localStorage.removeItem('game-zone-super-admin-token')
        window.localStorage.removeItem('game-zone-super-admin-user')
        dispatch({ type: 'LOGOUT' })
        if (error.status === 401) dispatch({ type: 'LOGIN_FAILED' })
        if (error.lockoutUntil) dispatch({ type: 'LOGIN_LOCKOUT', lockoutUntil: error.lockoutUntil })
        return {
          ok: false,
          code: error.code,
          email: error.email,
          shopName: error.shopName,
          message: error.message || 'Invalid email address or password.',
          remainingSeconds: error.remainingSeconds,
        }
      }
    },
    addUser: async (user) => {
      const result = await createUser(user)
      dispatch({ type: 'ADD_USER', user: result.user })
      return result.user
    },
    deleteUser: async (user) => {
      await deleteUserRequest(user.id)
      dispatch({ type: 'DELETE_USER', user })
    },
    updateUser: async (user) => {
      const result = await updateUserRequest(user.id, user)
      dispatch({ type: 'UPDATE_USER', user: result.user })
      return result.user
    },
    logout: () => {
      window.localStorage.removeItem('playstation-game-zone-token')
      window.localStorage.removeItem('token')
      window.localStorage.removeItem('authToken')
      dispatch({ type: 'LOGOUT' })
    },
    refreshBookings: loadRemoteBookings,
    startSession: async (id, sessionType, details = {}) => {
      const station = state.stations.find((item) => item.id === id)
      const hourlyRates = state.shop?.rates || {}
      const rateKey = ({ 'PlayStation 4': 'ps4', 'PlayStation 5': 'ps5', VIP: 'vip', Other: 'other' })[station?.type]
      const hourlyRate = rateKey ? hourlyRates[rateKey] : undefined
      const result = await startStationSession({
        stationName: station?.name || id,
        sessionType,
        hourlyRate: Number(hourlyRate ?? station?.hourlyRate ?? Number(state.pricing.ps4) * 60),
        ...details
      })
      dispatch({ type: 'START', id, sessionType, sessionInfo: result.session, ...details })
      notifyStationsChanged()
    },
    endSession: async (id, reason, paymentMethod = 'cash') => {
      const station = state.stations.find((item) => item.id === id)
      const sessionId = station?.session?.sessionId
      if (!sessionId) throw new Error('This session has no server record. Refresh stations before ending it.')
      await stopStationSession(sessionId, { reason, paymentMethod })
      dispatch({ type: 'END', id, reason })
      notifyStationsChanged()
    },
    pauseSession: async (id, paused, reason) => {
      const station = state.stations.find((item) => item.id === id)
      const sessionId = station?.session?.sessionId
      if (!sessionId) throw new Error('This session has no server record. Refresh stations before changing its state.')
      const result = paused
        ? await pauseStationSession(sessionId, { reason })
        : await resumeStationSession(sessionId, { reason })
      dispatch({ type: 'PAUSE', id, paused, reason, pausedDurationMs: result.session?.pausedDurationMs })
      notifyStationsChanged()
    },
    transferSession: async (from, to, session) => {
      const sessionId = session?.sessionId
      if (!sessionId) throw new Error('This session has no server record. Refresh stations before transferring it.')
      const result = await transferStationSession(sessionId, to)
      dispatch({ type: 'TRANSFER', from, to, session, sessionInfo: result.session })
      notifyStationsChanged()
    },
    extendSession: (id, minutes) => dispatch({ type: 'EXTEND', id, minutes }),
    cancelSession: async (id, reason) => {
      const station = state.stations.find((item) => item.id === id)
      const sessionId = station?.session?.sessionId
      if (!sessionId) throw new Error('This session has no server record. Refresh stations before cancelling it.')
      await cancelStationSession(sessionId, { reason })
      dispatch({ type: 'CANCEL', id, reason })
      notifyStationsChanged()
    },
    reverseSession: async (id, reason) => {
      const station = state.stations.find((item) => item.id === id)
      const sessionId = station?.session?.sessionId
      if (!sessionId) throw new Error('This session has no server record to reverse.')
      await reverseStationSession(sessionId, { reason })
      dispatch({ type: 'REVERSE', id, reason })
      notifyStationsChanged()
    },
    reopenSession: (id, session, minutes) => dispatch({ type: 'REOPEN', id, session, minutes }),
    addProduct: (id, name, quantity) => dispatch({ type: 'STOCK', id, name, quantity }),
    addToCart: (product) => dispatch({ type: 'CART_ADD', product }),
    removeFromCart: (index) => dispatch({ type: 'CART_REMOVE', index }),
    checkout: (total) => dispatch({ type: 'CHECKOUT', total }),
    addExpense: (expense) => dispatch({ type: 'EXPENSE', expense }),
    addReservation: (reservation) => dispatch({ type: 'RESERVE', reservation }),
    addCredit: async (credit) => {
      const result = await createCustomerBalance({
        customerName: credit.customer,
        phone: credit.phone,
        amount: Number(credit.amount)
      })
      loadCustomerBalances({ showLoading: false }).catch((error) => console.error('Customer balance was saved but could not be refreshed.', error))
      return result.balance
    },
    repayCredit: async (id, amount) => {
      const result = await recordCustomerBalancePayment(id, amount)
      loadCustomerBalances({ showLoading: false }).catch((error) => console.error('Customer payment was recorded but balances could not be refreshed.', error))
      return result.balance
    },
    refreshCustomerBalances: loadCustomerBalances,
    clearNotifications: () => dispatch({ type: 'CLEAR_NOTIFICATIONS' }),
    updatePricing: (pricing) => dispatch({ type: 'PRICING', pricing }),
    saveShopSettings: async (settings) => {
      const result = await updateShopSettings(settings)
      dispatch({ type: 'SHOP', shop: result.shop })
      return result.shop
    },
    refreshShopSettings: async () => {
      const result = await getShopSettings()
      dispatch({ type: 'SHOP', shop: result.shop })
      return result.shop
    },
    closeShift: (actualCash) => dispatch({ type: 'SHIFT_CLOSE', actualCash: Number(actualCash) }),
    addRemoteReservation: async (reservation) => {
      const result = await submitBooking(reservation)
      return result
    },
    createReservation: async (reservation) => {
      const result = await createBooking(reservation)
      await loadRemoteBookings({ showLoading: false })
      return result
    },
    updateRemoteReservation: async (reservation, status) => {
      const result = await setBookingStatus(reservation.id, status)
      dispatch({ type: 'REMOTE_RESERVATION_STATUS', confirmation: reservation.confirmation, status })
      await loadRemoteBookings({ showLoading: false })
      return result.booking
    },
    updateReservationPayment: async (reservation, payment) => {
      const result = await updateBookingPayment(reservation.id, payment)
      await loadRemoteBookings({ showLoading: false })
      return result.booking
    },
    startReservationSession: async (reservation) => {
      const stationId = String(reservation.station)
      const station = state.stations.find((item) => item.id === stationId)
      const result = await startStationSession({
        stationId,
        stationName: reservation.stationName,
        sessionType: 'Reservation',
        customerName: reservation.customerName,
        customerPhone: reservation.phone,
        bookingId: reservation._id
      })
      dispatch({ type: 'START', id: stationId, sessionType: 'Reservation', sessionInfo: result.session, customer: reservation.customerName, fixedMinutes: reservation.durationMinutes })
      notifyStationsChanged()
      if (!station) await refreshStations()
      await loadRemoteBookings({ showLoading: false })
      return result
    },
    completeReservationSession: async (reservation) => {
      if (!reservation.session) throw new Error('This reservation has no linked gaming session.')
      const result = await stopStationSession(reservation.session, { reason: 'Reservation completed' })
      notifyStationsChanged()
      await loadRemoteBookings({ showLoading: false })
      return result.session
    },
    updateSessionPayment: async (session, payment) => {
      const result = await updateStationSessionPayment(session._id, payment)
      return result.session
    },
    reportHardwareIssue: (station, component, reason) => dispatch({ type: 'HARDWARE_ALERT', station, component, reason }),
  }), [state, setRoute, lockApp, refreshStations, loadRemoteBookings, loadCustomerBalances])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
