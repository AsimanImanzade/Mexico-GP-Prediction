import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import card from '../../public/data/model_card.json'
import mexico from '../../public/data/mexico_2026.json'
import type { MexicoData, ModelCard } from '../types'
import { ModelReliability } from './ModelReliability'

const c = card as unknown as ModelCard
const view = () => render(<ModelReliability card={c} mexico={mexico as MexicoData} />)

describe('ModelReliability', () => {
  it('counts 2026 favourite wins from the backtest, both modes', () => {
    view()
    const pre = c.backtest2026.pre.filter((r) => r.winnerRank === 1).length
    const post = c.backtest2026.post.filter((r) => r.winnerRank === 1).length
    expect(pre).toBe(8)
    expect(post).toBe(13)
    expect(screen.getByText(new RegExp(`won ${pre} of 18 races before qualifying`))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`won ${post} of 18 races after qualifying`))).toBeInTheDocument()
  })

  it('compares the model with the simple rules', () => {
    view()
    const table = screen.getByRole('table', { name: /simple rules/i })
    expect(within(table).getByText('Back the championship leader')).toBeInTheDocument()
    expect(within(table).getByText('Back the pole-sitter')).toBeInTheDocument()
  })

  it('lists the Mexico backtest 2021 to 2025', () => {
    view()
    const list = screen.getByRole('list', { name: /mexico/i })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent?.slice(0, 4))).toEqual(
      ['2021', '2022', '2023', '2024', '2025'],
    )
  })

  it('draws what each grid slot is worth for six drivers, with a table view', async () => {
    view()
    const chart = screen.getByRole('img', { name: /grid slot/i })
    expect(chart.querySelectorAll('path.line')).toHaveLength(6)
    await userEvent.click(screen.getByText('Show as a table'))
    const table = screen.getByRole('table', { name: /grid slot/i })
    expect(within(table).getAllByRole('row')).toHaveLength(11)
  })
})

describe('honest about the protocol', () => {
  it('says which Mexico rows informed model choice', () => {
    view()
    expect(screen.getByText(/2021 to 2024 were also used to choose the model/)).toBeInTheDocument()
  })
})

describe('after the race', () => {
  it('adds 2026 to the Mexico list', () => {
    render(<ModelReliability card={c} mexico={mexico as MexicoData} mexico2026={{ favourite: 'ANT', favProb: 0.4, winner: 'Max Verstappen', winnerRank: 2 }} />)
    const items = within(screen.getByRole('list', { name: /mexico/i })).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[5]).toHaveTextContent('2026')
    expect(items[5]).toHaveTextContent('Max Verstappen won, ranked 2')
  })
})
