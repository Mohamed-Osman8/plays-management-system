import { useEffect, useState } from 'react'
import { useApp } from '../context/useApp'
import { formatBirr } from '../utils/currency'

const initialStations = [
  { id: 'demo-ps5-01', name: 'PS5 · Alpha', type: 'PS5', status: 'playing', hourlyRate: 80, startedAt: -42 * 60, elapsedSeconds: 0 },
  { id: 'demo-ps5-02', name: 'PS5 · Beta', type: 'PS5', status: 'available', hourlyRate: 80, elapsedSeconds: 0 },
  { id: 'demo-ps4-01', name: 'PS4 · One', type: 'PS4', status: 'reserved', hourlyRate: 50, elapsedSeconds: 0 },
  { id: 'demo-ps4-02', name: 'PS4 · Two', type: 'PS4', status: 'maintenance', hourlyRate: 50, elapsedSeconds: 0 }
]

const revenueBars = [
  { day: 'Mon', height: 38 },
  { day: 'Tue', height: 55 },
  { day: 'Wed', height: 47 },
  { day: 'Thu', height: 72 },
  { day: 'Fri', height: 63 },
  { day: 'Sat', height: 92 },
  { day: 'Sun', height: 78 }
]

function elapsedLabel(seconds) {
  const elapsed = Math.max(0, Math.floor(seconds))
  return [Math.floor(elapsed / 3600), Math.floor((elapsed % 3600) / 60), elapsed % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

export default function DemoMode() {
  const { setRoute } = useApp()
  const [stations, setStations] = useState(initialStations)
  const [now, setNow] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setNow((current) => current + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const updateStation = (id, action) => {
    const actionTime = now
    setStations((current) => current.map((station) => {
      if (station.id !== id) return station
      if (action === 'start') return { ...station, status: 'playing', startedAt: actionTime, elapsedSeconds: 0 }
      if (action === 'pause') {
        const elapsedSeconds = station.elapsedSeconds + (station.startedAt !== undefined ? actionTime - station.startedAt : 0)
        return { ...station, status: 'paused', startedAt: undefined, elapsedSeconds }
      }
      if (action === 'resume') return { ...station, status: 'playing', startedAt: actionTime }
      return { ...station, status: 'available', startedAt: undefined, elapsedSeconds: 0 }
    }))
  }

  const activeCount = stations.filter((station) => station.status === 'playing').length
  const totalRevenue = 5840

  return (
    <main className="demo-experience">
      <header className="demo-topbar">
        <a className="sidebar-brand" href="#home" onClick={(event) => { event.preventDefault(); setRoute('booking') }}>
          <span className="brand-mark">P</span><span>GAME<br /><b>ZONE</b></span>
        </a>
        <span className="demo-label">INTERACTIVE DEMO · SAMPLE DATA</span>
        <div className="demo-top-actions">
          <button className="button button-secondary" type="button" onClick={() => setRoute('booking')}>Exit demo</button>
          <button className="button button-primary" type="button" onClick={() => setRoute('register')}>Start 60-day trial</button>
        </div>
      </header>

      <div className="demo-content">
        <section className="demo-welcome">
          <div><span className="eyebrow">Good afternoon, demo owner</span><h1>Matrix Game Zone</h1><p>Explore a realistic shop dashboard. Every action here uses sample data only.</p></div>
          <span className="demo-live"><i /> Demo environment</span>
        </section>

        <section className="stats-grid demo-stats">
          <div className="stat-card"><span>Today's revenue</span><strong>{formatBirr(totalRevenue)}</strong><small>Sessions, products and memberships</small></div>
          <div className="stat-card stat-cyan"><span>Active stations</span><strong>{activeCount}/{stations.length}</strong><small>Live from the floor plan</small></div>
          <div className="stat-card stat-purple"><span>Sessions today</span><strong>18</strong><small>42.5 playing hours</small></div>
          <div className="stat-card stat-orange"><span>Low stock items</span><strong>3</strong><small>Products at 5 units or below</small></div>
        </section>

        <section className="demo-main-grid">
          <div className="panel demo-stations-panel">
            <div className="panel-heading"><div><span className="eyebrow">Live floor plan</span><h3>Gaming stations</h3></div><span className="demo-live"><i /> Live preview</span></div>
            <div className="station-grid demo-station-grid">
              {stations.map((station) => {
                const playing = station.status === 'playing' || station.status === 'paused'
                const elapsedSeconds = station.elapsedSeconds + (station.startedAt !== undefined ? now - station.startedAt : 0)
                const amount = station.hourlyRate * elapsedSeconds / 3600
                return (
                  <article className={`station-card station-${station.status}`} key={station.id}>
                    <div className="station-screen"><span>{station.type}</span><strong>{station.name}</strong><small>{station.status}</small></div>
                    <div className="demo-station-meta"><span>{playing ? elapsedLabel(elapsedSeconds) : 'Ready'}</span><strong>{playing ? formatBirr(amount) : formatBirr(station.hourlyRate) + '/hr'}</strong></div>
                    <div className="station-actions">
                      {station.status === 'available' && <button className="button button-primary" type="button" onClick={() => updateStation(station.id, 'start')}>Start</button>}
                      {station.status === 'playing' && <button className="button button-secondary" type="button" onClick={() => updateStation(station.id, 'pause')}>Pause</button>}
                      {station.status === 'paused' && <button className="button button-secondary" type="button" onClick={() => updateStation(station.id, 'resume')}>Resume</button>}
                      {playing && <button className="button button-danger" type="button" onClick={() => updateStation(station.id, 'end')}>End</button>}
                      {!playing && station.status !== 'available' && <span className="demo-status-note">Sample status</span>}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
          <aside className="panel demo-revenue-panel">
            <div className="panel-heading"><div><span className="eyebrow">Performance</span><h3>Weekly revenue</h3></div></div>
            <div className="revenue-total"><strong>{formatBirr(totalRevenue)}</strong><small>Example revenue for the current week</small></div>
            <div className="chart demo-chart"><div className="chart-bars">{revenueBars.map((bar) => <div className="bar-group" key={bar.day}><i style={{ height: `${bar.height}%` }} /><small>{bar.day}</small></div>)}</div></div>
            <div className="demo-demo-note"><strong>Inventory snapshot</strong><span>Soft drinks · 24 in stock</span><span>Snacks · 12 in stock</span><span>Memberships · 8 active</span></div>
          </aside>
        </section>

        <div className="demo-bottom-cta"><span><strong>Ready to manage your own store?</strong><small>Register in minutes. Your 60-day free trial starts automatically.</small></span><button className="button button-primary" type="button" onClick={() => setRoute('register')}>Create your shop →</button></div>
        <p className="demo-disclaimer">Demo mode is isolated from your account and does not create, update or delete server records.</p>
      </div>
    </main>
  )
}
