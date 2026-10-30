import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLayoutEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import { change, pct } from '../format'
import { applyPenalties, pctToSeconds, typicalGap } from '../model/grid'
import { predictGrid } from '../model/predict'
import { PENALTIES, type GridAction, type GridState } from '../state/gridReducer'
import type { Driver, GridEntry, MexicoData, XgbModel } from '../types'

export type RealStatus = { status: 'idle' | 'checking' | 'not-yet' | 'ok' | 'error'; message?: string }

type Props = {
  data: MexicoData
  model: XgbModel
  state: GridState
  dispatch: Dispatch<GridAction>
  real: RealStatus
  onLoadReal: () => void
}

const local = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })

export function realMessage(real: RealStatus, qualiUtc: string, now = Date.now()) {
  switch (real.status) {
    case 'checking': return 'Checking for official qualifying…'
    case 'not-yet':
      return now >= Date.parse(qualiUtc)
        ? 'Qualifying has started. Official results usually appear within a few hours of the session, so try again later.'
        : `Official qualifying isn't published yet. It starts ${local(qualiUtc)}, and results usually appear within a few hours.`
    case 'ok': return 'Official qualifying loaded.'
    case 'error': return real.message ?? ''
    default: return ''
  }
}

const SOURCE = {
  model: 'What if? This grid is only the model’s order with typical gaps to pole, so these chances are not a forecast. The forecast is under “Before qualifying”. Drag drivers or pick one to try your own grid.',
  manual: 'Your what-if grid. Every change is scored again by the post-qualifying model.',
  real: "Official qualifying with real gaps to pole: this is the model's prediction for the race. Add any grid penalties by hand.",
}

const gapText = (e: GridEntry, poleMs: number) => (e.gapPct === null ? 'no time' : `+${pctToSeconds(e.gapPct, poleMs).toFixed(3)}`)

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** dnd-kit's slide while dragging, dropped when the visitor asks for less motion. */
export const sortableTransition = (transition: string | undefined, reduce: boolean) => (reduce ? undefined : transition)

/** Slide rows to their new place after a non-drag reorder (skipped under reduced motion). */
function useFlip(order: string[], skip: React.MutableRefObject<boolean>) {
  const nodes = useRef(new Map<string, HTMLElement>())
  const tops = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const reduce = prefersReducedMotion()
    nodes.current.forEach((node, id) => {
      const top = node.getBoundingClientRect().top
      const prev = tops.current.get(id)
      if (!skip.current && !reduce && prev !== undefined && prev !== top) {
        node.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'none' }], {
          duration: 380,
          easing: 'cubic-bezier(.2,.7,.2,1)',
        })
      }
      tops.current.set(id, top)
    })
    skip.current = false
  }, [order, skip])
  return (id: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
  }
}

type RowProps = {
  entry: GridEntry
  driver: Driver
  prob: number
  top: number
  slot: number
  poleMs: number
  selected: boolean
  onSelect: () => void
  flipRef: (node: HTMLElement | null) => void
}

