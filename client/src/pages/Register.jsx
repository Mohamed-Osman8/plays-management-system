import { useState } from 'react'
import { useApp } from '../context/useApp'
import { registerShop } from '../services/api'
import PwaInstallButton from '../components/PwaInstallButton'
import BrandMark from '../components/BrandMark'

export default function Register() {
  const { setRoute } = useApp()
  const [form, setForm] = useState({ storeName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await registerShop({
        ...form,
        storeName: form.storeName.trim(),
        email: form.email.trim().toLowerCase(),
      })
      setSuccess(result.message || 'Diiwaangelintu way guulaysatay. Akoonkaagu wuxuu sugayaa oggolaanshaha maamulka. Fadlan kala xiriir Mohamed Osman (+251940867287).')
    } catch (requestError) {
      setError(requestError.message || 'Unable to create your shop.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="onboarding-shell onboarding-page">
      <header className="onboarding-header">
        <a className="sidebar-brand" href="#login" onClick={(event) => { event.preventDefault(); setRoute('login') }}>
          <BrandMark />
          <span>PLAYSTATION<br /><b>GAME ZONE</b></span>
        </a>
        <PwaInstallButton />
      </header>
      <form className="panel onboarding-card" onSubmit={submit}>
        <button className="onboarding-close" type="button" aria-label="Close shop registration and return to sign in" title="Back to sign in" onClick={() => setRoute('login')}>×</button>
        <span className="eyebrow">Create your store</span>
        <h1>Create your game zone</h1>
        <p>Register your store. The platform administrator must approve your shop before you can sign in.</p>
        <label>Store name<input value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} minLength="2" maxLength="120" autoComplete="organization" required disabled={busy || Boolean(success)} /></label>
        <label>Email address<input type="email" autoComplete="email" maxLength="254" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required disabled={busy || Boolean(success)} /></label>
        <label>Password<input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength="10" maxLength="128" required disabled={busy || Boolean(success)} /></label>
        {error && <small className="form-error" role="alert">{error}</small>}
        {success && <div className="registration-success" role="status"><span aria-hidden="true">✓</span><p>{success}</p></div>}
        {!success && <button className="button button-primary" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> Creating shop…</> : 'Create shop'}</button>}
        <button className="text-button" type="button" onClick={() => setRoute('login')}>{success ? 'Continue to sign in' : 'Already registered? Sign in'}</button>
      </form>
    </main>
  )
}
