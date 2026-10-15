import { useState } from 'react'
import { useApp } from '../context/useApp'
import { registerShop } from '../services/api'
import PwaInstallButton from '../components/PwaInstallButton'
import BrandMark from '../components/BrandMark'

export default function Register() {
  const { setRoute } = useApp()
  const [form, setForm] = useState({ storeName: '', phone: '', password: '' })
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
        phone: form.phone.trim(),
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
        <a className="sidebar-brand" href="#booking" onClick={(event) => { event.preventDefault(); setRoute('booking') }}>
          <BrandMark />
          <span>PLAYSTATION<br /><b>GAME ZONE</b></span>
        </a>
        <PwaInstallButton />
      </header>
      <form className="panel onboarding-card" onSubmit={submit}>
        <button className="onboarding-close" type="button" aria-label="Close shop registration and return to the booking portal" title="Back to booking portal" onClick={() => setRoute('booking')}>×</button>
        <span className="eyebrow">Create your store</span>
        <h1>Create your game zone</h1>
        <p>Register your store. The platform administrator must approve your shop before you can sign in.</p>
        <label>Store name<input value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} minLength="2" maxLength="120" autoComplete="organization" required disabled={busy || Boolean(success)} /></label>
        <label>Admin phone<input type="tel" inputMode="tel" autoComplete="tel" pattern="\+?[0-9 ]{7,18}" title="Use 7 to 18 digits and spaces, optionally starting with +." value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required disabled={busy || Boolean(success)} /></label>
        <label>Password<input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength="10" maxLength="128" required disabled={busy || Boolean(success)} /></label>
        {error && <small className="form-error" role="alert">{error}</small>}
        {success && <div className="registration-success" role="status"><span aria-hidden="true">✓</span><p>{success}</p></div>}
        {!success && <button className="button button-primary" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> Creating shop…</> : 'Create shop'}</button>}
        <button className="text-button" type="button" onClick={() => setRoute('login')}>{success ? 'Continue to sign in' : 'Already registered? Sign in'}</button>
      </form>
    </main>
  )
}
