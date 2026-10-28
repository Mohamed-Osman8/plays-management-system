const API_BASE_URL = (import.meta.env.VITE_API_URL?.trim() || (import.meta.env.DEV ? 'http://localhost:5001/api' : '')).replace(/\/$/, '')
const TOKEN_KEYS = ['playstation-game-zone-token', 'token', 'authToken']

function getApiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_URL is required in the production frontend environment.')
  }

  const apiUrl = new URL(`${API_BASE_URL}${path}`, window.location.origin)
  if (window.location.protocol === 'https:' && apiUrl.protocol !== 'https:') {
    throw new Error('VITE_API_URL must use HTTPS when the frontend is served over HTTPS.')
  }

  return apiUrl
}

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
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (options.body != null && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(getApiUrl(path), {
    ...options,
    headers,
    cache: 'no-store',
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
  const email = String(credentials.email || '').trim().toLowerCase()
  const password = String(credentials.password ?? '')
  const payload = { email }

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

export function requestPasswordReset(email) {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: String(email || '').trim().toLowerCase() })
  })
}

export function resetPasswordWithOtp({ email, otp, newPassword }) {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), otp, newPassword })
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

export function updateUser(id, userData) {
  return request(`/users/${id}`, {
    method: 'PUT',
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

export function transferStationSession(id, stationId) {
  return request(`/sessions/${id}/transfer`, {
    method: 'PUT',
    body: JSON.stringify({ stationId })
  })
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

export function getShopPaymentHistory() {
  return request('/payments')
}

export function submitShopPayment(payment) {
  return request('/payments', { method: 'POST', body: JSON.stringify(payment) })
}

async function superAdminRequest(path, token, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body != null && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(getApiUrl(path), {
    ...options,
    headers,
    cache: 'no-store',
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.message || 'Super admin request failed.')
    Object.assign(error, body, { status: response.status })
    throw error
  }
  return body
}

export function superAdminLogin(credentials) {
  return request('/super-admin/login', {
    method: 'POST',
    body: JSON.stringify({ ...credentials, email: String(credentials.email || '').trim().toLowerCase() })
  })
}

export function superAdminListShops(token) {
  return superAdminRequest('/super-admin/shops', token)
}

export function superAdminListPendingShops(token) {
  return superAdminRequest('/super-admin/shops/pending', token)
}

export function superAdminListActiveShops(token) {
  return superAdminRequest('/super-admin/shops/active', token)
}

export function superAdminActivateShop(token, shopId) {
  return superAdminRequest(`/super-admin/shops/${shopId}/activate`, token, {
    method: 'POST',
    body: JSON.stringify({ paymentVerified: true, amount: 3000 })
  })
}

export function superAdminRejectShop(token, shopId, notes = '') {
  return superAdminRequest(`/super-admin/shops/${shopId}/reject`, token, {
    method: 'POST',
    body: JSON.stringify({ notes })
  })
}

export function superAdminDeactivateShop(token, shopId) {
  return superAdminRequest(`/super-admin/shops/${shopId}/deactivate`, token, { method: 'POST' })
}

export function superAdminListPendingPayments(token) {
  return superAdminRequest('/super-admin/payments/pending', token)
}

export function superAdminApprovePayment(token, paymentId) {
  return superAdminRequest(`/super-admin/payments/${paymentId}/approve`, token, { method: 'POST' })
}

export function superAdminRejectPayment(token, paymentId, notes) {
  return superAdminRequest(`/super-admin/payments/${paymentId}/reject`, token, {
    method: 'POST',
    body: JSON.stringify({ notes })
  })
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
