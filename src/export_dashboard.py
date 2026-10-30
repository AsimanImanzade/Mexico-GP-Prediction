"""Export everything the dashboard needs as static JSON.

Writes to dashboard/public/data/ (served with the site) and the parity
fixture to dashboard/tests/fixtures/ (used by the TypeScript tests to pin
the in-browser model to this Python model).

Usage:  .venv/bin/python src/export_dashboard.py
"""
import json
import math
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb

from build_features import PRE_WEEKEND, TARGET_ROUND, TARGET_SEASON, TEAM_LINEAGE, WEEKEND
from grid_features import apply_penalties, predict_grid

ROOT = Path(__file__).resolve().parents[1]
DATA_OUT = ROOT / "dashboard" / "public" / "data"
FIXTURE_OUT = ROOT / "dashboard" / "tests" / "fixtures"
PRED = ROOT / "data" / "predictions"

QUALIFYING_URL = f"https://api.jolpi.ca/ergast/f1/{TARGET_SEASON}/{TARGET_ROUND}/qualifying.json"
RESULTS_URL = f"https://api.jolpi.ca/ergast/f1/{TARGET_SEASON}/{TARGET_ROUND}/results.json"
GAP_SEASONS = (2024, 2025, 2026)
STATS_SEASONS = range(2014, TARGET_SEASON + 1)

# Identity stripes only (never text colour), always shown beside the driver code
# and team name. Livery colours fans recognise, checked with the dataviz palette
# validator on the #13202E screen: all pass 3:1 contrast. Audi (titanium) and
# Cadillac (champagne) were picked to clear their neighbours; pairs still under
# the ΔE 15 normal-vision floor are official liveries (Red Bull/RB 13.0,
# Williams/RB 13.3, Haas/Cadillac 12.0), which is why colour is never the only cue.
TEAM_COLOURS = {
    "mercedes": "#27F4D2", "red_bull": "#3671C6", "ferrari": "#E8002D", "mclaren": "#FF8000",
    "aston_martin": "#229971", "alpine": "#FF87BC", "williams": "#64C4FF", "rb": "#6692FF",
    "haas": "#B6BABD", "audi": "#F2F3F4", "cadillac": "#E5C77A", "manor": "#E2231A",
    "caterham": "#2E8B57",
}

