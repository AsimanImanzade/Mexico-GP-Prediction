import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { describe, expect, it } from 'vitest'
import mexico from '../../public/data/mexico_2026.json'
import model from '../../public/data/post_quali_model.json'
import { gridReducer, initialGrid, type GridState } from '../state/gridReducer'
import type { MexicoData, XgbModel } from '../types'
import { GridEditor, realMessage, sortableTransition } from './GridEditor'

const data = mexico as MexicoData

function Harness({ init }: { init?: GridState }) {
  const [state, dispatch] = useReducer(gridReducer, init ?? initialGrid(data))
  return (
    <GridEditor data={data} model={model as XgbModel} state={state} dispatch={dispatch} real={{ status: 'not-yet' }} onLoadReal={() => {}} />
  )
}

const rowOf = (code: string) => screen.getAllByRole('listitem').find((li) => within(li).queryByText(code))!

describe('GridEditor', () => {
  it('moves Verstappen to pole with the keyboard and shows the gain', async () => {
    render(<Harness />)
    const before = within(rowOf('VER')).getByTestId('win').textContent

    await userEvent.click(within(rowOf('VER')).getByRole('button', { name: /Max Verstappen/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Move up' }))

    const row = rowOf('VER')
    expect(within(row).getByTestId('pos')).toHaveTextContent('1')
    expect(within(row).getByTestId('win').textContent).not.toBe(before)
    const delta = within(row).getByTestId('delta')
    expect(delta.textContent).toMatch(/^▲ \d+\.\d$/)
    expect(delta).toHaveClass('trend-up')
  })

  it('explains a bad gap entry', async () => {
    render(<Harness />)
    await userEvent.click(within(rowOf('LEC')).getByRole('button', { name: /Charles Leclerc/ }))
    const gap = screen.getByLabelText('Gap to pole (seconds)')
    await userEvent.clear(gap)
    await userEvent.type(gap, 'abc{Enter}')
    // dnd-kit adds its own live region, so look for the message inside any status region
    const message = screen.getByText('Enter the gap to pole in seconds, for example 0.214.')
    expect(message.closest('[role="status"]')).not.toBeNull()
  })

  it('tells the visitor when official qualifying is not out yet', () => {
    render(<Harness />)
    expect(screen.getByText(/isn't published yet/)).toBeInTheDocument()
  })
})

describe('gap box', () => {
  it('goes back to the kept value after a rejected entry', async () => {
    render(<Harness />)
    await userEvent.click(within(rowOf('LEC')).getByRole('button', { name: /Charles Leclerc/ }))
    const gap = screen.getByLabelText('Gap to pole (seconds)')
    await userEvent.type(gap, 'abc{Enter}')
    expect(gap).toHaveValue('')
  })

  it('keeps a driver with no lap time as missing when Enter is pressed on the empty box', async () => {
    const start = initialGrid(data)
    const grid = start.entries.map((e) => (e.driverId === 'leclerc' ? { ...e, gapPct: null } : e))
    const init = gridReducer(start, { type: 'loadReal', grid, unknown: [], poleMs: 76000 })
    let latest: GridState = init
    function Spy() {
      const [state, dispatch] = useReducer(gridReducer, init)
      latest = state
      return <GridEditor data={data} model={model as XgbModel} state={state} dispatch={dispatch} real={{ status: 'ok' }} onLoadReal={() => {}} />
    }
    render(<Spy />)
    await userEvent.click(within(rowOf('LEC')).getByRole('button', { name: /Charles Leclerc/ }))
    expect(screen.getByText(/No lap time in qualifying/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Gap to pole (seconds)'), '{Enter}')
    expect(latest.entries.find((e) => e.driverId === 'leclerc')!.gapPct).toBeNull()
  })
})

describe('qualifying status copy', () => {
  it('says qualifying has started once the session time has passed', () => {
    const after = Date.parse('2026-10-31T22:30:00Z')
    expect(realMessage({ status: 'not-yet' }, '2026-10-31T21:00:00Z', after)).toBe(
      'Qualifying has started. Official results usually appear within a few hours of the session, so try again later.',
    )
  })
})

describe('reduced motion', () => {
  it('drops the drag transition when the visitor asks for less motion', () => {
    expect(sortableTransition('transform 200ms ease', true)).toBeUndefined()
    expect(sortableTransition('transform 200ms ease', false)).toBe('transform 200ms ease')
  })
})

describe('what the numbers mean', () => {
  it('says the starting grid is a what-if, not a forecast', () => {
    render(<Harness />)
    expect(screen.getByText(/not a forecast/)).toBeInTheDocument()
  })

  it('says the official grid is the model prediction', () => {
    const start = initialGrid(data)
    render(<Harness init={gridReducer(start, { type: 'loadReal', grid: start.entries, unknown: [], poleMs: 76000 })} />)
    expect(screen.getByText(/the model's prediction for the race/)).toBeInTheDocument()
  })
})
