import { finish, finishTone, pct } from '../format'
import type { Driver } from '../types'

function mexicoRecord({ starts, wins, podiums, best }: Driver['mexico']) {
  if (!starts) return 'First race here.'
  const parts = [`${starts} ${starts === 1 ? 'start' : 'starts'}`]
  if (wins) parts.push(`${wins} ${wins === 1 ? 'win' : 'wins'}`)
  if (podiums) parts.push(`${podiums} ${podiums === 1 ? 'podium' : 'podiums'}`)
  parts.push(best ? `best finish P${best}` : 'no classified finish')
  return parts.join(', ') + '.'
}

export function DriverPanel({ driver, prob }: { driver: Driver; prob: number }) {
  return (
    <aside className="panel" aria-label={`${driver.name} details`}>
      <div className="panel-head">
        <span className="stripe" style={{ background: driver.colour, height: 'auto' }} aria-hidden="true" />
        <div>
          <h2>{driver.name}</h2>
          <p className="team">{driver.teamName}</p>
        </div>
      </div>

      <dl className="facts">
        <div><dt>Win chance</dt><dd>{pct(prob)}</dd></div>
        <div><dt>Points</dt><dd>{driver.seasonPoints}</dd></div>
        <div><dt>Wins</dt><dd>{driver.seasonWins}</dd></div>
      </dl>

      <h3>Last five races</h3>
      <p className="results">
        {driver.lastFinishes.map((p, i) => (
          <span key={i} className={`tone-${finishTone(p)}`}>{finish(p)}</span>
        ))}
      </p>

      <h3>In Mexico</h3>
      <p>{mexicoRecord(driver.mexico)}</p>

      <h3>What moves the model most</h3>
      <ul className="factors">
        {driver.why.map((f) => (
          <li key={f.label}>
            <span className={f.effect} aria-hidden="true">{f.effect === 'up' ? '▲' : '▼'}</span>
            <span>
              {f.label}
              <span className="visually-hidden">{f.effect === 'up' ? ', raises the chance' : ', lowers the chance'}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="small">
        Average of two models: XGBoost {pct(driver.preMembers.xgboost)}, logistic regression{' '}
        {pct(driver.preMembers.logreg)}.
      </p>
    </aside>
  )
}