FEATURE_LABELS = {
    # driver form
    "drv_ewm_finish": "Recent finishing positions", "drv_ewm_points": "Recent points form",
    "drv_last_finish": "Last race finish", "drv_ewm_quali_pos": "Recent qualifying positions",
    "drv_ewm_quali_gap": "Recent qualifying pace", "drv_dnf_rate_10": "Retirements in the last 10 races",
    "drv_season_pts": "Season points", "drv_season_wins": "Wins this season",
    "drv_season_podiums": "Podiums this season", "drv_season_tm_h2h": "Qualifying record against teammate",
    "drv_season_pts_share": "Points share of the leader", "drv_season_rank": "Championship position",
    "drv_starts": "Experience (race starts)", "drv_career_wins": "Career wins",
    "drv_career_win_rate": "Career win rate", "drv_age": "Age",
    "drv_last2_avg_finish": "Finishes in the last 2 races", "drv_last3_avg_points": "Points in the last 3 races",
    "drv_last3_avg_quali_pos": "Qualifying in the last 3 races", "drv_wins_last5": "Wins in the last 5 races",
    "drv_season_avg_finish": "Average finish this season", "drv_season_avg_quali_gap": "Season qualifying pace",
    "drv_season_win_rate": "Season win rate", "drv_form_trend": "Driver's form trend",
    "drv_ewm_fastest_lap_rank": "Recent race pace", "drv_ewm_positions_gained": "Places gained in races",
    "drv_team_pts_share": "Share of the team's points",
    # car / team
    "team_ewm_points": "Car's recent points", "team_ewm_best_finish": "Car's recent best finishes",
    "team_ewm_quali_gap": "Car's recent qualifying pace", "team_dnf_rate_10": "Car reliability",
    "team_season_pts": "Team's season points", "team_season_rank": "Constructors' position",
    "team_last2_points": "Car's points in the last 2 races", "team_last2_best_finish": "Car's best finish in the last 2 races",
    "team_last3_quali_gap": "Car's qualifying pace in the last 3 races", "team_season_avg_points": "Car's average points this season",
    "team_season_avg_quali_gap": "Car's season qualifying pace", "team_form_trend": "Car's form trend",
    "team_prev_season_rank": "Team's position last season",
    # ratings
    "drv_elo": "Driver rating", "team_elo": "Team rating",
    "drv_elo_gap_to_best": "Rating gap to the best driver", "team_elo_gap_to_best": "Team rating gap to the best team",
    # circuit and context
    "drv_circuit_starts": "Starts at this circuit", "drv_circuit_wins": "Wins at this circuit",
    "drv_circuit_podiums": "Podiums at this circuit", "drv_circuit_avg_finish": "Record at this circuit",
    "team_circuit_best_finish": "Team's best recent finish here", "is_high_altitude": "High-altitude circuit",
    "drv_altitude_avg_finish": "Results at high-altitude tracks", "circuit_pole_win_rate": "How often pole wins here",
    "circuit_winner_avg_grid": "Winners' usual grid slot here", "circuit_overtaking": "Overtaking at this circuit",
    "new_regs_season": "First season of new rules", "season_progress": "Point in the season",
    "races_into_era": "Races into the current rules", "is_sprint_weekend": "Sprint weekend",
    # rank within the field
    "drv_ewm_finish_rank": "Recent finishes, rank in the field", "drv_ewm_points_rank": "Recent points, rank in the field",
    "drv_ewm_quali_gap_rank": "Recent qualifying pace, rank in the field",
    "team_ewm_points_rank": "Car's recent points, rank in the field",
    "team_ewm_quali_gap_rank": "Car's recent qualifying pace, rank in the field",
    "drv_elo_rank": "Driver rating, rank in the field", "team_elo_rank": "Team rating, rank in the field",
    "drv_last3_avg_points_rank": "Points in the last 3 races, rank in the field",
    "team_last2_points_rank": "Car's points in the last 2 races, rank in the field",
    "drv_season_avg_quali_gap_rank": "Season qualifying pace rank",
    "team_season_avg_quali_gap_rank": "Car's season qualifying pace rank",
    "drv_ewm_fastest_lap_rank_rank": "Recent race pace, rank in the field",
    # weekend
    "grid_pos": "Grid position", "quali_gap_pct": "Gap to pole", "quali_position": "Qualifying position",
    "front_row": "Front-row start", "tm_quali_gap": "Gap to teammate in qualifying",
    "grid_penalty": "Grid penalty", "sprint_pos": "Sprint result",
}


def before_target(df):
    """Rows from before the predicted race, so its own result can never reach the prediction."""
    return df[(df.season < TARGET_SEASON) | (df["round"] < TARGET_ROUND)]


def label(feature):
    return FEATURE_LABELS.get(feature, feature.replace("_", " ").capitalize())


def classified(row):
    """Finishing position, or None when the driver wasn't classified (retired, disqualified, ...)."""
    return int(row.position) if str(row.position_text).isdigit() else None


def clean(obj):
    """JSON-safe copy: NaN -> None, numpy scalars -> Python."""
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        return None if math.isnan(obj) else float(obj)
    return obj


def load_inputs():
    raw, proc = ROOT / "data" / "raw", ROOT / "data" / "processed"
    return {
        "results": pd.read_csv(raw / "results.csv"),
        "quali": pd.read_csv(raw / "qualifying.csv"),
        "sprint": pd.read_csv(raw / "sprint.csv"),
        "driver_standings": pd.read_csv(raw / "driver_standings.csv"),
        "constructor_standings": pd.read_csv(raw / "constructor_standings.csv"),
        "features": pd.read_csv(proc / "features.csv"),
        "entry": pd.read_csv(proc / "mexico_2026_entry.csv"),
        "pre_model": joblib.load(ROOT / "models" / "pre_weekend.joblib"),
        "post_model": joblib.load(ROOT / "models" / "post_quali.joblib"),
        "card": json.loads((ROOT / "models" / "model_card.json").read_text()),
    }


