import { describe, expect, it } from 'vitest'
import mexico from '../../public/data/mexico_2026.json'
import model from '../../public/data/post_quali_model.json'
import austinQuali from '../../tests/fixtures/jolpica_2026_r18.json'
import results from '../../tests/fixtures/jolpica_results_r18.json'
import { parseQualifying, parseRaceResults, toGrid, type RaceRow } from '../data/jolpica'
import type { MexicoData, XgbModel } from '../types'
import { raceOutcome } from './outcome'
import { predictGrid } from './predict'

const data = mexico as MexicoData
const xgb = model as XgbModel
const rows = parseRaceResults(results)
const grid = toGrid(parseQualifying(austinQuali), data.drivers).grid
const won = (id: string): RaceRow[] =>
  rows.map((r) => ({ ...r, position: r.driverId === id ? 1 : r.position === 1 ? 2 : r.position }))

describe('raceOutcome', () => {
  it('compares the winner with the favourite at both stages', () => {
    const o = raceOutcome(data, xgb, won('max_verstappen'), grid)
    expect(o.winner.driverId).toBe('max_verstappen')
    expect(o.before).toMatchObject({ favourite: 'ANT', winnerRank: 2 })
    expect(o.before.winnerProb).toBeCloseTo(0.2157, 4)
    const probs = predictGrid(data, xgb, grid)
    expect(o.after!.winnerProb).toBe(probs.max_verstappen)
  })

  it('lists the whole field with both chances', () => {
    const o = raceOutcome(data, xgb, rows, grid)
    expect(o.classification).toHaveLength(22)
    expect(o.classification[0]).toMatchObject({ code: 'ANT', position: 1 })
    expect(o.classification[0].before).toBeCloseTo(0.4022, 4)
  })

  it('has no after-qualifying stage without official qualifying', () => {
    expect(raceOutcome(data, xgb, rows, null).after).toBeNull()
  })

  it('copes with a winner the model has no data for', () => {
    const o = raceOutcome(data, xgb, rows.map((r, i) => (i === 0 ? { ...r, driverId: 'newdriver' } : r)), grid)
    expect(o.before.winnerProb).toBeNull()
    expect(o.before.winnerRank).toBeNull()
  })
})
