import { useEffect } from 'react'
import { useApp } from '../context/useApp'

function Navbar() {
  const { setRoute } = useApp()
  useEffect(() => {
    const handleHash = () => setRoute(window.location.hash.replace('#', '') || 'dashboard')
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [setRoute])
  return null
}

export default Navbar
