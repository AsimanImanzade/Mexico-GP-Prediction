import type { SeasonData } from '../types'

/** One cell per round: the winner's team colour as a bar, their code as text. */
export function WinnersStrip({ season, onPick }: { season: SeasonData; onPick: (driverId: string) => void }) {
  const byId = Object.fromEntries(season.drivers.map((d) => [d.id, d]))
  return (
    <ol className="winners" aria-label={`${season.season} race winners`}>
      {season.races.map((r) => {
        const w = r.winner ? byId[r.winner] : undefined
        const label = `Round ${r.round}, ${r.name}: ${w ? `won by ${w.name}${r.pole === r.winner ? ' from pole' : ''}` : 'no winner recorded'}`
        return (
          <li key={r.round}>
            <button type="button" className="winner-cell" aria-label={label} onClick={() => w && onPick(w.id)}>
              <span className="winner-bar" style={{ background: w?.colour ?? 'var(--rule)' }} aria-hidden="true" />
              <span className="winner-code" aria-hidden="true">{w?.code ?? '–'}</span>
              <span className="tip" aria-hidden="true">{label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
