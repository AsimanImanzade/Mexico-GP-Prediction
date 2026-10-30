import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import mexico from '../../public/data/mexico_2026.json'
import type { Driver } from '../types'
import { TimingTower } from './TimingTower'

const drivers = mexico.drivers as Driver[]
const rows = [...drivers].sort((a, b) => b.preProb - a.preProb).map((d) => ({ driver: d, prob: d.preProb }))

describe('TimingTower', () => {
  it('shows all 22 drivers with the favourite first', () => {
    render(<TimingTower rows={rows} selectedId={null} onSelect={() => {}} label="Win chances" />)
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(22)
    expect(within(options[0]).getByText('ANT')).toBeInTheDocument()
    expect(within(options[0]).getByText('40.2%')).toBeInTheDocument()
  })

  it('marks the selected driver', () => {
    render(<TimingTower rows={rows} selectedId="max_verstappen" onSelect={() => {}} label="Win chances" />)
    const ver = screen.getAllByRole('option').find((o) => within(o).queryByText('VER'))!
    expect(ver).toHaveAttribute('aria-selected', 'true')
  })

  it('selects a driver with the keyboard', async () => {
    const onSelect = vi.fn()
    render(<TimingTower rows={rows} selectedId={null} onSelect={onSelect} label="Win chances" />)
    screen.getAllByRole('option')[2].focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(rows[2].driver.id)
  })

  it('shows a gain with an arrow and the number, not colour alone', () => {
    const withDelta = rows.map((r, i) => ({ ...r, delta: i === 1 ? 0.253 : 0 }))
    render(<TimingTower rows={withDelta} selectedId={null} onSelect={() => {}} label="Win chances" />)
    expect(screen.getByText('▲ 25.3')).toBeInTheDocument()
  })
})
