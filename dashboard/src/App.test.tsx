import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import card from '../public/data/model_card.json'
import mexico from '../public/data/mexico_2026.json'
import model from '../public/data/post_quali_model.json'
import quali from '../tests/fixtures/jolpica_2026_r18.json'
import empty from '../tests/fixtures/jolpica_empty.json'
import results from '../tests/fixtures/jolpica_results_r18.json'
import App from './App'

function site(q: unknown, r: unknown) {
  const body = (url: string) =>
    url.includes('qualifying.json') ? q : url.includes('results.json') ? r
      : url.includes('mexico_2026') ? mexico : url.includes('post_quali') ? model : card
  vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify(body(url))))
}

afterEach(() => vi.unstubAllGlobals())

describe('first screen', () => {
  it('opens on before qualifying while nothing is published', async () => {
    site(empty, empty)
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Before qualifying', pressed: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Race result' })).toBeNull()
  })

  it('opens on the grid after qualifying', async () => {
    site(quali, empty)
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Set the grid', pressed: true })).toBeInTheDocument()
    expect(await screen.findByText('Pole: ANT')).toBeInTheDocument()
  })

  it('opens on the race result after the race', async () => {
    site(quali, results)
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Race result', pressed: true })).toBeInTheDocument()
    expect(await screen.findByText('ANT won')).toBeInTheDocument()
  })
})
