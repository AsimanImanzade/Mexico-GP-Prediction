import { describe, expect, it } from 'vitest'
import mexico from '../../public/data/mexico_2026.json'
import type { Driver, GridEntry } from '../types'
import { applyPenalties, pctToSeconds, secondsToPct, typicalGap, weekendFeatures } from './grid'

const entry = (driverId: string, qualiPosition: number, penalty = 0, gapPct: number | null = 0): GridEntry =>
  ({ driverId, qualiPosition, gapPct, penalty })

describe('applyPenalties', () => {
  it('drops a penalised driver and moves the others up', () => {
    const slots = applyPenalties([entry('A', 1, 3), entry('B', 2), entry('C', 3), entry('D', 4)])
    expect(slots).toEqual({ A: 4, B: 1, C: 2, D: 3 })
  })

  it('always gives 22 unique slots', () => {
    const grid = Array.from({ length: 22 }, (_, i) => entry(`d${i}`, i + 1, [0, 3, 5, 10][(i * 7) % 4]))
    const slots = Object.values(applyPenalties(grid)).sort((a, b) => a - b)
    expect(slots).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
  })

  it('keeps a back-of-grid driver at the back when penalised past the end', () => {
    const grid = Array.from({ length: 22 }, (_, i) => entry(`d${i}`, i + 1, i === 20 ? 5 : 0))
    expect(applyPenalties(grid).d20).toBe(22)
  })
})

describe('gaps', () => {
  it('converts seconds to % of the pole lap and back', () => {
    expect(secondsToPct(0.214, 75586)).toBeCloseTo(0.28312, 5)
    expect(pctToSeconds(secondsToPct(0.214, 75586), 75586)).toBeCloseTo(0.214, 9)
  })

  it('reads the typical gap for a position and holds the last value beyond the table', () => {
    expect(typicalGap(1, [0, 0.2, 0.4])).toBe(0)
    expect(typicalGap(5, [0, 0.2, 0.4])).toBe(0.4)
  })

  it('caps the gap the model sees at 7%', () => {
    const drivers = (mexico.drivers as Driver[]).slice(0, 2)
    const f = weekendFeatures([entry(drivers[0].id, 1, 0, 0), entry(drivers[1].id, 2, 0, 9)], drivers)
    expect(f[drivers[1].id].quali_gap_pct).toBe(7)
  })
})

describe('a driver the model cannot score leaves a gap in the order', () => {
  it('keeps everyone else on their official slots', () => {
    expect(applyPenalties([entry('A', 1), entry('C', 3), entry('D', 4)])).toEqual({ A: 1, C: 3, D: 4 })
    expect(applyPenalties([entry('A', 1, 3), entry('C', 3), entry('D', 4)])).toEqual({ A: 4, C: 1, D: 3 })
  })

  it('does not put P3 on the front row', () => {
    const drivers = (mexico.drivers as Driver[]).slice(0, 3)
    const f = weekendFeatures([entry(drivers[0].id, 1), entry(drivers[1].id, 3), entry(drivers[2].id, 4)], drivers)
    expect(f[drivers[1].id]).toMatchObject({ grid_pos: 3, front_row: 0 })
  })
})
