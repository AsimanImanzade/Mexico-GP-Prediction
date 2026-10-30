import type { RaceRow } from '../data/jolpica'
import type { Driver, GridEntry, MexicoData, XgbModel } from '../types'
import { predictGrid } from './predict'

// How the model's two predictions compare with the race. The after-qualifying
// stage uses the official qualifying order, the grid the page itself shows.

export type Stage = {
  favourite: string
  favProb: number
  favFinish: number | null
  winnerProb: number | null
  winnerRank: number | null
}

export type ClassifiedDriver = RaceRow & { colour: string; before: number | null; after: number | null }

export type Outcome = {
  winner: RaceRow
  before: Stage
  after: Stage | null
  classification: ClassifiedDriver[]
}

function stage(probs: Record<string, number>, drivers: Driver[], rows: RaceRow[], winnerId: string): Stage {
  const ranked = drivers.filter((d) => probs[d.id] !== undefined).sort((a, b) => probs[b.id] - probs[a.id])
  const favourite = ranked[0]
  const rank = ranked.findIndex((d) => d.id === winnerId)
  return {
    favourite: favourite.code,
    favProb: probs[favourite.id],
    favFinish: rows.find((r) => r.driverId === favourite.id)?.position ?? null,
    winnerProb: rank === -1 ? null : probs[winnerId],
    winnerRank: rank === -1 ? null : rank + 1,
  }
}

export function raceOutcome(data: MexicoData, model: XgbModel, rows: RaceRow[], official: GridEntry[] | null): Outcome {
  const winner = rows.find((r) => r.position === 1) ?? rows[0]
  const pre = Object.fromEntries(data.drivers.map((d) => [d.id, d.preProb]))
  const post = official ? predictGrid(data, model, official) : null
  const colours = Object.fromEntries(data.drivers.map((d) => [d.id, d.colour]))
  return {
    winner,
    before: stage(pre, data.drivers, rows, winner.driverId),
    after: post ? stage(post, data.drivers, rows, winner.driverId) : null,
    classification: rows.map((r) => ({
      ...r,
      colour: colours[r.driverId] ?? 'var(--muted)',
      before: pre[r.driverId] ?? null,
      after: post?.[r.driverId] ?? null,
    })),
  }
}
