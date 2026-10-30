import { useEffect, useState } from 'react'
import type { MexicoData, ModelCard, XgbModel } from '../types'

const url = (path: string) => `${import.meta.env.BASE_URL}data/${path}`

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(url(path))
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status}).`)
  return res.json() as Promise<T>
}

export type DashboardData = { mexico: MexicoData; model: XgbModel; card: ModelCard }

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getJson<MexicoData>('mexico_2026.json'),
      getJson<XgbModel>('post_quali_model.json'),
      getJson<ModelCard>('model_card.json'),
    ])
      .then(([mexico, model, card]) => setData({ mexico, model, card }))
      .catch((e: Error) => setError(e.message))
  }, [])

  return { data, error }
}
