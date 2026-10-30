import { finish, finishTone, ordinal, pct } from '../format'
import type { Outcome, Stage } from '../model/outcome'

function verdict({ before, after }: Outcome) {
  const pre = before.winnerRank === 1
  const post = after?.winnerRank === 1
  if (pre && post) return 'The model called it: the winner was its favourite before and after qualifying.'
  if (pre) return after ? `The model's favourite before qualifying won, though qualifying had moved its pick to ${after.favourite}.` : "The model's favourite before qualifying won."
  if (post) return "The model's favourite after qualifying won."
  return "The model's favourite did not win."
}

function StageRow({ title, note, stage, winner }: { title: string; note?: string; stage: Stage; winner: string }) {
  return (
    <div className="stage">
      <h3>{title}</h3>
      <p>Favourite: {stage.favourite} at {pct(stage.favProb)}, finished {finish(stage.favFinish)}.</p>
      {stage.winnerRank !== 1 && (
        <p>
          {stage.winnerRank === null
            ? `${winner} wasn't in the model's entry list.`
            : `${winner} ranked ${ordinal(stage.winnerRank)} at ${pct(stage.winnerProb!)}.`}
        </p>
      )}
      {note && <p className="small">{note}</p>}
    </div>
  )
}

export function RaceResult({ outcome, raceName }: { outcome: Outcome; raceName: string }) {
  const { winner, before, after, classification } = outcome
  return (
    <section className="race-result">
      <h2 className="result-title">{winner.name} won the {raceName}</h2>
      <p className="verdict">{verdict(outcome)}</p>

      <div className="stages">
        <StageRow title="Before qualifying" stage={before} winner={winner.code} />
        {after && (
          <StageRow title="After qualifying" stage={after} winner={winner.code} note="From the official qualifying order, before any grid penalties." />
        )}
      </div>

      <table className="standings" aria-label="Race result with the model's chances">
        <thead>
          <tr>
            <th scope="col">Finish</th><th scope="col">Driver</th><th scope="col" className="num hide-sm">Started</th>
            <th scope="col" className="num">Before qualifying</th><th scope="col" className="num">After qualifying</th>
          </tr>
        </thead>
        <tbody>
          {classification.map((r) => (
            <tr key={r.driverId}>
              <td className={`tone-${finishTone(r.position)}`}>{finish(r.position)}</td>
              <td>
                <span className="team-cell">
                  <span className="stripe" style={{ background: r.colour }} aria-hidden="true" />
                  <span>{r.name}</span>
                </span>
              </td>
              <td className="num hide-sm">{r.grid ? `P${r.grid}` : 'Pit lane'}</td>
              <td className="num">{r.before === null ? '–' : pct(r.before)}</td>
              <td className="num">{r.after === null ? '–' : pct(r.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
