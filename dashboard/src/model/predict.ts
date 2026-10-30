import type { GridEntry, MexicoData, XgbModel } from '../types'
import { weekendFeatures } from './grid'
import { predictProba } from './xgb'

/** Post-qualifying P(win) per driver for a grid, normalised to sum to 1 like RaceWinModel. */
export function predictGrid(data: MexicoData, model: XgbModel, grid: GridEntry[]): Record<string, number> {
  const weekend = weekendFeatures(grid, data.drivers)
  const raw = data.drivers
    .filter((d) => weekend[d.id])
    .map((d) => {
      const values: Record<string, number | null> = { ...d.features, ...weekend[d.id] }
      return [d.id, predictProba(model, model.features.map((f) => values[f] ?? null))] as const
    })
  const total = raw.reduce((sum, [, p]) => sum + p, 0)
  return Object.fromEntries(raw.map(([id, p]) => [id, p / total]))
}
