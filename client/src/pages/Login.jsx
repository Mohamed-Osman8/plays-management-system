import { useState } from 'react'
import { useApp } from '../context/useApp'
import BrandMark from '../components/BrandMark'
import { superAdminLogin } from '../services/api'

export default function Login() {
  const { login, setRoute } = useApp()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await login(form.username, form.password)
      if (!result.ok) {
        try {
          const superAdminResult = await superAdminLogin({
            username: form.username.trim(),
            password: form.password
          })
          const token = superAdminResult.token
          const user = superAdminResult.user || {
            username: form.username.trim(),
            role: 'superadmin'
          }
          const role = String(user.role || '').trim().toLowerCase()
          if (!token || role !== 'superadmin') {
            throw new Error('The account does not have an authorized Super Admin role.')
          }

          window.localStorage.setItem('game-zone-super-admin-token', token)
          window.localStorage.setItem('game-zone-super-admin-user', JSON.stringify(user))
          setRoute('super-admin')
          return
        } catch (superAdminError) {
          setError(result.message || superAdminError.message || 'Unable to sign in.')
          return
        }
      }
      const role = String(result.user?.role || result.role || '').trim().toLowerCase()
      setRoute(result.superAdmin || role === 'superadmin'
        ? 'super-admin'
        : result.licenseRequired ? 'license' : 'dashboard')
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-backdrop-grid" aria-hidden="true" />
      <div className="login-layout">
        <section className="login-showcase">
          <a className="login-brand" href="#login" onClick={(event) => event.preventDefault()}>
            <BrandMark />
            <span>PLAYSTATION<br /><b>GAME ZONE</b></span>
          </a>
          <div className="login-showcase-copy">
            <span className="login-system-tag"><i /> GAME ZONE OPERATIONS</span>
            <p className="login-showcase-kicker">PLAY <i>·</i> MANAGE <i>·</i> GROW</p>
            <h1>Your game zone.<br /><span>In control.</span></h1>
            <p className="login-showcase-description">Every station, session and sale — together in one place.</p>
            <div className="login-showcase-status">
              <span className="login-status-icon" aria-hidden="true">↗</span>
              <span><b>One smart dashboard</b><small>Made for the way you play</small></span>
              <span className="login-status-pulse" aria-hidden="true" />
            </div>
          </div>
          <p className="login-showcase-footer">PLAYSTATION GAME ZONE <i /> MANAGEMENT SYSTEM</p>
          <div className="login-orbit login-orbit-one" aria-hidden="true" />
          <div className="login-orbit login-orbit-two" aria-hidden="true" />
        </section>

        <section className="login-form-side">
          <form className="login-form-card" onSubmit={submit}>
            <div className="login-mobile-brand"><BrandMark /><span>PLAYSTATION <b>GAME ZONE</b></span></div>
            <span className="eyebrow login-eyebrow">SECURE STAFF ACCESS</span>
            <h2>Welcome back<span>.</span></h2>
            <p className="login-form-intro">Sign in to your operations dashboard.</p>

            <label className="login-field">
              <span>Phone number or username</span>
              <input
                autoComplete="username"
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="Enter your phone or username"
                required
              />
            </label>

            <label className="login-field">
              <span>Password or PIN</span>
              <span className="login-password-input">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="Enter your password or PIN"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'HIDE' : 'SHOW'}
                </button>
              </span>
            </label>

            {error && <small className="login-error" role="alert">{error}</small>}
            <button className="button button-primary login-submit" type="submit" disabled={busy}>
              {busy ? <><span className="spinner" /> Signing in…</> : <>Sign in <span aria-hidden="true">→</span></>}
            </button>
            <button className="login-create-shop" type="button" onClick={() => setRoute('register')}>
              Need an account? <b>Create your shop</b>
            </button>
            <button className="login-platform-link" type="button" onClick={() => setRoute('super-admin')}>
              Platform owner? <b>Super Admin sign in</b>
            </button>
            <div className="login-form-footer">
              <span className="login-secure-indicator"><i /> SECURE SIGN IN</span>
              <span>Need help? Contact your administrator.</span>
            </div>
          </form>
          <span className="login-copyright">© 2026 PLAYSTATION GAME ZONE</span>
        </section>
      </div>
    </main>
  )
}
