import { secondsToPct, typicalGap } from '../model/grid'
import type { GridEntry, MexicoData } from '../types'

// The "Set the grid" state. Entries are kept in qualifying order. A driver's
// gap is either "own" (typed by the user or from real qualifying, kept when
// they move) or the typical gap for their current slot.

export type GridState = {
  entries: GridEntry[]
  source: 'model' | 'manual' | 'real'
  poleMs: number
  notice: string | null
  /** Standing notice about drivers in real qualifying the model can't score. */
  unscored: string | null
  ownGap: Record<string, true>
  typical: number[]
  modelOrder: string[]
  refPoleMs: number
}

export type GridAction =
  | { type: 'move'; from: number; to: number }
  | { type: 'setPosition'; driverId: string; position: number }
  | { type: 'setGapSeconds'; driverId: string; text: string }
  | { type: 'setPenalty'; driverId: string; places: number }
  | { type: 'reset' }
  | { type: 'loadReal'; grid: GridEntry[]; unknown: string[]; poleMs: number }

export const PENALTIES = [0, 3, 5, 10]
const BAD_GAP = 'Enter the gap to pole in seconds, for example 0.214.'

const displayName = (id: string) =>
  id.split('_').map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')

/** Occupied qualifying positions (1..n, or with a hole for a driver the model can't score). */
const slotsOf = (state: GridState) => state.entries.map((e) => e.qualiPosition).sort((a, b) => a - b)

/** Put entries on the occupied positions in the given order and refresh typical gaps. */
function renumber(state: GridState, entries: GridEntry[]): GridEntry[] {
  const slots = slotsOf(state)
  return entries.map((e, i) => ({
    ...e,
    qualiPosition: slots[i],
    gapPct: state.ownGap[e.driverId] ? e.gapPct : typicalGap(slots[i], state.typical),
  }))
}

export function initialGrid(data: MexicoData): GridState {
  const modelOrder = [...data.drivers].sort((a, b) => b.preProb - a.preProb).map((d) => d.id)
  return {
    entries: modelOrder.map((driverId, i) => ({
      driverId,
      qualiPosition: i + 1,
      gapPct: typicalGap(i + 1, data.typicalGaps),
      penalty: 0,
    })),
    source: 'model',
    poleMs: data.meta.refPoleMs,
    notice: null,
    unscored: null,
    ownGap: {},
    typical: data.typicalGaps,
    modelOrder,
    refPoleMs: data.meta.refPoleMs,
  }
}

export function gridReducer(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case 'move': {
      const entries = [...state.entries]
      const [moved] = entries.splice(action.from, 1)
      entries.splice(action.to, 0, moved)
      return { ...state, entries: renumber(state, entries), source: 'manual', notice: state.unscored }
    }
    case 'setPosition': {
      const from = state.entries.findIndex((e) => e.driverId === action.driverId)
      const slots = slotsOf(state)
      const wanted = Math.round(action.position)
      const index = slots.findIndex((p) => p >= wanted)
      const to = index === -1 ? slots.length - 1 : index
      return gridReducer(state, { type: 'move', from, to })
    }
    case 'setGapSeconds': {
      const text = action.text.trim()
      const index = state.entries.findIndex((e) => e.driverId === action.driverId)
      if (text === '') {
        const ownGap = { ...state.ownGap }
        delete ownGap[action.driverId]
        const next = { ...state, ownGap }
        return { ...next, entries: renumber(next, state.entries), notice: state.unscored }
      }
      if (!/^\d*\.?\d+$/.test(text)) return { ...state, notice: BAD_GAP }
      const entries = [...state.entries]
      entries[index] = { ...entries[index], gapPct: secondsToPct(Number(text), state.poleMs) }
      return {
        ...state,
        entries,
        ownGap: { ...state.ownGap, [action.driverId]: true },
        source: state.source === 'model' ? 'manual' : state.source,
        notice: state.unscored,
      }
    }
    case 'setPenalty': {
      if (!PENALTIES.includes(action.places)) return state
      return {
        ...state,
        entries: state.entries.map((e) => (e.driverId === action.driverId ? { ...e, penalty: action.places } : e)),
        source: state.source === 'model' ? 'manual' : state.source,
        notice: state.unscored,
      }
    }
    case 'reset':
      return { ...initialGridFrom(state) }
    case 'loadReal': {
      const entries = [...action.grid].sort((a, b) => a.qualiPosition - b.qualiPosition)
      const missing = action.unknown.map(displayName)
      const unscored = missing.length
        ? `${missing.join(', ')} ${missing.length === 1 ? "isn't" : "aren't"} in this model's entry list, so their chances can't be calculated. Rebuild the data to include them.`
        : null
      return {
        ...state,
        entries,
        source: 'real',
        poleMs: action.poleMs,
        ownGap: Object.fromEntries(entries.map((e) => [e.driverId, true as const])),
        notice: unscored,
        unscored,
      }
    }
  }
}

function initialGridFrom(state: GridState): GridState {
  return {
    ...state,
    entries: state.modelOrder.map((driverId, i) => ({
      driverId,
      qualiPosition: i + 1,
      gapPct: typicalGap(i + 1, state.typical),
      penalty: 0,
    })),
    source: 'model',
    poleMs: state.refPoleMs,
    notice: null,
    unscored: null,
    ownGap: {},
  }
}
