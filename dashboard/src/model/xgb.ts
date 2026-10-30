import type { XgbModel, XgbTree } from '../types'

// Scores the exported XGBoost model exactly the way XGBoost does: features
// and thresholds compared as float32, missing values follow the tree's
// "missing" branch, and the margin starts from logit(base_score).

const f32 = Math.fround

function leaf(tree: XgbTree, x: (number | null)[]): number {
  let node = 0
  while (tree.f[node] !== -1) {
    const v = x[tree.f[node]]
    if (v === null || v === undefined || Number.isNaN(v)) node = tree.m[node]
    else node = f32(v) < f32(tree.t[node]) ? tree.y[node] : tree.n[node]
  }
  return tree.v[node]
}

export function margin(model: XgbModel, x: (number | null)[]): number {
  const bs = model.baseScore
  let sum = f32(Math.log(bs / (1 - bs)))
  for (const tree of model.trees) sum = f32(sum + leaf(tree, x))
  return sum
}

export function predictProba(model: XgbModel, x: (number | null)[]): number {
  return 1 / (1 + Math.exp(-margin(model, x)))
}
