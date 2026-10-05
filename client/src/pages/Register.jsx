import { useState } from 'react'
import { useApp } from '../context/useApp'
import { registerShop } from '../services/api'

export default function Register() {
  const { setRoute } = useApp()
  const [form, setForm] = useState({ storeName: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await registerShop(form)
      setSuccess(result.message)
      window.setTimeout(() => setRoute('login'), 1200)
    } catch (requestError) {
      setError(requestError.message || 'Unable to create your shop.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="onboarding-shell">
      <form className="panel onboarding-card" onSubmit={submit}>
        <span className="eyebrow">Start your free trial</span>
        <h1>Create your game zone</h1>
        <p>Register your store with a phone number and receive 60 days of free access.</p>
        <label>Store name<input value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} maxLength="120" required /></label>
        <label>Admin phone<input type="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
        <label>Password<input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength="10" maxLength="128" required /></label>
        {error && <small className="form-error" role="alert">{error}</small>}
        {success && <small className="form-success" role="status">{success} Redirecting to sign in…</small>}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Creating shop…' : 'Create shop'}</button>
        <button className="text-button" type="button" onClick={() => setRoute('login')}>Already registered? Sign in</button>
      </form>
    </main>
  )
}
