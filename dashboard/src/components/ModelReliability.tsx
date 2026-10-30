import { pct } from '../format'
import type { MexicoData, ModelCard } from '../types'
import { BacktestStrip } from './BacktestStrip'
import { GridValueChart } from './GridValueChart'

const whole = (p: number) => `${Math.round(100 * p)}%`

type Mexico2026 = { favourite: string; favProb: number; winner: string; winnerRank: number | null }

export function ModelReliability({ card, mexico, mexico2026 }: { card: ModelCard; mexico: MexicoData; mexico2026?: Mexico2026 }) {
  const seasons = ['2025', '2026']
  const rows = [
    { label: 'Model, before qualifying', get: (s: string) => card.test[`pre_weekend_${s}`] && { top1: card.test[`pre_weekend_${s}`].top1_acc, top3: card.test[`pre_weekend_${s}`].top3_acc } },
    { label: 'Back the championship leader', get: (s: string) => card.rules.championshipLeader[s], rule: true },
    { label: 'Model, after qualifying', get: (s: string) => card.test[`post_quali_${s}`] && { top1: card.test[`post_quali_${s}`].top1_acc, top3: card.test[`post_quali_${s}`].top3_acc } },
    { label: 'Back the pole-sitter', get: (s: string) => card.rules.poleSitter[s], rule: true },
  ]
  const byCode = Object.fromEntries(mexico.drivers.map((d) => [d.code, d.name]))
  const mexicoRows = [...card.mexicoBacktest, ...(mexico2026 ? [{ season: 2026, ...mexico2026 }] : [])]

  return (
    <div className="reliability">
      <p className="lede">
        Every number here comes from walk-forward backtests: before each race the model only knew earlier results. The
        2025 and 2026 seasons were held back until the end; 2021 to 2024 were also used to choose the model.
      </p>

      <h2 className="section-title">2026, race by race</h2>
      <div className="strips">
        <BacktestStrip rows={card.backtest2026.pre} when="before qualifying" />
        <BacktestStrip rows={card.backtest2026.post} when="after qualifying" />
      </div>

      <div className="split even">
        <section>
          <h2 className="section-title">Against simple rules</h2>
          <table className="standings" aria-label="Model against simple rules">
            <thead>
              <tr>
                <th scope="col">Pick</th>
                {seasons.map((s) => <th key={s} scope="col" className="num">{s} favourite won</th>)}
                {seasons.map((s) => <th key={s} scope="col" className="num hide-sm">{s} winner in top 3</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={r.rule ? 'rule-row' : undefined}>
                  <th scope="row">{r.label}</th>
                  {seasons.map((s) => <td key={s} className="num">{r.get(s) ? whole(r.get(s)!.top1) : '–'}</td>)}
                  {seasons.map((s) => <td key={s} className="num hide-sm">{r.get(s) ? whole(r.get(s)!.top3) : '–'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">
            The model adds what the rules can't: a probability for every driver, which matters most when the favourite
            doesn&apos;t win.
          </p>
        </section>

        <section>
          <h2 className="section-title">Mexico, before qualifying</h2>
          {card.mexicoBacktest.length ? (
            <ol className="mexico-list" aria-label="Mexico backtest">
              {mexicoRows.map((r) => (
                <li key={r.season}>
                  <span className="season">{r.season}</span>
                  <span>Favourite {r.favourite} {pct(r.favProb)}</span>
                  <span className={r.winnerRank === 1 ? 'tone-best' : 'muted'}>
                    {r.winnerRank === 1 ? 'won' : `${byCode[r.winner] ?? r.winner} won${r.winnerRank ? `, ranked ${r.winnerRank}` : ''}`}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">The Mexico backtest appears once the notebook has been run.</p>
          )}
        </section>
      </div>

      <h2 className="section-title">What a grid slot is worth in Mexico</h2>
      <p className="lede">
        One driver moved through slots 1 to 10 while everyone else keeps the model&apos;s order, with the typical gap to pole
        for each slot.
      </p>
      {card.gridValue.length ? <GridValueChart points={card.gridValue} /> : <p className="muted">Run the notebook to add this chart.</p>}

      <div className="split even">
        {(['pre_weekend', 'post_quali'] as const).map((mode) => {
          const top = card.importance[mode].slice(0, 5)
          const max = top[0].value
          return (
            <section key={mode}>
              <h2 className="section-title">What matters most {mode === 'pre_weekend' ? 'before qualifying' : 'after qualifying'}</h2>
              <ol className="factor-bars">
                {top.map((f) => (
                  <li key={f.feature}>
                    <span>{f.label}</span>
                    <span className="bar" aria-hidden="true"><i style={{ width: `${(100 * f.value) / max}%` }} /></span>
                  </li>
                ))}
              </ol>
            </section>
          )
        })}
      </div>
    </div>
  )
}
