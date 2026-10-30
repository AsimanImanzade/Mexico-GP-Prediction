import { useEffect, useState } from 'react'
import type { MexicoData } from '../types'

export type Mode = 'result' | 'before' | 'grid' | 'stats' | 'model'

const MODES: { id: Mode; label: string }[] = [
  { id: 'before', label: 'Before qualifying' },
  { id: 'grid', label: 'Set the grid' },
  { id: 'stats', label: 'Season stats' },
  { id: 'model', label: 'How reliable is it' },
]

export function ModeSwitch({ mode, onChange, showResult }: { mode: Mode; onChange: (m: Mode) => void; showResult: boolean }) {
  const modes = showResult ? [{ id: 'result' as const, label: 'Race result' }, ...MODES] : MODES
  return (
    <nav className="modes" aria-label="Views">
      {modes.map((m) => (
        <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => onChange(m.id)}>
          {m.label}
        </button>
      ))}
    </nav>
  )
}

/** A session's clock: countdown, then "Result pending", then the result itself. */
export function clockText(iso: string, now: number, result?: string) {
  if (result) return result
  const ms = Date.parse(iso) - now
  if (ms <= 0) return 'Result pending'
  const h = Math.floor(ms / 3_600_000)
  return h >= 24 ? `in ${Math.floor(h / 24)}d ${h % 24}h` : `in ${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
}

const local = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

export function Masthead({ meta, pole, winner }: { meta: MexicoData['meta']; pole?: string; winner?: string }) {
  const now = useNow()
  return (
    <header className="masthead">
      <div>
        <h1>{meta.raceName} {meta.season}</h1>
        <p>
          {winner ? 'How the prediction compared with the race:' : 'Who wins on Sunday?'} win chances from a model trained on
          every Formula 1 race since 2014, at {meta.circuit}.
        </p>
      </div>
      <dl className="clocks">
        <div className="clock">
          <dt>Qualifying</dt>
          <dd>{clockText(meta.qualiUtc, now, pole && `Pole: ${pole}`)}<small>{local(meta.qualiUtc)}</small></dd>
        </div>
        <div className="clock">
          <dt>Race</dt>
          <dd>{clockText(meta.raceUtc, now, winner && `${winner} won`)}<small>{local(meta.raceUtc)}</small></dd>
        </div>
      </dl>
    </header>
  )
}

export function Footer({ dataThrough }: { dataThrough: string }) {
  return (
    <footer className="footer">
      <span>Model data through the {dataThrough}. Results from the Jolpica F1 API.</span>
      <span>Model and dashboard by Asiman Imanzade.</span>
      <span>Independent project, not affiliated with Formula 1.</span>
    </footer>
  )
}
