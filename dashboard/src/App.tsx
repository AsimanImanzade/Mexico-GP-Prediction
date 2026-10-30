import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Footer, Masthead, ModeSwitch, type Mode } from './components/Chrome'
import { DriverPanel } from './components/DriverPanel'
import { GridEditor, type RealStatus } from './components/GridEditor'
import { ModelReliability } from './components/ModelReliability'
import { RaceResult } from './components/RaceResult'
import { SeasonStats } from './components/SeasonStats'
import { TimingTower } from './components/TimingTower'
import { fetchQualifying, fetchRaceResults, toGrid, type QualiRow, type RaceRow } from './data/jolpica'
import { useDashboardData, type DashboardData } from './data/useDashboardData'
import { raceOutcome } from './model/outcome'
import { gridReducer, initialGrid } from './state/gridReducer'

function Dashboard({ data }: { data: DashboardData }) {
  const { mexico, model } = data
  const [mode, setMode] = useState<Mode>('before')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [grid, dispatch] = useReducer(gridReducer, mexico, initialGrid)
  const [real, setReal] = useState<RealStatus>({ status: 'idle' })
  const [qualiRows, setQualiRows] = useState<QualiRow[] | null>(null)
  const [raceRows, setRaceRows] = useState<RaceRow[] | null>(null)
  const userNavigated = useRef(false)

  const loadReal = useCallback(
    async () => {
      setReal({ status: 'checking' })
      try {
        const result = await fetchQualifying(mexico.meta.qualifyingUrl)
        if (result.status === 'ok') {
          dispatch({ type: 'loadReal', ...toGrid(result.rows, mexico.drivers) })
          setQualiRows(result.rows)
        }
        setReal(result.status === 'error' ? { status: 'error', message: result.message } : { status: result.status })
        return result.status === 'ok'
      } catch {
        setReal({ status: 'error', message: 'Something went wrong loading qualifying. Try again later.' })
        return false
      }
    },
    [mexico],
  )

  const loadRace = useCallback(async () => {
    const result = await fetchRaceResults(mexico.meta.resultsUrl)
    if (result.status === 'ok') setRaceRows(result.rows)
    return result.status === 'ok'
  }, [mexico])

  // First screen: the race result once it exists, else the grid once qualifying exists.
  useEffect(() => {
    void Promise.all([loadReal(), loadRace()]).then(([hasQualifying, hasRace]) => {
      if (userNavigated.current) return
      if (hasRace) setMode('result')
      else if (hasQualifying) setMode('grid')
    })
  }, [loadReal, loadRace])

  const outcome = useMemo(() => {
    if (!raceRows) return null
    return raceOutcome(mexico, model, raceRows, qualiRows && toGrid(qualiRows, mexico.drivers).grid)
  }, [mexico, model, raceRows, qualiRows])

  const before = useMemo(
    () => [...mexico.drivers].sort((a, b) => b.preProb - a.preProb).map((d) => ({ driver: d, prob: d.preProb })),
    [mexico],
  )
  const selected = before.find((r) => r.driver.id === selectedId) ?? before[0]

  return (
    <main className="page">
      <Masthead meta={mexico.meta} pole={qualiRows?.find((r) => r.position === 1)?.code} winner={outcome?.winner.code} />
      <ModeSwitch
        mode={mode}
        showResult={outcome !== null}
        onChange={(m) => {
          userNavigated.current = true
          setMode(m)
        }}
      />

      {mode === 'result' && outcome && <RaceResult outcome={outcome} raceName={mexico.meta.raceName} />}

      {mode === 'before' && (
        <>
          <p className="lede">
            Before anyone sets a lap: chances from recent form, car pace, ratings and track history. Pick a driver to see
            what the model weighs.
          </p>
          <div className="split">
            <TimingTower rows={before} selectedId={selected.driver.id} onSelect={setSelectedId} label="Win chances before qualifying" showForm />
            <DriverPanel driver={selected.driver} prob={selected.prob} />
          </div>
        </>
      )}

      {mode === 'grid' && (
        <GridEditor data={mexico} model={model} state={grid} dispatch={dispatch} real={real} onLoadReal={() => void loadReal()} />
      )}

      {mode === 'stats' && <SeasonStats />}

      {mode === 'model' && (
        <ModelReliability
          card={data.card}
          mexico={mexico}
          mexico2026={outcome ? { favourite: outcome.before.favourite, favProb: outcome.before.favProb, winner: outcome.winner.name, winnerRank: outcome.before.winnerRank } : undefined}
        />
      )}

      <Footer dataThrough={mexico.meta.dataThrough} />
    </main>
  )
}

export default function App() {
  const { data, error } = useDashboardData()
  if (error) return <main className="page"><p className="status" role="alert">{error} Reload the page to try again.</p></main>
  if (!data) return <main className="page"><p className="status">Loading the timing screen…</p></main>
  return <Dashboard data={data} />
}
