import { useEffect, useRef, useState } from 'react'
import { getJson } from '../data/useDashboardData'
import type { SeasonData } from '../types'
import { DriverSeason } from './DriverSeason'
import { ConstructorStandings, DriverStandings } from './StandingsTable'
import { WinnersStrip } from './WinnersStrip'

const SEASONS = Array.from({ length: 13 }, (_, i) => 2026 - i)
const fromSite = (year: number) => getJson<SeasonData>(`seasons/${year}.json`)

export function SeasonStats({ loadSeason = fromSite }: { loadSeason?: (year: number) => Promise<SeasonData> }) {
  const cache = useRef(new Map<number, SeasonData>())
  const [year, setYear] = useState(2026)
  const [season, setSeason] = useState<SeasonData | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<'drivers' | 'constructors'>('drivers')
  const [driverId, setDriverId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    const cached = cache.current.get(year)
    setError(false)
    if (cached) setSeason(cached)
    else {
      setSeason(null)
      loadSeason(year)
        .then((s) => {
          cache.current.set(year, s)
          if (live) setSeason(s)
        })
        .catch(() => live && setError(true))
    }
    return () => {
      live = false
    }
  }, [year, loadSeason, attempt])

  const driver = season?.drivers.find((d) => d.id === driverId) ?? season?.drivers[0]

  return (
    <>
      <div className="toolbar">
        <label className="inline-field" htmlFor="season">
          <span>Season</span>
          <select id="season" value={year} onChange={(e) => { setYear(Number(e.target.value)); setDriverId(null) }}>
            {SEASONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div className="tabs" role="group" aria-label="Standings">
          <button type="button" aria-pressed={tab === 'drivers'} onClick={() => setTab('drivers')}>Drivers</button>
          <button type="button" aria-pressed={tab === 'constructors'} onClick={() => setTab('constructors')}>Constructors</button>
        </div>
      </div>

      {error && (
        <p className="status" role="alert">
          Couldn&apos;t load the {year} season. <button type="button" className="action quiet" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
        </p>
      )}
      {!error && !season && <p className="status">Loading {year}…</p>}

      {season && driver && (
        <>
          <h2 className="section-title">Race winners, {season.season}</h2>
          <WinnersStrip season={season} onPick={(id) => { setDriverId(id); setTab('drivers') }} />
          <div className="split">
            {tab === 'drivers'
              ? <DriverStandings season={season} selectedId={driver.id} onSelect={setDriverId} />
              : <ConstructorStandings season={season} />}
            <DriverSeason driver={driver} season={season} />
          </div>
        </>
      )}
    </>
  )
}
