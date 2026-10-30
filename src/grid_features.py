"""Weekend (post-qualifying) features for a hand-made grid.

The same rules `build_features.py` applies to real qualifying data, written
for a single race so the dashboard export can score any grid without
rebuilding the whole feature table. `tests/test_pipeline.py` checks the two
agree.
"""
import numpy as np
import pandas as pd

from build_features import WEEKEND

GAP_CAP = 7.0  # % to pole; same cap as build_features (wet sessions / no-time laps)


def apply_penalties(quali_position, penalty):
    """Grid slots after penalties: a driver drops `penalty` places, others move up.

    Sorting on (target slot, penalised?, quali position) puts an unpenalised
    driver ahead of a penalised one aiming for the same slot. Drivers are then
    placed on the slots they occupy between them (normally 1..n).
    """
    qp, pen = pd.Series(quali_position).reset_index(drop=True), pd.Series(penalty).reset_index(drop=True)
    order = pd.DataFrame({"target": qp + pen, "penalised": pen > 0, "qp": qp}).sort_values(["target", "penalised", "qp"])
    # Fill the slots these drivers occupy, so a driver the model can't score keeps theirs.
    slots = pd.Series(np.sort(qp.to_numpy()), index=order.index).sort_index()
    return slots.set_axis(pd.Series(quali_position).index)


def weekend_features(grid):
    """WEEKEND columns for a grid with driver_id, team, quali_position, gap_pct, grid_slot."""
    gap = grid.gap_pct.astype(float)
    gap = 100 * ((1 + gap / 100) / (1 + gap.min() / 100) - 1)  # fastest lap = 0, like build_features
    gap = gap.clip(upper=GAP_CAP)
    team_sum = gap.groupby(grid.team).transform("sum")
    team_n = gap.groupby(grid.team).transform("count")
    out = pd.DataFrame(index=grid.index)
    out["grid_pos"] = grid.grid_slot.astype(float)
    out["front_row"] = (out.grid_pos <= 2).astype(float)
    out["quali_position"] = grid.quali_position.astype(float)
    out["quali_gap_pct"] = gap
    out["tm_quali_gap"] = np.where(team_n == 2, gap - (team_sum - gap), np.nan)
    out["grid_penalty"] = (out.grid_pos - out.quali_position).clip(lower=0)
    out["sprint_pos"] = np.nan
    return out[WEEKEND]


def predict_grid(model, entry, grid):
    """Normalised P(win) per driver_id for `grid`, using the entry list's pre-weekend features."""
    grid = grid.merge(entry[["driver_id", "team"]], on="driver_id")
    rows = entry.drop(columns=WEEKEND).merge(
        weekend_features(grid).assign(driver_id=grid.driver_id.to_numpy()), on="driver_id")
    rows["race_key"] = "target"
    return pd.Series(model.predict(rows), index=rows.driver_id)
