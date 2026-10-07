import { useLayoutEffect, useState } from 'react'

function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
}

function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(isAppInstalled)
  const [showInstallNotice, setShowInstallNotice] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
      setShowInstallNotice(true)
      setError('')
    }
    const handleInstalled = () => {
      setInstallPrompt(null)
      setInstalled(true)
      setShowInstallNotice(false)
      setShowHelp(false)
    }
    const displayMode = window.matchMedia('(display-mode: standalone)')
    const handleDisplayModeChange = () => setInstalled(isAppInstalled())

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    displayMode.addEventListener?.('change', handleDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      displayMode.removeEventListener?.('change', handleDisplayModeChange)
    }
  }, [])

  const installApp = async () => {
    setShowHelp(false)
    setError('')

    if (!installPrompt) {
      setShowHelp(true)
      return
    }

    try {
      await installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      setInstallPrompt(null)
      setShowInstallNotice(false)
      if (outcome === 'accepted') setInstalled(true)
      else setShowHelp(true)
    } catch (installError) {
      console.error('PWA install prompt failed.', installError)
      setInstallPrompt(null)
      setError('The install prompt could not be opened. Try your browser menu.')
      setShowHelp(true)
    }
  }

  if (installed) return null

  return (
    <div className="pwa-install-control">
      <button
        className="button button-primary pwa-install-button"
        type="button"
        aria-expanded={showHelp}
        aria-controls="pwa-install-help"
        onClick={installApp}
      >
        Install app
      </button>
      {showInstallNotice && installPrompt && (
        <aside className="pwa-install-notice" role="status" aria-live="polite">
          <button
            className="pwa-install-notice-close"
            type="button"
            aria-label="Dismiss install suggestion"
            onClick={() => setShowInstallNotice(false)}
          >
            ×
          </button>
          <strong>Install Game Zone</strong>
          <p>Add the app to your device for quicker access.</p>
          <button className="button button-primary" type="button" onClick={installApp}>Install app</button>
        </aside>
      )}
      {showHelp && (
        <aside className="pwa-install-help" id="pwa-install-help" role="status" aria-live="polite">
          <button
            className="pwa-install-help-close"
            type="button"
            aria-label="Close install instructions"
            onClick={() => setShowHelp(false)}
          >
            ×
          </button>
          <strong>{error || 'Install Game Zone'}</strong>
          <p>
            {isIosDevice()
              ? 'In Safari, tap Share, then “Add to Home Screen”.'
              : 'If this browser has not offered the prompt or you dismissed it, open its menu and choose “Install app” or “Add to Home screen”.'}
          </p>
        </aside>
      )}
    </div>
  )
}

export default PwaInstallButton
