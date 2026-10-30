import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import mexico from '../../public/data/mexico_2026.json'
import model from '../../public/data/post_quali_model.json'
import austinQuali from '../../tests/fixtures/jolpica_2026_r18.json'
import results from '../../tests/fixtures/jolpica_results_r18.json'
import { parseQualifying, parseRaceResults, toGrid } from '../data/jolpica'
import { raceOutcome } from '../model/outcome'
import type { MexicoData, XgbModel } from '../types'
import { RaceResult } from './RaceResult'

const data = mexico as MexicoData
const rows = parseRaceResults(results)
const grid = toGrid(parseQualifying(austinQuali), data.drivers).grid
const outcome = (r = rows) => raceOutcome(data, model as XgbModel, r, grid)

describe('RaceResult', () => {
  it('names the winner and says the model called it', () => {
    render(<RaceResult outcome={outcome()} raceName="Mexico City Grand Prix" />)
    expect(screen.getByRole('heading', { name: 'Andrea Kimi Antonelli won the Mexico City Grand Prix' })).toBeInTheDocument()
    expect(screen.getByText(/The model called it/)).toBeInTheDocument()
  })

  it('does not repeat the favourite as the winner', () => {
    render(<RaceResult outcome={outcome()} raceName="Mexico City Grand Prix" />)
    expect(screen.queryByText(/ranked 1st/)).toBeNull()
  })

  it('says so when the favourite lost', () => {
    const upset = rows.map((r) => ({ ...r, position: r.driverId === 'gasly' ? 1 : r.position === 1 ? 2 : r.position }))
    render(<RaceResult outcome={outcome(upset)} raceName="Mexico City Grand Prix" />)
    expect(screen.getByText(/The model's favourite did not win/)).toBeInTheDocument()
  })

  it('shows the classification with a retirement marked', () => {
    render(<RaceResult outcome={outcome()} raceName="Mexico City Grand Prix" />)
    expect(screen.getAllByRole('row')).toHaveLength(23)
    expect(screen.getAllByText('DNF').length).toBeGreaterThan(0)
  })
})
