// Shapes of the JSON written by src/export_dashboard.py.

export type XgbTree = { f: number[]; t: number[]; y: number[]; n: number[]; m: number[]; v: number[] }
export type XgbModel = { features: string[]; baseScore: number; trees: XgbTree[] }

export type Factor = { label: string; effect: 'up' | 'down' }

export type Driver = {
  id: string
  code: string
  name: string
  team: string
  teamName: string
  colour: string
  preProb: number
  preMembers: { xgboost: number; logreg: number }
  seasonPoints: number
  seasonWins: number
  lastFinishes: (number | null)[]
  mexico: { starts: number; wins: number; podiums: number; best: number | null }
  why: Factor[]
  features: Record<string, number | null>
}

export type MexicoData = {
  meta: {
    raceName: string
    circuit: string
    season: number
    round: number
    raceUtc: string
    qualiUtc: string
    dataThrough: string
    refPoleMs: number
    qualifyingUrl: string
    resultsUrl: string
  }
  typicalGaps: number[]
  drivers: Driver[]
}

/** One driver's qualifying result as the grid editor holds it. */
export type GridEntry = { driverId: string; qualiPosition: number; gapPct: number | null; penalty: number }

export type SeasonDriver = {
  id: string
  code: string
  name: string
  team: string
  teamName: string
  colour: string
  points: number
  wins: number
  podiums: number
  poles: number
  results: { round: number; pos: number | null; grid: number | null; status: string }[]
}

export type SeasonData = {
  season: number
  races: { round: number; name: string; date: string; circuitId: string; winner: string | null; pole: string | null }[]
  drivers: SeasonDriver[]
  constructors: { team: string; name: string; colour: string; points: number; wins: number }[]
}

export type BacktestRow = {
  round: number
  race: string
  favourite: string
  favProb: number
  winner: string
  winnerProb: number
  winnerRank: number
}

export type ModelCard = {
  chosen: Record<'pre_weekend' | 'post_quali', { members: string[]; weighting: Record<string, number | null> }>
  test: Record<string, { races: number; log_loss: number; top1_acc: number; top3_acc: number }>
  backtest2026: { pre: BacktestRow[]; post: BacktestRow[] }
  mexicoBacktest: (BacktestRow & { season: number })[]
  rules: Record<'championshipLeader' | 'poleSitter', Record<string, { top1: number; top3: number }>>
  importance: Record<'pre_weekend' | 'post_quali', { feature: string; label: string; value: number }[]>
  gridValue: { slot: number; driver_code: string; win_prob: number }[]
}
