import { useState } from 'react'
import { pct } from '../format'
import type { ModelCard } from '../types'

// Categorical slots 1-6 from the dataviz reference palette (dark steps),
// validated on the #13202E screen. Colour follows the driver, in fixed order.
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9']
const W = 600
const H = 260
const M = { top: 12, right: 16, bottom: 30, left: 44 }

export function GridValueChart({ points }: { points: ModelCard['gridValue'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const drivers = [...new Set(points.map((p) => p.driver_code))]
  const slots = [...new Set(points.map((p) => p.slot))].sort((a, b) => a - b)
  const value = (d: string, s: number) => points.find((p) => p.driver_code === d && p.slot === s)?.win_prob ?? 0
  const yMax = Math.ceil(Math.max(...points.map((p) => p.win_prob)) * 10) / 10
  const x = (s: number) => M.left + ((s - slots[0]) / (slots[slots.length - 1] - slots[0])) * (W - M.left - M.right)
  const y = (v: number) => M.top + (1 - v / yMax) * (H - M.top - M.bottom)
  const ticks = Array.from({ length: Math.round(yMax * 10) + 1 }, (_, i) => i / 10)
  const step = (W - M.left - M.right) / (slots.length - 1)

  return (
    <figure className="chart">
      <ul className="chart-legend">
        {drivers.map((d, i) => (
          <li key={d}><i style={{ background: SERIES[i] }} aria-hidden="true" />{d}</li>
        ))}
      </ul>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Win probability by grid slot for the six favourites" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="gridline" />
              <text x={M.left - 8} y={y(t)} className="axis" textAnchor="end" dominantBaseline="middle">{Math.round(t * 100)}%</text>
            </g>
          ))}
          {slots.map((s) => (
            <text key={s} x={x(s)} y={H - 8} className="axis" textAnchor="middle">P{s}</text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} className="crosshair" />}
          {drivers.map((d, i) => (
            <g key={d}>
              <path className="line" d={slots.map((s, k) => `${k ? 'L' : 'M'}${x(s)},${y(value(d, s))}`).join('')} stroke={SERIES[i]} />
              {slots.map((s) => (
                <circle key={s} cx={x(s)} cy={y(value(d, s))} r={hover === s ? 5 : 3.5} fill={SERIES[i]} className="marker" />
              ))}
            </g>
          ))}
          {slots.map((s) => (
            <rect key={s} x={x(s) - step / 2} y={M.top} width={step} height={H - M.top - M.bottom} fill="transparent" onMouseEnter={() => setHover(s)} />
          ))}
        </svg>
        {hover !== null && (
          <div
            className="chart-tip"
            style={{ left: `${(100 * x(hover)) / W}%`, transform: x(hover) > W / 2 ? 'translateX(calc(-100% - 12px))' : undefined }}
          >
            <strong>From P{hover}</strong>
            {[...drivers].sort((a, b) => value(b, hover) - value(a, hover)).map((d) => (
              <span key={d}><i style={{ background: SERIES[drivers.indexOf(d)] }} aria-hidden="true" />{d} {pct(value(d, hover))}</span>
            ))}
          </div>
        )}
      </div>
      <details className="table-view">
        <summary>Show as a table</summary>
        <table aria-label="Win probability by grid slot">
          <thead><tr><th scope="col">Slot</th>{drivers.map((d) => <th key={d} scope="col" className="num">{d}</th>)}</tr></thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s}><th scope="row">P{s}</th>{drivers.map((d) => <td key={d} className="num">{pct(value(d, s))}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
