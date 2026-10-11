import { useState } from 'react'
import { useApp } from '../context/useApp'
import PwaInstallButton from '../components/PwaInstallButton'
import BrandMark from '../components/BrandMark'

export default function Login() {
  const { login, setRoute } = useApp()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
    <main className="onboarding-shell onboarding-page">
      <header className="onboarding-header">
        <a className="sidebar-brand" href="#booking" onClick={(event) => { event.preventDefault(); setRoute('booking') }}>
          <BrandMark />
          <span>PLAYSTATION<br /><b>GAME ZONE</b></span>
        </a>
        <PwaInstallButton />
      </header>
      <form className="panel onboarding-card" onSubmit={submit}>
        <button className="onboarding-close" type="button" aria-label="Close sign in and return to the booking portal" title="Back to booking portal" onClick={() => setRoute('booking')}>×</button>
        <span className="eyebrow">Game Zone account</span>
        <h1>Sign in</h1>
        <p>Access your shop dashboard.</p>
        <label>Phone number or username<input autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required /></label>
        <label>Password or PIN<input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
        {error && <small className="form-error" role="alert">{error}</small>}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button className="text-button" type="button" onClick={() => setRoute('register')}>Create shop</button>
      </form>
    </main>
  )
}
