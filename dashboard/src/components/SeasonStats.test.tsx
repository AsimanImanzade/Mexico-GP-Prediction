import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import s2021 from '../../public/data/seasons/2021.json'
import s2026 from '../../public/data/seasons/2026.json'
import type { SeasonData } from '../types'
import { SeasonStats } from './SeasonStats'

const files: Record<number, unknown> = { 2021: s2021, 2026: s2026 }
const fromDisk = vi.fn(async (year: number) => files[year] as SeasonData)

describe('SeasonStats', () => {
  it('shows the 2026 drivers standings with the leader first', async () => {
    render(<SeasonStats loadSeason={fromDisk} />)
    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]).getByText('Andrea Kimi Antonelli')).toBeInTheDocument()
    expect(within(rows[1]).getByText('365')).toBeInTheDocument()
  })

  it('switches to the constructors', async () => {
    render(<SeasonStats loadSeason={fromDisk} />)
    await screen.findAllByRole('row')
    await userEvent.click(screen.getByRole('button', { name: 'Constructors' }))
    expect(within(screen.getAllByRole('row')[1]).getByText('Mercedes')).toBeInTheDocument()
  })

  it('loads another season', async () => {
    render(<SeasonStats loadSeason={fromDisk} />)
    await screen.findAllByRole('row')
    await userEvent.selectOptions(screen.getByLabelText('Season'), '2021')
    expect(fromDisk).toHaveBeenLastCalledWith(2021)
    expect(await screen.findByText('Max Verstappen', { selector: 'td *, td' })).toBeInTheDocument()
  })

  it('shows a driver’s race-by-race results', async () => {
    render(<SeasonStats loadSeason={fromDisk} />)
    const rows = await screen.findAllByRole('row')
    await userEvent.click(within(rows[2]).getByRole('button'))
    const detail = screen.getByRole('region', { name: /race by race/i })
    expect(within(detail).getAllByRole('listitem')).toHaveLength(18)
  })

  it('names every round’s winner without relying on colour', async () => {
    render(<SeasonStats loadSeason={fromDisk} />)
    await screen.findAllByRole('row')
    expect(screen.getByRole('button', { name: /Round 16, Bahrain Grand Prix in Malaysia: won by Max Verstappen/ })).toBeInTheDocument()
  })
})
