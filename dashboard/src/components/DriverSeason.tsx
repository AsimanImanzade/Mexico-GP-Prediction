import type { SeasonData, SeasonDriver } from '../types'

// Start-to-finish per round: a column per race with the grid slot (hollow)
// and the finish (filled) on a shared position scale, joined by a line that
// is green when places were gained and yellow when they were lost.

const FIELD = 22

export function DriverSeason({ driver, season }: { driver: SeasonDriver; season: SeasonData }) {
  const names = Object.fromEntries(season.races.map((r) => [r.round, r.name.replace(' Grand Prix', '')]))
  const y = (pos: number) => `${(100 * (pos - 1)) / (FIELD - 1)}%`

  return (
    <section className="panel" aria-label={`Race by race: ${driver.name}`}>
      <div className="panel-head">
        <span className="stripe" style={{ background: driver.colour, height: 'auto' }} aria-hidden="true" />
        <div>
          <h2>{driver.name}</h2>
          <p className="team">{driver.teamName}, {season.season}</p>
        </div>
      </div>
      <p className="legend">
        <span><i className="dot hollow" aria-hidden="true" /> Start</span>
        <span><i className="dot" aria-hidden="true" /> Finish</span>
        <span className="trend-up">Gained places</span>
        <span className="trend-down">Lost places</span>
      </p>
      <ol className="dumbbells">
        {driver.results.map((r) => {
          const finish = r.pos ?? FIELD
          const start = r.grid ?? FIELD
          const trend = r.pos === null ? 'out' : finish < start ? 'up' : finish > start ? 'down' : 'flat'
          const text = `Round ${r.round}, ${names[r.round] ?? ''}: started ${r.grid ? `P${r.grid}` : 'from the pit lane'}, ${r.pos ? `finished P${r.pos}` : `did not finish (${r.status})`}`
          return (
            <li key={r.round} tabIndex={0} aria-label={text} className={`db trend-${trend}`}>
              <span className="db-track" aria-hidden="true">
                <span className="db-line" style={{ top: y(Math.min(start, finish)), bottom: `calc(100% - ${y(Math.max(start, finish))})` }} />
                <span className="dot hollow" style={{ top: y(start) }} />
                {r.pos !== null ? <span className="dot" style={{ top: y(finish) }} /> : <span className="dnf" style={{ top: y(FIELD) }}>×</span>}
              </span>
              <span className="db-round" aria-hidden="true">{r.round}</span>
              <span className="tip" aria-hidden="true">{text}</span>
            </li>
          )
        })}
      </ol>
      <p className="small">P1 at the top. Hover or focus a column for details.</p>
    </section>
  )
}
