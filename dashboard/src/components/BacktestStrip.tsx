import { ordinal, pct } from '../format'
import type { BacktestRow } from '../types'

/** Race-by-race: bar height = chance given to the eventual winner; purple = favourite won. */
export function BacktestStrip({ rows, when }: { rows: BacktestRow[]; when: string }) {
  const hits = rows.filter((r) => r.winnerRank === 1).length
  return (
    <figure className="strip">
      <figcaption>
        <strong>The favourite won {hits} of {rows.length} races {when}.</strong>{' '}
        <span className="muted">Bars show the chance the model gave the eventual winner.</span>
      </figcaption>
      <ol className="strip-cells">
        {rows.map((r) => {
          const text = `Round ${r.round}, ${r.race}: favourite ${r.favourite} (${pct(r.favProb)}), won by ${r.winner} (${pct(r.winnerProb)}, ranked ${ordinal(r.winnerRank)})`
          return (
            <li key={r.round} tabIndex={0} aria-label={text} className={r.winnerRank === 1 ? 'hit' : 'miss'}>
              <span className="strip-track" aria-hidden="true">
                <span className="strip-fill" style={{ height: `${100 * r.winnerProb}%` }} />
              </span>
              <span className="strip-code" aria-hidden="true">{r.winner}</span>
              <span className="tip" aria-hidden="true">{text}</span>
            </li>
          )
        })}
      </ol>
    </figure>
  )
}
