import type { Driver, GridEntry } from '../types'

// Official qualifying from the Jolpica (Ergast) API, which allows browser calls.

export type QualiRow = { driverId: string; code: string; position: number; bestMs: number | null }

export type RaceRow = {
  driverId: string
  code: string
  name: string
  /** Finishing position, or null when not classified (retired, disqualified, ...). */
  position: number | null
  grid: number | null
  status: string
}

export type FetchResult<T = QualiRow> =
  | { status: 'ok'; rows: T[] }
  | { status: 'not-yet' }
  | { status: 'error'; message: string }

type ApiResult = {
  position: string
  Driver: { driverId: string; code: string }
  Q1?: string
  Q2?: string
  Q3?: string
}

/** '1:15.672' -> 75672 */
function lapMs(time: string | undefined): number | null {
  if (!time) return null
  const [m, s] = time.includes(':') ? time.split(':') : ['0', time]
  const ms = (Number(m) * 60 + Number(s)) * 1000
  return Number.isFinite(ms) ? Math.round(ms) : null
}

export function parseQualifying(json: unknown): QualiRow[] {
  const races = (json as { MRData: { RaceTable: { Races: { QualifyingResults: ApiResult[] }[] } } }).MRData.RaceTable
    .Races
  if (!races.length) return []
  return races[0].QualifyingResults.map((r) => {
    const laps = [r.Q1, r.Q2, r.Q3].map(lapMs).filter((t): t is number => t !== null)
    return {
      driverId: r.Driver.driverId,
      code: r.Driver.code,
      position: Number(r.position),
      bestMs: laps.length ? Math.min(...laps) : null,
    }
  })
}

type ApiRaceResult = {
  position: string
  positionText: string
  grid: string
  status: string
  Driver: { driverId: string; code: string; givenName: string; familyName: string }
}

export function parseRaceResults(json: unknown): RaceRow[] {
  const races = (json as { MRData: { RaceTable: { Races: { Results: ApiRaceResult[] }[] } } }).MRData.RaceTable.Races
  if (!races.length) return []
  return races[0].Results.map((r) => ({
    driverId: r.Driver.driverId,
    code: r.Driver.code,
    name: `${r.Driver.givenName} ${r.Driver.familyName}`,
    position: /^\d+$/.test(r.positionText) ? Number(r.positionText) : null,
    grid: Number(r.grid) || null, // 0 = pit lane
    status: r.status,
  }))
}

export const fetchQualifying = (url: string, fetchFn: typeof fetch = fetch) => fetchRows(url, parseQualifying, fetchFn)
export const fetchRaceResults = (url: string, fetchFn: typeof fetch = fetch) => fetchRows(url, parseRaceResults, fetchFn)

async function fetchRows<T>(url: string, parse: (json: unknown) => T[], fetchFn: typeof fetch): Promise<FetchResult<T>> {
  let response: Response
  try {
    response = await fetchFn(url)
  } catch {
    return { status: 'error', message: "Couldn't reach the results service. Check your connection and try again." }
  }
  if (response.status === 429) return { status: 'error', message: 'The results service is busy. Try again in a minute.' }
  if (!response.ok) return { status: 'error', message: `The results service returned an error (${response.status}). Try again later.` }
  let rows: T[]
  try {
    rows = parse(await response.json())
  } catch {
    // e.g. a maintenance page served with status 200
    return { status: 'error', message: 'The results service sent something unexpected. Try again later.' }
  }
  return rows.length ? { status: 'ok', rows } : { status: 'not-yet' }
}

/** Grid entries for the drivers the model knows, plus anyone it doesn't. */
export function toGrid(rows: QualiRow[], drivers: Driver[]): { grid: GridEntry[]; unknown: string[]; poleMs: number } {
  const known = new Set(drivers.map((d) => d.id))
  const poleMs = Math.min(...rows.map((r) => r.bestMs ?? Infinity))
  return {
    grid: rows
      .filter((r) => known.has(r.driverId))
      .map((r) => ({
        driverId: r.driverId,
        qualiPosition: r.position,
        gapPct: r.bestMs === null ? null : 100 * (r.bestMs / poleMs - 1),
        penalty: 0,
      })),
    unknown: rows.filter((r) => !known.has(r.driverId)).map((r) => r.driverId),
    poleMs,
  }
}
