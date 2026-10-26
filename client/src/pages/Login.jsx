import { useState } from 'react'
import { useApp } from '../context/useApp'
import BrandMark from '../components/BrandMark'
import { requestPasswordReset, resetPasswordWithOtp } from '../services/api'

export default function Login() {
  const { login, setRoute } = useApp()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await login(form.username, form.password)
      if (!result.ok) {
        setError(result.message || 'Unable to sign in.')
        return
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

            <button className="login-forgot-button" type="button" onClick={() => setForgotPasswordOpen(true)}>
              Forgot Password?
            </button>
            {error && <small className="login-error" role="alert">{error}</small>}
            <button className="button button-primary login-submit" type="submit" disabled={busy}>
              {busy ? <><span className="spinner" /> Signing in…</> : <>Sign in <span aria-hidden="true">→</span></>}
            </button>
            <button className="login-create-shop" type="button" onClick={() => setRoute('register')}>
              Need an account? <b>Create your shop</b>
            </button>
            <div className="login-form-footer">
              <span className="login-secure-indicator"><i /> SECURE SIGN IN</span>
              <span>Need help? Contact your administrator.</span>
            </div>
          </form>
          <span className="login-copyright">© 2026 PLAYSTATION GAME ZONE</span>
        </section>
      </div>
      {forgotPasswordOpen && <ForgotPasswordModal onClose={() => setForgotPasswordOpen(false)} />}
    </main>
  )
}

function ForgotPasswordModal({ onClose }) {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [step, setStep] = useState('phone')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const sendCode = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await requestPasswordReset(phone.trim())
      setMessage(result.message || 'If an account exists, a verification code has been sent.')
      setStep('reset')
    } catch (requestError) {
      setError(requestError.message || 'Unable to send a verification code. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await resetPasswordWithOtp({ phone: phone.trim(), otp, newPassword })
      setStep('success')
      setMessage('Password-kaaga waa la beddelay, fadlan ku gal password-ka cusub.')
    } catch (requestError) {
      setError(requestError.message || 'Unable to reset your password. Please check the code and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="forgot-password-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="forgot-password-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-password-title">
        <button className="forgot-password-close" type="button" onClick={onClose} aria-label="Close password reset">×</button>
        <span className="eyebrow">ACCOUNT RECOVERY</span>
        <h2 id="forgot-password-title">{step === 'success' ? 'Password updated' : 'Forgot password?'}</h2>
        {step === 'phone' && <>
          <p>Enter the phone number linked to your account. We’ll send a 6-digit verification code.</p>
          <form className="forgot-password-form" onSubmit={sendCode}>
            <label>Phone number
              <input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter your phone number" maxLength="18" required />
            </label>
            {error && <small className="login-error" role="alert">{error}</small>}
            <button className="button button-primary login-submit" type="submit" disabled={busy}>{busy ? 'Sending code…' : 'Send Verification Code'}</button>
          </form>
        </>}
        {step === 'reset' && <>
          <p>{message}</p>
          <form className="forgot-password-form" onSubmit={resetPassword}>
            <label>6-digit verification code
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength="6" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required />
            </label>
            <label>New password
              <input type="password" autoComplete="new-password" minLength="10" maxLength="128" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 10 characters" required />
            </label>
            {error && <small className="login-error" role="alert">{error}</small>}
            <button className="button button-primary login-submit" type="submit" disabled={busy}>{busy ? 'Resetting password…' : 'Reset Password'}</button>
          </form>
          <button className="forgot-password-resend" type="button" onClick={() => { setStep('phone'); setError(''); setMessage('') }}>Resend code or change phone number</button>
        </>}
        {step === 'success' && <>
          <p className="forgot-password-success" role="status">{message}</p>
          <button className="button button-primary login-submit" type="button" onClick={onClose}>Back to sign in</button>
        </>}
      </section>
    </div>
  )
}
