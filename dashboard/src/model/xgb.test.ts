import { describe, expect, it } from 'vitest'
import model from '../../public/data/post_quali_model.json'
import parity from '../../tests/fixtures/parity.json'
import type { XgbModel } from '../types'
import { predictProba } from './xgb'

describe('xgb parity', () => {
  it('matches Python predict_proba on every fixture row', () => {
    const rows = parity.rows as { x: (number | null)[]; p: number }[]
    expect(rows).toHaveLength(50)
    for (const { x, p } of rows) {
      expect(Math.abs(predictProba(model as XgbModel, x) - p)).toBeLessThan(1e-6)
    }
  })
})
