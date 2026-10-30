"""Tests for src/export_dashboard.py (run with: .venv/bin/python -m pytest tests/test_export.py -q)."""
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
import xgboost as xgb

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
import export_dashboard as ex  # noqa: E402


@pytest.fixture(scope="module")
def inputs():
    return ex.load_inputs()


def walk(tree, x):
    """Reference tree walk with XGBoost's float32 comparisons."""
    node = 0
    while tree["f"][node] != -1:
        v = x[tree["f"][node]]
        if v is None or np.isnan(v):
            node = tree["m"][node]
        elif np.float32(v) < np.float32(tree["t"][node]):
            node = tree["y"][node]
        else:
            node = tree["n"][node]
    return tree["v"][node]


def test_typical_gaps(inputs):
    g = ex.typical_gaps(inputs["quali"])
    assert len(g) == 22
    assert g[0] == 0
    assert all(b >= a for a, b in zip(g, g[1:]))
    assert round(g[1], 3) == 0.189
    assert round(g[9], 3) == 1.125


def test_model_json_matches_xgboost(inputs):
    model = inputs["post_model"]
    payload = ex.xgb_to_json(model.members["XGBoost"].get_booster())
    assert payload["features"] == model.used_features_
    X = inputs["features"][model.used_features_].dropna(subset=["grid_pos"]).sample(50, random_state=0)
    margins = model.members["XGBoost"].get_booster().predict(xgb.DMatrix(X), output_margin=True)
    bs = payload["baseScore"]
    for row, expected in zip(X.to_numpy(), margins):
        mine = np.log(bs / (1 - bs)) + sum(walk(t, row) for t in payload["trees"])
        assert abs(mine - expected) < 1e-5


def test_mexico_payload(inputs):
    p = ex.mexico_payload(inputs)
    assert len(p["drivers"]) == 22
    assert abs(sum(d["preProb"] for d in p["drivers"]) - 1) < 1e-9
    saved = pd.read_csv(ROOT / "data" / "predictions" / "mexico_2026_pre_weekend.csv").set_index("driver_id").win_prob
    for d in p["drivers"]:
        assert abs(d["preProb"] - saved[d["id"]]) < 1e-12
    ant = next(d for d in p["drivers"] if d["code"] == "ANT")
    assert all(len(d["why"]) == 3 for d in p["drivers"])
    assert len(ant["features"]) == 70
    assert p["meta"]["refPoleMs"] == 75586


def test_season_2026(inputs):
    s = ex.season_payload(2026, inputs)
    first = s["drivers"][0]
    assert first["id"] == "antonelli"
    assert first["points"] == 365.0
    assert first["wins"] == 9


def test_parity_fixture(inputs):
    fx = ex.parity_fixture(inputs, n_cases=300, n_rows=50)
    assert len(fx["cases"]) == 300 and len(fx["rows"]) == 50
    for case in fx["cases"]:
        assert abs(sum(case["probs"].values()) - 1) < 1e-6  # XGBoost probabilities are float32
        assert sorted(e["qualiPosition"] for e in case["grid"]) == list(range(1, 23))


# ---- final-review fixes ------------------------------------------------------------
def test_rule_hits_ignore_row_order(inputs):
    """Tied scores (everyone on 0 points at Round 1) must not be broken by row order."""
    feats = inputs["features"]
    shuffled = feats.sample(frac=1, random_state=1).sort_values("race_key", kind="stable")
    assert ex.rule_hits(feats, "drv_season_pts", True, (2025, 2026)) == \
        ex.rule_hits(shuffled, "drv_season_pts", True, (2025, 2026))


def test_rule_hits_split_credit_on_ties():
    d = pd.DataFrame({"race_key": ["r1"] * 4, "season": [2026] * 4, "win": [1.0, 0, 0, 0], "pts": [0.0] * 4})
    hits = ex.rule_hits(d, "pts", True, (2026,))
    assert hits[2026] == {"top1": 0.25, "top3": 0.75}


def test_retirements_are_not_positions(inputs):
    ham = next(d for d in ex.mexico_payload(inputs)["drivers"] if d["id"] == "hamilton")
    res = inputs["results"]
    ham_r14 = res[(res.season == 2026) & (res["round"] == 14) & (res.driver_id == "hamilton")].position_text.iat[0]
    assert ham_r14 == "R"
    assert ham["lastFinishes"][0] is None
    season = ex.season_payload(2026, inputs)
    r14 = next(r for r in next(d for d in season["drivers"] if d["id"] == "hamilton")["results"] if r["round"] == 14)
    assert r14["pos"] is None


def test_every_feature_has_a_label():
    from build_features import PRE_WEEKEND, WEEKEND
    missing = [f for f in PRE_WEEKEND + WEEKEND if f not in ex.FEATURE_LABELS]
    assert missing == []


def test_official_standings_2020(inputs):
    s = ex.season_payload(2020, inputs)
    assert [c["team"] for c in s["constructors"][:4]] == ["mercedes", "red_bull", "mclaren", "racing_point"]
    assert s["constructors"][2]["points"] == 202.0
    assert ex.season_payload(2026, inputs)["drivers"][0]["points"] == 365.0


# ---- after the race -----------------------------------------------------------------
def with_mexico_result(inp):
    """Inputs as they will look once Mexico has been run: its own rows now exist."""
    after = dict(inp)
    for key in ("results", "quali"):
        df = inp[key]
        rows = df[(df.season == 2026) & (df["round"] == 18)].copy()
        rows["round"], rows["race_name"], rows["circuit_id"] = 19, "Mexico City Grand Prix", "rodriguez"
        after[key] = pd.concat([df, rows], ignore_index=True)
    f = inp["features"].copy()
    target = f.index[(f.season == 2026) & (f["round"] == 19)]
    f.loc[target, "win"] = 0.0
    f.loc[target[-1], "win"] = 1.0
    after["features"] = f
    return after


def test_mexico_result_cannot_reach_the_prediction(inputs):
    before = json.dumps(ex.clean(ex.mexico_payload(inputs)), sort_keys=True)
    after = json.dumps(ex.clean(ex.mexico_payload(with_mexico_result(inputs))), sort_keys=True)
    assert after == before


def test_rule_baselines_stop_before_mexico(inputs):
    assert ex.model_card_payload(with_mexico_result(inputs))["rules"] == ex.model_card_payload(inputs)["rules"]


def test_season_stats_do_include_mexico(inputs):
    races = ex.season_payload(2026, with_mexico_result(inputs))["races"]
    assert races[-1]["round"] == 19


def test_results_url_is_exported(inputs):
    assert ex.mexico_payload(inputs)["meta"]["resultsUrl"] == "https://api.jolpi.ca/ergast/f1/2026/19/results.json"