# ---- model ------------------------------------------------------------------
def xgb_to_json(booster):
    """Trees as flat node arrays indexed by nodeid (f = -1 marks a leaf)."""
    names = list(booster.feature_names)
    trees = []
    for dump in booster.get_dump(dump_format="json"):
        nodes, stack = {}, [json.loads(dump)]
        while stack:
            n = stack.pop()
            nodes[n["nodeid"]] = n
            stack.extend(n.get("children", []))
        size = max(nodes) + 1
        t = {k: [0] * size for k in "ftynmv"}
        for i, n in nodes.items():
            if "leaf" in n:
                t["f"][i], t["v"][i] = -1, n["leaf"]
            else:
                t["f"][i], t["t"][i] = names.index(n["split"]), n["split_condition"]
                t["y"][i], t["n"][i], t["m"][i] = n["yes"], n["no"], n["missing"]
        trees.append(t)
    cfg = json.loads(booster.save_config())["learner"]["learner_model_param"]
    base_score = float(str(cfg["base_score"]).strip("[]"))
    return {"features": names, "baseScore": base_score, "trees": trees}


# ---- qualifying gaps ---------------------------------------------------------
def typical_gaps(quali, seasons=GAP_SEASONS):
    """Median gap to pole (%) per qualifying position, never decreasing."""
    q = quali[quali.season.isin(seasons)].copy()
    q["gap"] = 100 * (q.best_quali_ms / q.groupby(["season", "round"]).best_quali_ms.transform("min") - 1)
    med = q.groupby("quali_position").gap.median().reindex(range(1, 23)).ffill()
    return med.cummax().round(6).tolist()


def ref_pole_ms(quali):
    """Last year's Mexico pole lap, used to turn typed seconds into %."""
    q = quali[(quali.circuit_id == "rodriguez") & (quali.quali_position == 1)]
    return int(q.sort_values("season").best_quali_ms.iat[-1])


# ---- Mexico entry list -----------------------------------------------------------
def why_factors(pre_model, entry):
    """Top 3 contributions (log-odds) per driver: XGBoost SHAP + logistic-regression terms."""
    X = entry[pre_model.used_features_]
    contrib = np.zeros(X.shape)
    for name, est in pre_model.members.items():
        if name == "XGBoost":
            contrib += est.get_booster().predict(xgb.DMatrix(X), pred_contribs=True)[:, :-1]
        else:
            contrib += est[:-1].transform(X) * est[-1].coef_[0]
    out = []
    for row in contrib:
        top = np.argsort(-np.abs(row))[:3]
        out.append([{"label": label(pre_model.used_features_[i]), "effect": "up" if row[i] > 0 else "down"}
                    for i in top])
    return out


def mexico_payload(inp):
    entry, res, quali = inp["entry"], before_target(inp["results"]), before_target(inp["quali"])
    pre = inp["pre_model"]
    probs = pre.predict(entry)
    members = pre.predict_members(entry)
    why = why_factors(pre, entry)
    names = res.sort_values(["season", "round"]).groupby("driver_id").last()
    season = res[res.season == TARGET_SEASON].sort_values("round")
    mex = res[res.circuit_id == "rodriguez"]
    last_race = res[(res.season == TARGET_SEASON)].sort_values("round").iloc[-1]

    drivers = []
    for i, row in entry.reset_index(drop=True).iterrows():
        d = row.driver_id
        own = season[season.driver_id == d]
        m = mex[mex.driver_id == d]
        drivers.append({
            "id": d, "code": row.driver_code, "name": names.loc[d, "driver_name"],
            "team": row.team, "teamName": names.loc[d, "constructor_name"],
            "colour": TEAM_COLOURS.get(row.team, "#7C8A99"),
            "preProb": probs[i],
            "preMembers": {"xgboost": members["XGBoost"][i], "logreg": members["Logistic regression"][i]},
            "seasonPoints": row.drv_season_pts, "seasonWins": row.drv_season_wins,
            "lastFinishes": [classified(x) for x in own.tail(5).itertuples()],
            "mexico": {"starts": len(m), "wins": int((m.position == 1).sum()),
                       "podiums": int((m.position <= 3).sum()),
                       "best": None if m.position.isna().all() else int(m.position.min())},
            "why": why[i],
            "features": {f: row[f] for f in PRE_WEEKEND},
        })
    return {
        "meta": {"raceName": "Mexico City Grand Prix", "circuit": "Autódromo Hermanos Rodríguez",
                 "season": TARGET_SEASON, "round": TARGET_ROUND,
                 "raceUtc": "2026-11-01T20:00:00Z", "qualiUtc": "2026-10-31T21:00:00Z",
                 "dataThrough": f"{int(last_race.season)} {last_race.race_name}",
                 "refPoleMs": ref_pole_ms(quali), "qualifyingUrl": QUALIFYING_URL, "resultsUrl": RESULTS_URL},
        "typicalGaps": typical_gaps(quali),
        "drivers": drivers,
    }


