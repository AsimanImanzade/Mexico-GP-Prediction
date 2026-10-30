import type { KeyboardEvent } from 'react'
import { change, finish, finishTone, pct } from '../format'
import type { Driver } from '../types'

export type TowerRow = { driver: Driver; prob: number; delta?: number }

type Props = {
  rows: TowerRow[]
  selectedId: string | null
  onSelect: (driverId: string) => void
  label: string
  /** Show the last five results instead of a change column. */
  showForm?: boolean
}

function moveFocus(e: KeyboardEvent<HTMLLIElement>, step: number) {
  const next = (step > 0 ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null
  next?.focus()
  e.preventDefault()
}

export function TimingTower({ rows, selectedId, onSelect, label, showForm = false }: Props) {
  const top = Math.max(...rows.map((r) => r.prob))
  const hasDelta = rows.some((r) => r.delta !== undefined)

  return (
    <div className="tower-wrap" data-tail={showForm ? 'form' : hasDelta ? 'delta' : 'none'}>
    <div className="tower-head" aria-hidden="true">
      <span>Driver</span>
      <span />
      <span className="right">Win chance</span>
      {showForm && <span className="right form-head">Last 5 results</span>}
      {hasDelta && <span className="right">Change</span>}
    </div>
    <ol className="tower" role="listbox" aria-label={label}>
      {rows.map(({ driver, prob, delta }, i) => {
        const trend = delta === undefined ? null : change(delta)
        return (
          <li
            key={driver.id}
            role="option"
            tabIndex={0}
            aria-selected={driver.id === selectedId}
            className="tower-row"
            onClick={() => onSelect(driver.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onSelect(driver.id)
                e.preventDefault()
              } else if (e.key === 'ArrowDown') moveFocus(e, 1)
              else if (e.key === 'ArrowUp') moveFocus(e, -1)
            }}
          >
            <span className="tower-pos">{i + 1}</span>
            <span className="stripe" style={{ background: driver.colour }} aria-hidden="true" />
            <span className="tower-driver">
              <span className="code">{driver.code}</span>
              <span className="name">{driver.name}</span>
            </span>
            <span className="bar" aria-hidden="true">
              <i className={prob === top ? 'is-best' : undefined} style={{ width: `${(100 * prob) / top}%` }} />
            </span>
            <span className={`tower-pct${prob === top ? ' is-best' : ''}`}>{pct(prob)}</span>
            {showForm && (
              <span className="form" aria-label={`Last five results: ${driver.lastFinishes.map(finish).join(', ')}`}>
                {driver.lastFinishes.map((p, k) => (
                  <span key={k} className={`chip tone-${finishTone(p)}`}>
                    {p ?? '–'}
                  </span>
                ))}
              </span>
            )}
            {hasDelta && <span className={`delta trend-${trend?.trend ?? 'flat'}`}>{trend?.text ?? '–'}</span>}
          </li>
        )
      })}
    </ol>
    </div>
  )
}
