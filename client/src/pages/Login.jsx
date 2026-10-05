import { useState } from 'react'
import { useApp } from '../context/useApp'

export default function Login() {
  const { login, setRoute } = useApp()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await login(form.username, form.password)
      if (!result.ok) {
        setError(result.message || 'Unable to sign in.')
        return
      }
      setRoute(result.licenseRequired ? 'license' : 'dashboard')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="onboarding-shell">
      <form className="panel onboarding-card" onSubmit={submit}>
        <span className="eyebrow">Game Zone account</span>
        <h1>Sign in</h1>
        <p>Access your shop dashboard.</p>
        <label>Phone number or username<input autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required /></label>
        <label>Password or PIN<input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
        {error && <small className="form-error" role="alert">{error}</small>}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button className="text-button" type="button" onClick={() => setRoute('register')}>Create a new shop</button>
      </form>
    </main>
  )
}
