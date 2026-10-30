import { describe, expect, it } from 'vitest'
import mexico from '../../public/data/mexico_2026.json'
import austin from '../../tests/fixtures/jolpica_2026_r18.json'
import empty from '../../tests/fixtures/jolpica_empty.json'
import results from '../../tests/fixtures/jolpica_results_r18.json'
import type { Driver } from '../types'
import { fetchQualifying, fetchRaceResults, parseQualifying, parseRaceResults, toGrid } from './jolpica'

const drivers = mexico.drivers as Driver[]
const respond = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status })

describe('parseQualifying', () => {
  it('reads all 22 drivers with their best lap', () => {
    const rows = parseQualifying(austin)
    expect(rows).toHaveLength(22)
    expect(rows[0]).toMatchObject({ driverId: 'antonelli', code: 'ANT', position: 1, bestMs: 94035 })
    expect(Math.min(...rows.map((r) => r.bestMs ?? Infinity))).toBe(rows[0].bestMs)
  })

  it('gives a driver without any lap time a null best lap', () => {
    const copy = structuredClone(austin)
    const row = copy.MRData.RaceTable.Races[0].QualifyingResults[21] as Record<string, unknown>
    delete row.Q1
    delete row.Q2
    delete row.Q3
    expect(parseQualifying(copy)[21].bestMs).toBeNull()
  })
})

describe('fetchQualifying', () => {
  it('reports not-yet when the session has no results', async () => {
    expect(await fetchQualifying('x', respond(empty))).toEqual({ status: 'not-yet' })
  })

  it('explains a busy service', async () => {
    expect(await fetchQualifying('x', respond({}, 429))).toEqual({
      status: 'error',
      message: 'The results service is busy. Try again in a minute.',
    })
  })

  it('explains a network failure', async () => {
    const offline = async () => Promise.reject(new TypeError('Failed to fetch'))
    expect(await fetchQualifying('x', offline)).toEqual({
      status: 'error',
      message: "Couldn't reach the results service. Check your connection and try again.",
    })
  })

  it('returns the rows when results exist', async () => {
    const result = await fetchQualifying('x', respond(austin))
    expect(result.status).toBe('ok')
  })
})

describe('toGrid', () => {
  it('turns lap times into gaps and reports the pole lap', () => {
    const { grid, unknown, poleMs } = toGrid(parseQualifying(austin), drivers)
    expect(unknown).toEqual([])
    expect(poleMs).toBe(94035)
    expect(grid.find((e) => e.driverId === 'antonelli')).toEqual({
      driverId: 'antonelli', qualiPosition: 1, gapPct: 0, penalty: 0,
    })
  })

  it('keeps a driver with no time at their position with a missing gap', () => {
    const rows = parseQualifying(austin)
    rows[21] = { ...rows[21], bestMs: null }
    const entry = toGrid(rows, drivers).grid.find((e) => e.driverId === rows[21].driverId)
    expect(entry).toMatchObject({ qualiPosition: 22, gapPct: null })
  })

  it('lists drivers the model has no data for', () => {
    const rows = parseQualifying(austin)
    rows[5] = { ...rows[5], driverId: 'newdriver' }
    const { grid, unknown } = toGrid(rows, drivers)
    expect(unknown).toEqual(['newdriver'])
    expect(grid).toHaveLength(21)
  })
})

describe('unexpected replies', () => {
  const UNEXPECTED = { status: 'error', message: 'The results service sent something unexpected. Try again later.' }

  it('handles an HTML page sent with status 200', async () => {
    const html = async () => new Response('<html>maintenance</html>', { status: 200 })
    expect(await fetchQualifying('x', html)).toEqual(UNEXPECTED)
  })

  it('handles JSON without a race table', async () => {
    expect(await fetchQualifying('x', respond({ MRData: {} }))).toEqual(UNEXPECTED)
  })
})

describe('race results', () => {
  it('reads the finishing order, with retirements as no position', () => {
    const rows = parseRaceResults(results)
    expect(rows).toHaveLength(22)
    expect(rows[0]).toMatchObject({ driverId: 'antonelli', code: 'ANT', name: 'Andrea Kimi Antonelli', position: 1, grid: 1 })
    expect(rows[21].position).toBeNull()
  })

  it('reports not-yet until the race is published', async () => {
    expect(await fetchRaceResults('x', respond(empty))).toEqual({ status: 'not-yet' })
  })

  it('returns the rows once published', async () => {
    expect((await fetchRaceResults('x', respond(results))).status).toBe('ok')
  })
})