function GridRow({ entry, driver, prob, top, slot, poleMs, selected, onSelect, flipRef }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: driver.id })
  const trend = change(prob - driver.preProb)
  return (
    <li
      ref={(node) => {
        setNodeRef(node)
        flipRef(node)
      }}
      className={`tower-row grid-row${selected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition: sortableTransition(transition, prefersReducedMotion()) }}
    >
      <button type="button" className="handle" aria-label={`Drag ${driver.code}`} {...attributes} {...listeners}>
        <span aria-hidden="true">⋮⋮</span>
      </button>
      <button
        type="button"
        className="row-select"
        aria-pressed={selected}
        aria-label={`${driver.name}, qualified P${entry.qualiPosition}, win chance ${pct(prob)}, ${trend.text === '–' ? 'no change' : trend.text}`}
        onClick={onSelect}
      >
        <span className="tower-pos" data-testid="pos">{entry.qualiPosition}</span>
        <span className="stripe" style={{ background: driver.colour }} aria-hidden="true" />
        <span className="tower-driver">
          <span className="code">{driver.code}</span>
          <span className="name">
            {driver.name}
            {slot !== entry.qualiPosition && <em className="starts"> starts P{slot}</em>}
          </span>
        </span>
        <span className="gap">{gapText(entry, poleMs)}</span>
        <span className="bar" aria-hidden="true">
          <i className={prob === top ? 'is-best' : undefined} style={{ width: `${(100 * prob) / top}%` }} />
        </span>
        <span className={`tower-pct${prob === top ? ' is-best' : ''}`} data-testid="win">{pct(prob)}</span>
        <span className={`delta trend-${trend.trend}`} data-testid="delta">{trend.text}</span>
      </button>
    </li>
  )
}

function CommitInput({ id, label, value, placeholder, hint, onCommit, inputMode }: {
  id: string; label: string; value: string; placeholder?: string; hint?: string
  onCommit: (text: string) => void; inputMode: 'decimal' | 'numeric'
}) {
  const [text, setText] = useState(value)
  useLayoutEffect(() => setText(value), [value])
  const commit = () => {
    if (text === value) return
    onCommit(text)
    setText(value) // a rejected entry falls back to the kept value; an accepted one arrives as a new `value`
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode={inputMode}
        value={text}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  )
}

export function GridEditor({ data, model, state, dispatch, real, onLoadReal }: Props) {
  const drivers = useMemo(() => Object.fromEntries(data.drivers.map((d) => [d.id, d])), [data])
  const probs = useMemo(() => predictGrid(data, model, state.entries), [data, model, state.entries])
  const slots = useMemo(() => applyPenalties(state.entries), [state.entries])
  const [selectedId, setSelectedId] = useState(state.entries[0].driverId)
  const panelRef = useRef<HTMLElement>(null)
  const select = (id: string) => {
    setSelectedId(id)
    // On narrow screens the panel sits below the list; bring it into view.
    if (window.matchMedia?.('(max-width: 900px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      panelRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    }
  }
  const draggedLast = useRef(false)
  const order = useMemo(() => state.entries.map((e) => e.driverId), [state.entries])
  const flipRef = useFlip(order, draggedLast)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    draggedLast.current = true
    dispatch({ type: 'move', from: order.indexOf(String(active.id)), to: order.indexOf(String(over.id)) })
  }

  const top = Math.max(...Object.values(probs))
  const entry = state.entries.find((e) => e.driverId === selectedId) ?? state.entries[0]
  const driver = drivers[entry.driverId]
  const trend = change(probs[entry.driverId] - driver.preProb)
  const typicalSeconds = pctToSeconds(typicalGap(entry.qualiPosition, state.typical), state.poleMs).toFixed(3)

  return (
    <>
      <div className="toolbar">
        <button type="button" className="action" onClick={onLoadReal} disabled={real.status === 'checking'}>
          Load real qualifying
        </button>
        <button type="button" className="action quiet" onClick={() => dispatch({ type: 'reset' })}>
          Reset to model order
        </button>
        <p className="load-status" aria-live="polite">{realMessage(real, data.meta.qualiUtc)}</p>
      </div>
      <p className="lede">{SOURCE[state.source]}</p>

      <div className="split">
        <div className="tower-wrap grid-tower">
          <div className="tower-head" aria-hidden="true">
            <span>Qualifying</span><span>Gap (s)</span><span /><span className="right">Win chance</span><span className="right">Change</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ul className="tower" aria-label="Qualifying order and win chances">
                {state.entries.map((e) => (
                  <GridRow
                    key={e.driverId}
                    entry={e}
                    driver={drivers[e.driverId]}
                    prob={probs[e.driverId]}
                    top={top}
                    slot={slots[e.driverId]}
                    poleMs={state.poleMs}
                    selected={e.driverId === entry.driverId}
                    onSelect={() => select(e.driverId)}
                    flipRef={flipRef(e.driverId)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>

        <aside className="panel" ref={panelRef} aria-label={`Edit ${driver.name}`}>
          <div className="panel-head">
            <span className="stripe" style={{ background: driver.colour, height: 'auto' }} aria-hidden="true" />
            <div>
              <h2>{driver.name}</h2>
              <p className="team">
                {driver.teamName}, qualified P{entry.qualiPosition}
                {slots[entry.driverId] !== entry.qualiPosition && `, starts P${slots[entry.driverId]}`}
              </p>
            </div>
          </div>

          <dl className="facts two">
            <div><dt>Before qualifying</dt><dd>{pct(driver.preProb)}</dd></div>
            <div>
              <dt>With this grid</dt>
              <dd>{pct(probs[entry.driverId])} <span className={`delta trend-${trend.trend}`}>{trend.text}</span></dd>
            </div>
          </dl>

          <div className="controls">
            <div className="field">
              <span className="label">Move</span>
              <div className="pair">
                <button type="button" className="action quiet" disabled={entry.qualiPosition === 1}
                  onClick={() => dispatch({ type: 'setPosition', driverId: entry.driverId, position: entry.qualiPosition - 1 })}>
                  Move up
                </button>
                <button type="button" className="action quiet" disabled={entry.qualiPosition === state.entries.length}
                  onClick={() => dispatch({ type: 'setPosition', driverId: entry.driverId, position: entry.qualiPosition + 1 })}>
                  Move down
                </button>
              </div>
            </div>
            <CommitInput
              id="pos-input"
              label="Qualifying position"
              inputMode="numeric"
              value={String(entry.qualiPosition)}
              onCommit={(t) => Number.isFinite(Number(t)) && t.trim() !== '' &&
                dispatch({ type: 'setPosition', driverId: entry.driverId, position: Number(t) })}
            />
            <CommitInput
              id="gap-input"
              label="Gap to pole (seconds)"
              inputMode="decimal"
              value={state.ownGap[entry.driverId] && entry.gapPct !== null ? pctToSeconds(entry.gapPct, state.poleMs).toFixed(3) : ''}
              placeholder={entry.gapPct === null ? 'no time' : typicalSeconds}
              hint={entry.gapPct === null
                ? 'No lap time in qualifying, so the model treats the gap as missing. Type a gap to set one.'
                : `Leave empty for the typical gap at P${entry.qualiPosition} (${typicalSeconds} s).`}
              onCommit={(t) => dispatch({ type: 'setGapSeconds', driverId: entry.driverId, text: t })}
            />
            <div className="field">
              <label htmlFor="penalty">Grid penalty</label>
              <select id="penalty" value={entry.penalty}
                onChange={(e) => dispatch({ type: 'setPenalty', driverId: entry.driverId, places: Number(e.target.value) })}>
                {PENALTIES.map((p) => <option key={p} value={p}>{p === 0 ? 'None' : `${p} places`}</option>)}
              </select>
            </div>
          </div>
          <div role="status" className="notice">{state.notice}</div>
        </aside>
      </div>
    </>
  )
}
