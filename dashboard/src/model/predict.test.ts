import { describe, expect, it } from 'vitest'
import mexico from '../../public/data/mexico_2026.json'
import model from '../../public/data/post_quali_model.json'
import parity from '../../tests/fixtures/parity.json'
import type { GridEntry, MexicoData, XgbModel } from '../types'
import { predictGrid } from './predict'

type Case = { grid: GridEntry[]; probs: Record<string, number> }

describe('predict parity', () => {
  it('matches Python for all 300 fixture grids', () => {
    const cases = parity.cases as Case[]
    expect(cases).toHaveLength(300)
    let worst = 0
    for (const c of cases) {
      const probs = predictGrid(mexico as MexicoData, model as XgbModel, c.grid)
      for (const [id, p] of Object.entries(c.probs)) worst = Math.max(worst, Math.abs(probs[id] - p))
    }
    expect(worst).toBeLessThan(1e-6)
  })

  it('returns probabilities that sum to 1', () => {
    const probs = predictGrid(mexico as MexicoData, model as XgbModel, (parity.cases[0] as Case).grid)
    expect(Object.values(probs).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
  })
})
