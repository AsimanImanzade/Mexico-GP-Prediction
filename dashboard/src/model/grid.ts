import type { Driver, GridEntry } from '../types'

// Weekend features for a grid, following src/grid_features.py rule for rule
// (which tests/test_pipeline.py pins to the real feature pipeline).

export const GAP_CAP = 7 // % to pole, same cap as build_features.py

/** Grid slot per driver: a penalised driver drops places, the others move up. */
export function applyPenalties(grid: GridEntry[]): Record<string, number> {
  const order = [...grid].sort(
    (a, b) =>
      a.qualiPosition + a.penalty - (b.qualiPosition + b.penalty) ||
      Number(a.penalty > 0) - Number(b.penalty > 0) ||
      a.qualiPosition - b.qualiPosition,
  )
  // Fill the slots these drivers occupy, so a driver the model can't score keeps theirs.
  const occupied = grid.map((e) => e.qualiPosition).sort((a, b) => a - b)
  return Object.fromEntries(order.map((e, i) => [e.driverId, occupied[i]]))
}

export function typicalGap(position: number, table: number[]): number {
  return table[Math.min(position, table.length) - 1]
}

export const secondsToPct = (seconds: number, poleMs: number) => (100 * seconds * 1000) / poleMs
export const pctToSeconds = (pct: number, poleMs: number) => (pct * poleMs) / 100 / 1000

export type WeekendFeatures = Record<
  'grid_pos' | 'front_row' | 'quali_position' | 'quali_gap_pct' | 'tm_quali_gap' | 'grid_penalty' | 'sprint_pos',
  number | null
>

export function weekendFeatures(grid: GridEntry[], drivers: Driver[]): Record<string, WeekendFeatures> {
  const team = Object.fromEntries(drivers.map((d) => [d.id, d.team]))
  const slots = applyPenalties(grid)
  const known = grid.map((e) => e.gapPct).filter((g): g is number => g !== null)
  const fastest = Math.min(...known)
  // Rebase so the fastest lap is 0, like build_features (gap = lap / fastest lap - 1).
  const gap = Object.fromEntries(
    grid.map((e) => [
      e.driverId,
      e.gapPct === null ? null : Math.min(100 * ((1 + e.gapPct / 100) / (1 + fastest / 100) - 1), GAP_CAP),
    ]),
  )

  const out: Record<string, WeekendFeatures> = {}
  for (const e of grid) {
    const mate = grid.find((o) => o.driverId !== e.driverId && team[o.driverId] === team[e.driverId])
    const own = gap[e.driverId]
    const theirs = mate ? gap[mate.driverId] : null
    const slot = slots[e.driverId]
    out[e.driverId] = {
      grid_pos: slot,
      front_row: slot <= 2 ? 1 : 0,
      quali_position: e.qualiPosition,
      quali_gap_pct: own,
      tm_quali_gap: own !== null && theirs !== null ? own - theirs : null,
      grid_penalty: Math.max(0, slot - e.qualiPosition),
      sprint_pos: null,
    }
  }
  return out
}
