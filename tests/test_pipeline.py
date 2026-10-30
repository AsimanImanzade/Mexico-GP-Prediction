"""Checks that the qualifying update cannot change the pre-weekend pipeline.

Run with:  .venv/bin/python tests/test_pipeline.py   (or pytest)

0. No leakage: scrambling a finished race's result leaves that race's
   features unchanged.
1. Without qualifying data, the feature table equals what the original
   entry-list logic (copy the latest race's entrants) produces.
2. With qualifying data for the target race, every completed race and every
   pre-weekend feature of the target race stays the same; only the weekend
   features (grid, qualifying) get filled in.
3. The saved pre-weekend model gives identical probabilities either way.
"""
import shutil
import sys
import tempfile
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
import build_features as bf  # noqa: E402

TARGET = dict(season=bf.TARGET_SEASON, round=bf.TARGET_ROUND)


def original_add_target_rows(res, quali, sched):
    """The entry-list logic the models were trained and validated with."""
    if ((res.season == bf.TARGET_SEASON) & (res["round"] == bf.TARGET_ROUND)).any():
        return res
    meta = sched[(sched.season == bf.TARGET_SEASON) & (sched["round"] == bf.TARGET_ROUND)].iloc[0]
    future = res.loc[res.date == res.date.max(), ["driver_id", "driver_code", "driver_dob", "constructor_id"]].copy()
    for col in ["season", "round", "race_name", "date", "circuit_id", "country"]:
        future[col] = meta[col]
    return pd.concat([res, future], ignore_index=True)


def build_in(raw_dir, add_target_rows=None):
    """Build features from `raw_dir`, optionally with a different entry-list function."""
    saved = bf.RAW, bf.ROOT, bf.add_target_rows
    bf.RAW, bf.ROOT = raw_dir, raw_dir.parents[1]
    if add_target_rows is not None:
        bf.add_target_rows = add_target_rows
    try:
        return bf.build()
    finally:
        bf.RAW, bf.ROOT, bf.add_target_rows = saved


def target_rows(df):
    t = df[(df.season == TARGET["season"]) & (df["round"] == TARGET["round"])]
    return t.sort_values("driver_id").reset_index(drop=True)


def raw_without_target_quali(tmp):
    """Copy of data/raw with any qualifying of the target race removed."""
    raw = tmp / "data" / "raw"
    raw.mkdir(parents=True)
    for f in (ROOT / "data" / "raw").glob("*.csv"):
        shutil.copy(f, raw)
    q = pd.read_csv(raw / "qualifying.csv")
    q[~((q.season == TARGET["season"]) & (q["round"] == TARGET["round"]))].to_csv(raw / "qualifying.csv", index=False)
    return raw


def add_simulated_quali(raw):
    """Give the target race a qualifying session with the latest race's entrants."""
    q = pd.read_csv(raw / "qualifying.csv")
    last = q[(q.season == TARGET["season"]) & (q["round"] == TARGET["round"] - 1)].copy()
    last["round"] = TARGET["round"]
    last["quali_position"] = np.roll(last.quali_position.to_numpy(), 3)  # a different order
    last["best_quali_ms"] = 76000 + 60 * (last.quali_position - 1)
    pd.concat([q, last]).to_csv(raw / "qualifying.csv", index=False)


def write_target_quali(raw, gaps, slot_overrides=None):
    """Target-race qualifying with the latest race's entrants and given % gaps (by position).

    `slot_overrides` maps quali position -> grid slot (written as grid_overrides.csv).
    Returns the grid table that `grid_features.weekend_features` expects.
    """
    q = pd.read_csv(raw / "qualifying.csv")
    s = q[(q.season == TARGET["season"]) & (q["round"] == TARGET["round"] - 1)].copy()
    s["round"] = TARGET["round"]
    s["quali_position"] = np.roll(s.quali_position.to_numpy(), 3)
    s = s.sort_values("quali_position").reset_index(drop=True)
    s["best_quali_ms"] = 75586 * (1 + np.asarray(gaps, dtype=float) / 100)
    pd.concat([q, s]).to_csv(raw / "qualifying.csv", index=False)

    slots = s.quali_position.astype(float).copy()
    if slot_overrides:
        for qp, slot in slot_overrides.items():
            slots[s.quali_position == qp] = slot
        changed = s.quali_position.isin(list(slot_overrides))
        pd.DataFrame({"driver_code": s.driver_code[changed], "grid": slots[changed]}) \
            .to_csv(raw.parent / "grid_overrides.csv", index=False)
    return pd.DataFrame({"driver_id": s.driver_id, "quali_position": s.quali_position,
                         "gap_pct": gaps, "grid_slot": slots})