# ---- seasons ---------------------------------------------------------------------
def season_payload(year, inp):
    r = inp["results"][inp["results"].season == year].copy()
    s = inp["sprint"][inp["sprint"].season == year]
    q = inp["quali"][inp["quali"].season == year]
    pts = r.groupby("driver_id").points.sum().add(s.groupby("driver_id").points.sum(), fill_value=0)  # fallback
    poles = q[q.quali_position == 1].groupby("driver_id").size()
    last = r.sort_values("round").groupby("driver_id").last()

    races = []
    for rnd, g in r.groupby("round"):
        winner = g[g.position == 1].driver_id
        pole = q[(q["round"] == rnd) & (q.quali_position == 1)].driver_id
        races.append({"round": int(rnd), "name": g.race_name.iat[0], "date": g.date.iat[0],
                      "circuitId": g.circuit_id.iat[0],
                      "winner": winner.iat[0] if len(winner) else None,
                      "pole": pole.iat[0] if len(pole) else None})

    drivers = []
    for d, g in r.sort_values("round").groupby("driver_id"):
        team = last.loc[d, "constructor_id"]
        drivers.append({
            "id": d, "code": last.loc[d, "driver_code"], "name": last.loc[d, "driver_name"],
            "team": team, "teamName": last.loc[d, "constructor_name"],
            "colour": TEAM_COLOURS.get(TEAM_LINEAGE.get(team, team), "#7C8A99"),
            "points": float(pts.get(d, 0)), "wins": int((g.position == 1).sum()),
            "podiums": int((g.position <= 3).sum()), "poles": int(poles.get(d, 0)),
            "results": [{"round": int(x["round"]),
                         "pos": classified(x),
                         "grid": None if x.grid == 0 else int(x.grid), "status": x.status}
                        for _, x in g.iterrows()],
        })
    # Official standings (they include points deductions and countback tie-breaks).
    ds = inp["driver_standings"][inp["driver_standings"].season == year].set_index("driver_id")
    for d in drivers:
        if d["id"] in ds.index:
            d["points"], d["wins"] = float(ds.loc[d["id"], "points"]), int(ds.loc[d["id"], "wins"])
    order = {d: i for i, d in enumerate(ds.sort_values("position", na_position="last").index)}
    drivers.sort(key=lambda d: (order.get(d["id"], len(order)), -d["points"]))

    cs = inp["constructor_standings"][inp["constructor_standings"].season == year].sort_values("position", na_position="last")
    constructors = [{"team": c.constructor_id, "name": c.constructor_name,
                     "colour": TEAM_COLOURS.get(TEAM_LINEAGE.get(c.constructor_id, c.constructor_id), "#7C8A99"),
                     "points": float(c.points), "wins": int(c.wins)} for c in cs.itertuples()]
    return {"season": year, "races": races, "drivers": drivers, "constructors": constructors}


# ---- model card --------------------------------------------------------------------
def rule_hits(features, col, higher_is_better, seasons):
    """Top-1 / top-3 hit rates of 'back whoever is best on `col`' per season.

    Ties are split evenly (a k-way tie at the top earns 1/k of a hit), never
    broken by row order: rows are stored in finishing order, so that would
    hand the rule the winner (e.g. everyone on 0 points at Round 1).
    """
    d = features[features.season.isin(seasons) & features.win.notna()].copy()
    d["score"] = (d[col] if higher_is_better else -d[col])
    d["score"] = d.score.fillna(d.score.min() - 1)
    hits = {}
    for season, g in d.groupby("season"):
        top1 = top3 = 0.0
        races = g.groupby("race_key")
        for _, race in races:
            w = race.loc[race.win == 1, "score"].iat[0]
            ahead, tied = int((race.score > w).sum()), int((race.score == w).sum())
            top1 += (ahead == 0) / tied
            top3 += max(0, min(3, ahead + tied) - ahead) / tied
        hits[int(season)] = {"top1": top1 / races.ngroups, "top3": top3 / races.ngroups}
    return hits


