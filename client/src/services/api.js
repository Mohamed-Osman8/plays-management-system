const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace(/\/$/, '')
const TOKEN_KEYS = ['playstation-game-zone-token', 'token', 'authToken']

function getStoredToken() {
  for (const key of TOKEN_KEYS) {
    const token = window.localStorage.getItem(key)
    if (token) return token
  }
  return null
}

function clearStoredTokens() {
  TOKEN_KEYS.forEach((key) => window.localStorage.removeItem(key))
}

async function request(path, options = {}) {
  const token = getStoredToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.message || 'Request failed.')
    Object.assign(error, body)
    error.status = response.status

    if (response.status === 402 && body.code === 'LICENSE_REQUIRED') {
      window.dispatchEvent(new Event('license-required'))
    }

    if (response.status === 401) {
      clearStoredTokens()
    }

    throw error
  }

  return body
}

export function submitBooking(bookingData) {
  return request('/bookings/request', {
    method: 'POST',
    body: JSON.stringify({
      customerName: bookingData.customer,
      phone: bookingData.phone,
      consoleType: bookingData.consoleType.replace('PlayStation ', 'PS'),
      stationName: bookingData.stationId,
      date: bookingData.date,
      arrivalTime: bookingData.time
    })
  })
}

export function staffLogin(credentials) {
  const username = String(credentials.username || '').trim().toLowerCase()
  const password = String(credentials.password ?? '')
  const payload = { username }

  if (password.length === 6 && /^\d{6}$/.test(password)) {
    payload.pin = password
  } else {
    payload.password = password
  }

  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function getBookings() {
  return request('/bookings')
}

export function approveBooking(id) {
  return request(`/bookings/${id}/approve`, { method: 'PUT' })
}

export function rejectBooking(id) {
  return request(`/bookings/${id}/reject`, { method: 'PUT' })
}

export function createUser(userData) {
  return request('/users/create', {
    method: 'POST',
    body: JSON.stringify(userData)
  })
}

export function listProducts() {
  return request('/products')
}

export function listStations() {
  return request(getStoredToken() ? '/stations' : '/stations/public')
}

export function createProduct(product) {
  return request('/products', { method: 'POST', body: JSON.stringify(product) })
}

export function updateProduct(id, product) {
  return request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(product) })
}

export function deleteProduct(id) {
  return request(`/products/${id}`, { method: 'DELETE' })
}

export function createSale(sale) {
  return request('/sales', { method: 'POST', body: JSON.stringify(sale) })
}

export function createStation(station) {
  return request('/stations', { method: 'POST', body: JSON.stringify(station) })
}

export function deleteStation(id) {
  return request(`/stations/${id}`, { method: 'DELETE' })
}

export function updateStationStatus(id, status, reason = '') {
  return request(`/stations/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason })
  })
}

export function startStationSession(data) {
  return request('/sessions/start', { method: 'POST', body: JSON.stringify(data) })
}

export function getSessions(filters = {}) {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')
  )
  return request(`/sessions${query.size ? `?${query}` : ''}`)
}

export function pauseStationSession(id, data = {}) {
  return request(`/sessions/${id}/pause`, { method: 'PUT', body: JSON.stringify(data) })
}

export function resumeStationSession(id, data = {}) {
  return request(`/sessions/${id}/resume`, { method: 'PUT', body: JSON.stringify(data) })
}

export function stopStationSession(id, data = {}) {
  return request(`/sessions/${id}/stop`, { method: 'PUT', body: JSON.stringify(data) })
}

export function cancelStationSession(id, data = {}) {
  return request(`/sessions/${id}/cancel`, { method: 'PUT', body: JSON.stringify(data) })
}

export function reverseStationSession(id, data = {}) {
  return request(`/sessions/${id}/reverse`, { method: 'PUT', body: JSON.stringify(data) })
}

export function getFinancialReports(filters = {}) {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')
  )
  return request(`/reports/financial${query.size ? `?${query}` : ''}`)
}

export function getDashboardSummary(filters = {}) {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')
  )
  return request(`/dashboard/summary${query.size ? `?${query}` : ''}`)
}

export function getShopSettings() {
  return request('/shop')
}

export function updateShopSettings(settings) {
  return request('/shop', { method: 'PUT', body: JSON.stringify(settings) })
}

export function registerShop(data) {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(data) })
}

async function superAdminRequest(path, token, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || 'Super admin request failed.')
  return body
}

export function superAdminLogin(credentials) {
  return request('/super-admin/login', { method: 'POST', body: JSON.stringify(credentials) })
}

export function superAdminListShops(token) {
  return superAdminRequest('/super-admin/shops', token)
}

export function superAdminExtendShop(token, shopId) {
  return superAdminRequest(`/super-admin/shops/${shopId}/extend`, token, { method: 'POST' })
}

export function superAdminSetShopLock(token, shopId, locked) {
  return superAdminRequest(`/super-admin/shops/${shopId}/lock`, token, {
    method: 'PATCH',
    body: JSON.stringify({ locked })
  })
}

export function listMemberships() {
  return request('/memberships')
}

export function createMembership(membership) {
  return request('/memberships', { method: 'POST', body: JSON.stringify(membership) })
}

export function updateMembership(id, membership) {
  return request(`/memberships/${id}`, { method: 'PUT', body: JSON.stringify(membership) })
}

export function deleteMembership(id) {
  return request(`/memberships/${id}`, { method: 'DELETE' })
}

export function recordMembershipPayment(id, payment) {
  return request(`/memberships/${id}/payments`, { method: 'POST', body: JSON.stringify(payment) })
}