def test_weekend_features_match_pipeline():
    from grid_features import weekend_features

    base = [0, .19, .35, .43, .54, .66, .78, .88, 1.1, 1.12, 1.4, 1.55, 1.67, 1.79, 1.92, 2.19, 2.34, 2.59,
            2.67, 2.88, 4.7, 5.3]
    missing = base.copy()
    missing[15] = np.nan                                   # P16 set no time
    scenarios = [(base, None), (base, {1: 6, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}), (missing, None)]
    for gaps, overrides in scenarios:
        with tempfile.TemporaryDirectory() as tmp:
            raw = raw_without_target_quali(Path(tmp))
            grid = write_target_quali(raw, gaps, overrides)
            built = target_rows(build_in(raw))
        grid = grid.merge(built[["driver_id", "team"]], on="driver_id")
        mine = weekend_features(grid).assign(driver_id=grid.driver_id)
        mine = mine.sort_values("driver_id").reset_index(drop=True)
        pd.testing.assert_frame_equal(mine[bf.WEEKEND], built[bf.WEEKEND], check_dtype=False, rtol=1e-9)


def test_apply_penalties():
    from grid_features import apply_penalties

    slots = apply_penalties(pd.Series([1, 2, 3, 4]), pd.Series([3, 0, 0, 0]))
    assert slots.tolist() == [4, 1, 2, 3]
    pens = pd.Series([0] * 22)
    pens[20] = 5                                           # P21 penalised 5 places
    slots = apply_penalties(pd.Series(range(1, 23)), pens)
    assert slots[20] == 22 and sorted(slots) == list(range(1, 23))


def test_finished_race_keeps_its_pre_weekend_features():
    """After Mexico is run, its own result must not change the features of its rows."""
    with tempfile.TemporaryDirectory() as tmp:
        raw = raw_without_target_quali(Path(tmp))
        before = target_rows(build_in(raw))
        res = pd.read_csv(raw / "results.csv")
        rows = res[(res.season == TARGET["season"]) & (res["round"] == TARGET["round"] - 1)].copy()
        rows["round"], rows["circuit_id"], rows["date"] = TARGET["round"], "rodriguez", "2026-11-01"
        pd.concat([res, rows]).to_csv(raw / "results.csv", index=False)
        after = target_rows(build_in(raw))
    pd.testing.assert_frame_equal(before[bf.PRE_WEEKEND], after[bf.PRE_WEEKEND], check_dtype=False)


def test_features_ignore_own_race_result():
    """Scrambling a finished race's result must not change that race's features."""
    outcome = ["position", "position_text", "points", "status", "laps", "time_ms", "fastest_lap_rank"]
    with tempfile.TemporaryDirectory() as tmp:
        raw = raw_without_target_quali(Path(tmp))
        before = build_in(raw)
        res = pd.read_csv(raw / "results.csv")
        last = res.index[(res.season == TARGET["season"]) & (res["round"] == TARGET["round"] - 1)]
        res.loc[last, outcome] = np.roll(res.loc[last, outcome].to_numpy(), 7, axis=0)
        res.to_csv(raw / "results.csv", index=False)
        after = build_in(raw)

    def race(df):
        r = df[(df.season == TARGET["season"]) & (df["round"] == TARGET["round"] - 1)]
        return r.sort_values("driver_id").reset_index(drop=True)[bf.PRE_WEEKEND + bf.WEEKEND]

    pd.testing.assert_frame_equal(race(before), race(after))


def test_no_quali_matches_original_logic():
    with tempfile.TemporaryDirectory() as tmp:
        raw = raw_without_target_quali(Path(tmp))
        new = build_in(raw)
        old = build_in(raw, original_add_target_rows)
    pd.testing.assert_frame_equal(new, old)


def test_quali_only_fills_weekend_features():
    with tempfile.TemporaryDirectory() as tmp:
        raw = raw_without_target_quali(Path(tmp))
        before = build_in(raw)
        add_simulated_quali(raw)
        after = build_in(raw)

    done_cols = bf.ID_COLS + bf.TARGETS + bf.PRE_WEEKEND + bf.WEEKEND
    past_before = before[before.win.notna()][done_cols].reset_index(drop=True)
    past_after = after[after.win.notna()][done_cols].reset_index(drop=True)
    pd.testing.assert_frame_equal(past_before, past_after)

    tb, ta = target_rows(before), target_rows(after)
    pd.testing.assert_frame_equal(tb[bf.ID_COLS + bf.PRE_WEEKEND], ta[bf.ID_COLS + bf.PRE_WEEKEND])
    assert tb.grid_pos.isna().all() and ta.grid_pos.notna().all()
    assert ta.quali_position.notna().all()

    model = joblib.load(ROOT / "models" / "pre_weekend.joblib")
    np.testing.assert_allclose(model.predict(tb), model.predict(ta), rtol=1e-12)  # same up to float rounding


if __name__ == "__main__":
    for test in [test_features_ignore_own_race_result, test_no_quali_matches_original_logic,
                 test_quali_only_fills_weekend_features]:
        test()
        print(f"PASS  {test.__name__}")


def test_apply_penalties_keeps_official_slots_around_a_gap():
    """A substitute the model can't score leaves P2 empty: the others keep their slots."""
    from grid_features import apply_penalties

    assert apply_penalties(pd.Series([1, 3, 4]), pd.Series([0, 0, 0])).tolist() == [1, 3, 4]
    assert apply_penalties(pd.Series([1, 3, 4]), pd.Series([3, 0, 0])).tolist() == [4, 1, 3]
