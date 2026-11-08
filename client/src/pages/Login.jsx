import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/useApp'
import BrandMark from '../components/BrandMark'
import { requestPasswordReset, resetPasswordWithOtp, verifyEmail } from '../services/api'

const verificationRequests = new Map()

function verifyEmailOnce(token) {
  if (!verificationRequests.has(token)) {
    const request = verifyEmail(token)
    verificationRequests.set(token, request)
    const clearRequest = () => {
      window.setTimeout(() => verificationRequests.delete(token), 0)
    }
    request.then(clearRequest, clearRequest)
  }
  return verificationRequests.get(token)
}

export default function Login() {
  const { login, setRoute } = useApp()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState(() => (
    new URLSearchParams(window.location.search).has('verifyEmail')
      ? 'Verifying your email address…'
      : ''
  ))
  const verificationToken = useRef(new URL(window.location.href).searchParams.get('verifyEmail'))

  useEffect(() => {
    const token = verificationToken.current
    if (!token) return undefined

    let active = true
    const clearVerificationToken = () => {
      if (!active) return
      const url = new URL(window.location.href)
      url.searchParams.delete('verifyEmail')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
      verificationToken.current = null
    }
    verifyEmailOnce(token)
      .then((result) => {
        clearVerificationToken()
        if (active) setVerificationMessage(result.message || 'Email verified. Your shop is waiting for administrator approval.')
      })
      .catch((requestError) => {
        clearVerificationToken()
        if (active) setVerificationMessage(requestError.message || 'Unable to verify your email. Request a new link and try again.')
      })
    return () => { active = false }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await login(form.email, form.password)
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
          <div className="login-controller-art" aria-hidden="true">
            <svg viewBox="0 0 760 470" role="presentation" focusable="false">
              <defs>
                <linearGradient id="pad-shell" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#f4f8ff" />
                  <stop offset=".22" stopColor="#bfcbdc" />
                  <stop offset=".5" stopColor="#e9eef8" />
                  <stop offset=".78" stopColor="#8494a9" />
                  <stop offset="1" stopColor="#dce4f1" />
                </linearGradient>
                <linearGradient id="pad-face" x1=".15" y1="0" x2=".8" y2="1">
                  <stop offset="0" stopColor="#29364b" />
                  <stop offset=".45" stopColor="#121b2c" />
                  <stop offset="1" stopColor="#080e19" />
                </linearGradient>
                <linearGradient id="pad-grip" x1="0" y1="0" x2=".8" y2="1">
                  <stop offset="0" stopColor="#e7edf7" />
                  <stop offset="1" stopColor="#9aa9be" />
                </linearGradient>
                <linearGradient id="pad-touch" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#1c2a40" />
                  <stop offset="1" stopColor="#080d17" />
                </linearGradient>
                <radialGradient id="pad-glow">
                  <stop stopColor="#9d7cff" stopOpacity=".92" />
                  <stop offset=".45" stopColor="#449dff" stopOpacity=".55" />
                  <stop offset="1" stopColor="#49dfff" stopOpacity="0" />
                </radialGradient>
                <filter id="pad-shadow" x="-.3" y="-.4" width="1.7" height="1.9">
                  <feGaussianBlur in="SourceAlpha" stdDeviation="13" />
                  <feOffset dy="18" />
                  <feComponentTransfer><feFuncA type="linear" slope=".54" /></feComponentTransfer>
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="pad-soft-glow" x="-.6" y="-.6" width="2.2" height="2.2">
                  <feGaussianBlur stdDeviation="16" />
                </filter>
              </defs>
              <ellipse cx="382" cy="292" rx="325" ry="115" fill="url(#pad-glow)" opacity=".68" filter="url(#pad-soft-glow)" />
              <g filter="url(#pad-shadow)" transform="rotate(-8 380 230)">
                <path d="M167 102c-31 0-58 21-70 51L42 294c-16 45 13 83 58 79l94-9 58-38h253l58 38 94 9c45 4 74-34 58-79l-55-141c-12-30-39-51-70-51h-70l-50 26H287l-50-26Z" fill="#64748a" opacity=".55" transform="translate(0 11)" />
                <path d="M167 91c-31 0-58 21-70 51L42 283c-16 45 13 83 58 79l94-9 58-38h253l58 38 94 9c45 4 74-34 58-79l-55-141c-12-30-39-51-70-51h-70l-50 26H287l-50-26Z" fill="url(#pad-shell)" stroke="#f8fbff" strokeOpacity=".8" strokeWidth="3" />
                <path d="M164 109c-22 0-43 16-52 40L63 278c-10 27 7 50 34 48l88-8 51-35h288l51 35 88 8c27 2 44-21 34-48l-49-129c-9-24-30-40-52-40h-55l-48 24H267l-48-24Z" fill="url(#pad-face)" stroke="#8292a8" strokeOpacity=".5" strokeWidth="2" />
                <path d="M292 104h176l26 20-21 94H288l-21-94Z" fill="#111a2a" stroke="#71839a" strokeOpacity=".34" strokeWidth="2" />
                <rect x="304" y="120" width="151" height="82" rx="22" fill="url(#pad-touch)" stroke="#91a2bc" strokeOpacity=".5" strokeWidth="3" />
                <rect x="313" y="128" width="133" height="65" rx="17" fill="#111b2b" stroke="#eff4ff" strokeOpacity=".14" />
                <path d="M329 180c25-25 57-31 106-39" fill="none" stroke="#59c8ff" strokeOpacity=".55" strokeWidth="3" />
                <path d="M344 186c25-21 53-25 88-32" fill="none" stroke="#a57cff" strokeOpacity=".6" strokeWidth="2" />
                <circle cx="380" cy="218" r="13" fill="#eaf4ff" stroke="#96a9c5" strokeWidth="3" />
                <circle cx="380" cy="218" r="5" fill="#3ba9ff" />
                <path d="M334 100h92" stroke="#d7e5f7" strokeWidth="5" strokeLinecap="round" opacity=".75" />
                <path d="M333 207c-20 1-30 11-35 28" fill="none" stroke="#41c9ff" strokeWidth="5" strokeLinecap="round" opacity=".68" />
                <path d="M427 207c20 1 30 11 35 28" fill="none" stroke="#a47aff" strokeWidth="5" strokeLinecap="round" opacity=".68" />
                <g transform="translate(202 228)">
                  <circle cx="0" cy="0" r="50" fill="#07101d" stroke="#52647d" strokeWidth="4" />
                  <circle cx="0" cy="-4" r="34" fill="#1b283b" stroke="#07101a" strokeWidth="5" />
                  <circle cx="0" cy="-7" r="25" fill="#101a29" stroke="#8da0b8" strokeOpacity=".45" strokeWidth="2" />
                  <path d="M-11-24c6-6 17-8 25-2" fill="none" stroke="#f6fbff" strokeOpacity=".27" strokeWidth="4" strokeLinecap="round" />
                  <circle cx="-13" cy="-17" r="3" fill="#5edcff" opacity=".8" />
                </g>
                <g transform="translate(558 228)">
                  <circle cx="0" cy="0" r="50" fill="#07101d" stroke="#52647d" strokeWidth="4" />
                  <circle cx="0" cy="-4" r="34" fill="#1b283b" stroke="#07101a" strokeWidth="5" />
                  <circle cx="0" cy="-7" r="25" fill="#101a29" stroke="#8da0b8" strokeOpacity=".45" strokeWidth="2" />
                  <path d="M-11-24c6-6 17-8 25-2" fill="none" stroke="#f6fbff" strokeOpacity=".27" strokeWidth="4" strokeLinecap="round" />
                  <circle cx="-13" cy="-17" r="3" fill="#ad83ff" opacity=".85" />
                </g>
                <g transform="translate(125 197)" fill="#b9c9de">
                  <rect x="-12" y="-40" width="24" height="80" rx="6" />
                  <rect x="-40" y="-12" width="80" height="24" rx="6" />
                  <circle r="7" fill="#eaf2ff" />
                </g>
                <g transform="translate(635 184)" fontFamily="Arial, sans-serif" fontSize="18" fontWeight="700" textAnchor="middle">
                  <circle cy="-34" r="18" fill="#19273b" stroke="#9c7dff" strokeWidth="3" /><text y="-28" fill="#c6a9ff">△</text>
                  <circle cx="-34" r="18" fill="#19273b" stroke="#5bd9ff" strokeWidth="3" /><text x="-34" y="6" fill="#73e4ff">□</text>
                  <circle cx="34" r="18" fill="#19273b" stroke="#ff779f" strokeWidth="3" /><text x="34" y="6" fill="#ff91b0">○</text>
                  <circle cy="34" r="18" fill="#19273b" stroke="#78e0bc" strokeWidth="3" /><text y="40" fill="#86edca">×</text>
                </g>
                <path d="M282 102c20-12 46-17 72-17h52c26 0 52 5 72 17" fill="none" stroke="#f9fbff" strokeOpacity=".58" strokeWidth="4" strokeLinecap="round" />
                <path d="M105 306c-11 20-1 35 17 34l55-5m478-29c11 20 1 35-17 34l-55-5" fill="none" stroke="url(#pad-grip)" strokeWidth="11" strokeLinecap="round" opacity=".78" />
              </g>
            </svg>
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
            {verificationMessage && <p className="login-form-intro" role="status">{verificationMessage}</p>}

            <label className="login-field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="Enter your email address"
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
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [step, setStep] = useState('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const sendCode = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await requestPasswordReset(email)
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
      await resetPasswordWithOtp({ email, otp, newPassword })
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
        {step === 'email' && <>
          <p>Enter the email address linked to your account. We’ll send a 6-digit verification code.</p>
          <form className="forgot-password-form" onSubmit={sendCode}>
            <label>Email address
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your email address" maxLength="254" required />
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
          <button className="forgot-password-resend" type="button" onClick={() => { setStep('email'); setError(''); setMessage('') }}>Resend code or change email address</button>
        </>}
        {step === 'success' && <>
          <p className="forgot-password-success" role="status">{message}</p>
          <button className="button button-primary login-submit" type="button" onClick={onClose}>Back to sign in</button>
        </>}
      </section>
    </div>
  )
}
