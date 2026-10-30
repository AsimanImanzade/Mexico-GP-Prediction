import { describe, expect, it } from 'vitest'
import mexico from '../../public/data/mexico_2026.json'
import type { MexicoData } from '../types'
import { gridReducer, initialGrid, type GridState } from './gridReducer'

const data = mexico as MexicoData
const start = initialGrid(data)
const positions = (s: GridState) => s.entries.map((e) => e.qualiPosition)
const ids = (s: GridState) => s.entries.map((e) => e.driverId)
const entryOf = (s: GridState, id: string) => s.entries.find((e) => e.driverId === id)!
const BAD_GAP = 'Enter the gap to pole in seconds, for example 0.214.'

describe('initialGrid', () => {
  it('starts in model order with typical gaps and no penalties', () => {
    expect(ids(start)[0]).toBe('antonelli')
    expect(positions(start)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
    expect(start.entries[1].gapPct).toBe(data.typicalGaps[1])
    expect(start.source).toBe('model')
    expect(start.poleMs).toBe(75586)
  })
})

describe('moving drivers', () => {
  it('keeps positions a permutation when dragging', () => {
    const s = gridReducer(start, { type: 'move', from: 5, to: 0 })
    expect(positions(s)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
    expect(ids(s)[0]).toBe(ids(start)[5])
    expect(s.source).toBe('manual')
  })

  it('shifts the others when a position is typed into a taken slot', () => {
    const s = gridReducer(start, { type: 'setPosition', driverId: 'max_verstappen', position: 1 })
    expect(ids(s).slice(0, 2)).toEqual(['max_verstappen', 'antonelli'])
    expect(new Set(positions(s)).size).toBe(22)
  })

  it('clamps positions outside the grid', () => {
    const s = gridReducer(start, { type: 'setPosition', driverId: 'antonelli', position: 40 })
    expect(entryOf(s, 'antonelli').qualiPosition).toBe(22)
  })

  it('gives a moved driver the typical gap of their new slot', () => {
    const s = gridReducer(start, { type: 'setPosition', driverId: 'antonelli', position: 3 })
    expect(entryOf(s, 'antonelli').gapPct).toBe(data.typicalGaps[2])
  })
})

describe('gaps', () => {
  it('converts typed seconds with the reference pole lap', () => {
    const s = gridReducer(start, { type: 'setGapSeconds', driverId: 'leclerc', text: '0.214' })
    expect(entryOf(s, 'leclerc').gapPct).toBeCloseTo(0.28312, 5)
  })

  it('keeps a typed gap when the driver moves', () => {
    let s = gridReducer(start, { type: 'setGapSeconds', driverId: 'leclerc', text: '0.214' })
    s = gridReducer(s, { type: 'setPosition', driverId: 'leclerc', position: 9 })
    expect(entryOf(s, 'leclerc').gapPct).toBeCloseTo(0.28312, 5)
  })

  it('goes back to the typical gap when the box is cleared', () => {
    let s = gridReducer(start, { type: 'setGapSeconds', driverId: 'leclerc', text: '0.214' })
    s = gridReducer(s, { type: 'setGapSeconds', driverId: 'leclerc', text: '  ' })
    expect(entryOf(s, 'leclerc').gapPct).toBe(data.typicalGaps[entryOf(s, 'leclerc').qualiPosition - 1])
  })

  it.each(['-0.2', 'abc', '1,2'])('rejects %s and explains', (text) => {
    const s = gridReducer(start, { type: 'setGapSeconds', driverId: 'leclerc', text })
    expect(s.entries).toEqual(start.entries)
    expect(s.notice).toBe(BAD_GAP)
  })

  it('uses the real pole lap after loading qualifying', () => {
    let s = gridReducer(start, { type: 'loadReal', grid: start.entries, unknown: [], poleMs: 76000 })
    s = gridReducer(s, { type: 'setGapSeconds', driverId: 'leclerc', text: '0.214' })
    expect(entryOf(s, 'leclerc').gapPct).toBeCloseTo(0.28158, 5)
  })
})

describe('penalties', () => {
  it('accepts 3, 5 or 10 places', () => {
    const s = gridReducer(start, { type: 'setPenalty', driverId: 'antonelli', places: 5 })
    expect(entryOf(s, 'antonelli').penalty).toBe(5)
  })

  it('ignores anything else', () => {
    const s = gridReducer(start, { type: 'setPenalty', driverId: 'antonelli', places: 4 })
    expect(entryOf(s, 'antonelli').penalty).toBe(0)
  })
})

describe('real qualifying', () => {
  it('names drivers the model cannot score', () => {
    const s = gridReducer(start, { type: 'loadReal', grid: start.entries.slice(1), unknown: ['newdriver'], poleMs: 76000 })
    expect(s.source).toBe('real')
    expect(s.notice).toBe("Newdriver isn't in this model's entry list, so their chances can't be calculated. Rebuild the data to include them.")
  })

  it('keeps a missing lap time missing when the order changes', () => {
    const grid = start.entries.map((e, i) => (i === 21 ? { ...e, gapPct: null } : e))
    let s = gridReducer(start, { type: 'loadReal', grid, unknown: [], poleMs: 76000 })
    s = gridReducer(s, { type: 'setPosition', driverId: grid[21].driverId, position: 10 })
    expect(entryOf(s, grid[21].driverId).gapPct).toBeNull()
  })

  it('resets to the model order', () => {
    let s = gridReducer(start, { type: 'loadReal', grid: start.entries, unknown: [], poleMs: 76000 })
    s = gridReducer(s, { type: 'reset' })
    expect(s).toEqual(start)
  })
})

describe('real qualifying with a driver the model cannot score', () => {
  const withHole = start.entries.slice(0, 21).map((e, i) => ({ ...e, qualiPosition: i === 0 ? 1 : i + 2 }))
  const loaded = gridReducer(start, { type: 'loadReal', grid: withHole, unknown: ['newdriver'], poleMs: 76000 })

  it('moves a driver up past the next driver, keeping the official slots', () => {
    const p10 = loaded.entries.find((e) => e.qualiPosition === 10)!.driverId
    const s = gridReducer(loaded, { type: 'setPosition', driverId: p10, position: 9 })
    expect(entryOf(s, p10).qualiPosition).toBe(9)
    expect(positions(s)).toEqual(positions(loaded))
  })

  it('keeps the unscored-driver notice after an edit', () => {
    const s = gridReducer(loaded, { type: 'setPenalty', driverId: 'antonelli', places: 3 })
    expect(s.notice).toMatch(/Newdriver isn't in this model's entry list/)
  })
})
