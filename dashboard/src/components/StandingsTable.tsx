import type { SeasonData } from '../types'

const points = (p: number) => (Number.isInteger(p) ? String(p) : p.toFixed(1))

export function DriverStandings({ season, selectedId, onSelect }: {
  season: SeasonData; selectedId: string | null; onSelect: (id: string) => void
}) {
  return (
    <table className="standings">
      <thead>
        <tr><th scope="col">Pos</th><th scope="col">Driver</th><th scope="col" className="hide-sm">Team</th>
          <th scope="col" className="num">Wins</th><th scope="col" className="num hide-sm">Podiums</th>
          <th scope="col" className="num hide-sm">Poles</th><th scope="col" className="num">Points</th></tr>
      </thead>
      <tbody>
        {season.drivers.map((d, i) => (
          <tr key={d.id} aria-selected={d.id === selectedId}>
            <td className="muted">{i + 1}</td>
            <td>
              <button type="button" className="cell-button" aria-pressed={d.id === selectedId} onClick={() => onSelect(d.id)}>
                <span className="stripe" style={{ background: d.colour }} aria-hidden="true" />
                <span>{d.name}</span>
              </button>
            </td>
            <td className="muted hide-sm">{d.teamName}</td>
            <td className="num">{d.wins}</td>
            <td className="num hide-sm">{d.podiums}</td>
            <td className="num hide-sm">{d.poles}</td>
            <td className="num strong">{points(d.points)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ConstructorStandings({ season }: { season: SeasonData }) {
  return (
    <table className="standings">
      <thead>
        <tr><th scope="col">Pos</th><th scope="col">Team</th><th scope="col" className="num">Wins</th><th scope="col" className="num">Points</th></tr>
      </thead>
      <tbody>
        {season.constructors.map((c, i) => (
          <tr key={c.team}>
            <td className="muted">{i + 1}</td>
            <td><span className="team-cell"><span className="stripe" style={{ background: c.colour }} aria-hidden="true" /><span>{c.name}</span></span></td>
            <td className="num">{c.wins}</td>
            <td className="num strong">{points(c.points)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
