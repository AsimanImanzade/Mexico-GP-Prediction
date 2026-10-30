/** 0.4022 -> "40.2%" */
export const pct = (p: number) => `${(100 * p).toFixed(1)}%`

/** Change in percentage points with an arrow, so it never relies on colour. */
export function change(delta: number): { text: string; trend: 'up' | 'down' | 'flat' } {
  const points = 100 * delta
  if (Math.abs(points) < 0.05) return { text: '–', trend: 'flat' }
  return points > 0 ? { text: `▲ ${points.toFixed(1)}`, trend: 'up' } : { text: `▼ ${(-points).toFixed(1)}`, trend: 'down' }
}

/** 1 -> "1st" */
export const ordinal = (n: number) => {
  const teens = n % 100 >= 11 && n % 100 <= 13
  const suffix = teens ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** Finishing position as shown in a results chip. */
export const finish = (pos: number | null) => (pos === null ? 'DNF' : `P${pos}`)

/** Timing-screen colour for a result: purple win, green podium, white points, muted otherwise. */
export const finishTone = (pos: number | null) =>
  pos === null ? 'out' : pos === 1 ? 'best' : pos <= 3 ? 'good' : pos <= 10 ? 'points' : 'out'
