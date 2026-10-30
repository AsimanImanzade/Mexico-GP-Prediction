import { describe, expect, it } from 'vitest'
import { clockText } from './Chrome'

const start = '2026-10-31T21:00:00Z'

describe('clockText', () => {
  it('counts down before the session', () => {
    expect(clockText(start, Date.parse('2026-10-30T20:00:00Z'))).toBe('in 1d 1h')
  })

  it('waits for the result once the session has started', () => {
    expect(clockText(start, Date.parse('2026-10-31T21:30:00Z'))).toBe('Result pending')
  })

  it('shows the result when there is one', () => {
    expect(clockText(start, Date.parse('2026-10-31T23:00:00Z'), 'Pole: VER')).toBe('Pole: VER')
  })
})
