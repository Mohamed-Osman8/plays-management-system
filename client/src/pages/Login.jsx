import { useState } from 'react'
import { useApp } from '../context/useApp'
import PwaInstallButton from '../components/PwaInstallButton'
import BrandMark from '../components/BrandMark'

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
        setError(result.message || 'Unable to sign in.')
        return
      }
      setRoute(result.licenseRequired ? 'license' : 'dashboard')
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="onboarding-shell onboarding-page login-simple-page">
      <header className="onboarding-header">
        <a className="sidebar-brand" href="#login" onClick={(event) => { event.preventDefault(); setRoute('login') }}>
          <BrandMark />
          <span>PLAYSTATION<br /><b>GAME ZONE</b></span>
        </a>
        <PwaInstallButton />
      </header>
      <form className="panel onboarding-card login-simple-card" onSubmit={submit}>
        <BrandMark />
        <span className="eyebrow">SECURE STAFF ACCESS</span>
        <h1>Sign in</h1>
        <p>Access your shop dashboard.</p>
        <label>Phone number or username<input autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Enter your phone or username" required /></label>
        <label>Password or PIN<span className="login-simple-password"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password or PIN" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></span></label>
        {error && <small className="form-error" role="alert">{error}</small>}
        <button className="button button-primary login-simple-submit" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> Signing in…</> : 'Sign in'}</button>
        <div className="login-simple-links">
          <button className="text-button" type="button" onClick={() => setRoute('register')}>Create your shop</button>
          <button className="text-button" type="button" onClick={() => setRoute('booking')}>Customer booking</button>
        </div>
        <small className="login-hint">For access or credential resets, contact your administrator.</small>
      </form>
    </main>
  )
}