def read_optional(path):
    return pd.read_csv(path).to_dict("records") if path.exists() else []


def model_card_payload(inp):
    card, feats = inp["card"], before_target(inp["features"])

    def rows(df, key):
        return [{key: int(x[key]), "race": x.race, "favourite": x.favourite, "favProb": x.fav_prob,
                 "winner": x.winner, "winnerProb": x.winner_prob, "winnerRank": int(x.winner_rank)}
                for _, x in df.iterrows()]

    def backtest(name):
        return rows(pd.read_csv(PRED / name), "round")

    mexico_path = PRED / "mexico_backtest.csv"
    mexico = rows(pd.read_csv(mexico_path), "season") if mexico_path.exists() else []

    imp = pd.read_csv(PRED / "feature_importance.csv")
    importance = {mode: [{"feature": f, "label": label(f), "value": v}
                         for f, v in imp.sort_values(mode, ascending=False)[["feature", mode]].head(10).to_numpy()]
                  for mode in ["pre_weekend", "post_quali"]}
    return {
        "chosen": card["chosen"], "test": card["test"],
        "backtest2026": {"pre": backtest("backtest_2026_pre_weekend.csv"),
                         "post": backtest("backtest_2026_post_quali.csv")},
        "mexicoBacktest": mexico,
        "rules": {"championshipLeader": rule_hits(feats, "drv_season_pts", True, (2025, 2026)),
                  "poleSitter": rule_hits(feats, "grid_pos", False, (2025, 2026))},
        "importance": importance,
        "gridValue": read_optional(PRED / "grid_value.csv"),
    }


# ---- parity fixture ------------------------------------------------------------------
def parity_fixture(inp, n_cases=300, n_rows=50, seed=0):
    rng = np.random.default_rng(seed)
    model, entry = inp["post_model"], inp["entry"]
    booster = model.members["XGBoost"].get_booster()

    X = inp["features"][model.used_features_].dropna(subset=["grid_pos"]).sample(n_rows, random_state=seed)
    X = X.mask(rng.random(X.shape) < 0.1)
    p = booster.predict(xgb.DMatrix(X))
    rows = [{"x": list(x), "p": float(pi)} for x, pi in zip(X.to_numpy(), p)]

    gaps = np.array(typical_gaps(before_target(inp["quali"])))
    cases = []
    for _ in range(n_cases):
        qp = pd.Series(rng.permutation(22) + 1)
        gap = pd.Series(gaps[qp - 1] + rng.uniform(-0.15, 0.15, 22)).mask(rng.random(22) < 0.1)
        pen = pd.Series(np.where(rng.random(22) < 0.1, rng.choice([3, 5, 10], 22), 0))
        grid = pd.DataFrame({"driver_id": entry.driver_id, "quali_position": qp, "gap_pct": gap,
                             "grid_slot": apply_penalties(qp, pen)})
        probs = predict_grid(model, entry, grid)
        cases.append({"grid": [{"driverId": d, "qualiPosition": int(q), "gapPct": g, "penalty": int(pn)}
                               for d, q, g, pn in zip(entry.driver_id, qp, gap, pen)],
                      "probs": probs.to_dict()})
    return {"rows": rows, "cases": cases}


def write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean(payload), separators=(",", ":"), ensure_ascii=False))


def main():
    inp = load_inputs()
    write(DATA_OUT / "post_quali_model.json", xgb_to_json(inp["post_model"].members["XGBoost"].get_booster()))
    write(DATA_OUT / "mexico_2026.json", mexico_payload(inp))
    for year in STATS_SEASONS:
        write(DATA_OUT / "seasons" / f"{year}.json", season_payload(year, inp))
    write(DATA_OUT / "model_card.json", model_card_payload(inp))
    write(FIXTURE_OUT / "parity.json", parity_fixture(inp))
    for f in sorted(DATA_OUT.rglob("*.json")) + [FIXTURE_OUT / "parity.json"]:
        print(f"{f.relative_to(ROOT)}  {f.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
