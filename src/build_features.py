"""Build a driver-x-race feature table for predicting race winners.

Every feature uses only information available *before* the race it describes:
rolling stats are shifted by one race, season totals stop at the previous
weekend, and the "weekend" block (grid, qualifying, same-weekend sprint) is
kept separate so the model can be trained in a pre-qualifying or
post-qualifying mode.

Rows for the upcoming race (TARGET_*) are appended with empty outcomes, so
their features come out of the same pipeline as the training rows.

Usage:  .venv/bin/python src/build_features.py
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"

TARGET_SEASON, TARGET_ROUND, TARGET_CIRCUIT = 2026, 19, "rodriguez"
NEW_REG_SEASONS = {2014, 2017, 2022, 2026}
# Circuits above ~650 m, where thin air hurts cooling, downforce and PU output.
HIGH_ALTITUDE = {"rodriguez", "interlagos", "red_bull_ring"}
DNF_CODES = {"R", "W", "D", "N", "E", "F"}
# Keep one history per factory through rebrands.
TEAM_LINEAGE = {
    "toro_rosso": "rb", "alphatauri": "rb",
    "force_india": "aston_martin", "racing_point": "aston_martin",
    "sauber": "audi", "alfa": "audi",
    "lotus_f1": "alpine", "renault": "alpine",
    "marussia": "manor",
}
EWM_HALFLIFE = 3  # races


def load():
    res = pd.read_csv(RAW / "results.csv", parse_dates=["date", "driver_dob"])
    quali = pd.read_csv(RAW / "qualifying.csv", parse_dates=["driver_dob"])
    sprint = pd.read_csv(RAW / "sprint.csv")
    sched = pd.read_csv(RAW / "schedule.csv", parse_dates=["date"])
    return res, quali, sprint, sched


def add_target_rows(res, quali, sched):
    """Append the upcoming race with empty outcomes.

    Before qualifying, the latest race's entrants are the entry list. Once
    qualifying is published, its entrants are used and the grid is taken
    from the qualifying order (the official grid only arrives with the race
    result). Known grid penalties can be set in data/grid_overrides.csv
    (columns: driver_code, grid).
    """
    if ((res.season == TARGET_SEASON) & (res["round"] == TARGET_ROUND)).any():
        return res
    meta = sched[(sched.season == TARGET_SEASON) & (sched["round"] == TARGET_ROUND)].iloc[0]
    cols = ["driver_id", "driver_code", "driver_dob", "constructor_id"]
    q = quali[(quali.season == TARGET_SEASON) & (quali["round"] == TARGET_ROUND)]
    if len(q):
        future = q[cols].copy()
        future["grid"] = q.quali_position.to_numpy()
        overrides = ROOT / "data" / "grid_overrides.csv"
        if overrides.exists():
            grid = pd.read_csv(overrides).set_index("driver_code").grid
            future["grid"] = future.driver_code.map(grid).fillna(future.grid)
    else:
        future = res.loc[res.date == res.date.max(), cols].copy()
    for col in ["season", "round", "race_name", "date", "circuit_id", "country"]:
        future[col] = meta[col]
    return pd.concat([res, future], ignore_index=True)


def shifted_ewm(df, by, col):
    return df.groupby(by)[col].transform(lambda s: s.shift(1).ewm(halflife=EWM_HALFLIFE).mean())


def shifted_rolling_mean(df, by, col, window):
    return df.groupby(by)[col].transform(lambda s: s.shift(1).rolling(window, min_periods=1).mean())


def season_cumulative_before(df, by, col):
    """Sum of `col` over earlier races in the same season."""
    return df.groupby(by + ["season"])[col].transform(lambda s: s.shift(1).fillna(0).cumsum())


def season_expanding_mean(df, by, col):
    """Mean of `col` over earlier races in the same season (resets every year)."""
    return df.groupby(by + ["season"])[col].transform(lambda s: s.shift(1).expanding().mean())


def rank_within_race(df, col, ascending):
    return df.groupby("race_key")[col].rank(ascending=ascending, method="min")


def elo_ratings(df, key, k=8.0, season_regress=0.3, reg_change_regress=0.6):
    """Multi-competitor Elo from pairwise finishing order; returns pre-race rating.

    Ratings shrink toward 1500 between seasons, harder in rule-change years.
    """
    ratings, last_season, pre = {}, None, np.full(len(df), np.nan)
    for race_key, idx in df.groupby("race_key", sort=False).indices.items():
        season = df.season.iat[idx[0]]
        if season != last_season and last_season is not None:
            shrink = reg_change_regress if season in NEW_REG_SEASONS else season_regress
            ratings = {d: 1500 + (r - 1500) * (1 - shrink) for d, r in ratings.items()}
        last_season = season
        ids = df[key].iloc[idx].to_numpy()
        pre[idx] = [ratings.get(d, 1500.0) for d in ids]
        pos = df.finish_pos_form.iloc[idx].to_numpy()
        if np.isnan(pos).all():  # upcoming race: no outcome yet
            continue
        # Team Elo: best car of each team counts once.
        order = pd.Series(pos, index=ids).groupby(level=0).min()
        r = np.array([ratings.get(d, 1500.0) for d in order.index])
        expected = 1 / (1 + 10 ** ((r[None, :] - r[:, None]) / 400))
        actual = (order.values[:, None] < order.values[None, :]).astype(float)
        actual[order.values[:, None] == order.values[None, :]] = 0.5
        np.fill_diagonal(expected, 0)
        np.fill_diagonal(actual, 0)
        delta = k * (actual - expected).sum(axis=1)
        for d, dv in zip(order.index, delta):
            ratings[d] = ratings.get(d, 1500.0) + dv
    return pre


def build():
    res, quali, sprint, sched = load()
    res = add_target_rows(res, quali, sched)
    df = res.copy()
    df["team"] = df.constructor_id.replace(TEAM_LINEAGE)
    df = df.sort_values(["date", "position"], na_position="last").reset_index(drop=True)
    df["race_key"] = df.season.astype(str) + "_" + df["round"].astype(str).str.zfill(2)
    df["field_size"] = df.groupby("race_key").driver_id.transform("size")
    is_future = df.position_text.isna()

    # ---- targets & outcome helpers ------------------------------------
    df["dnf"] = df.position_text.isin(DNF_CODES).astype(float).where(~is_future)
    df["finish_pos_form"] = np.where(df.dnf == 1, df.field_size, df.position)
    df["finish_pos_form"] = df.finish_pos_form.where(~is_future)
    df["win"] = (df.position == 1).astype(float).where(~is_future)
    df["podium"] = (df.position <= 3).astype(float).where(~is_future)

    # Sprint points count toward the championship; split them into
    # "previous weekends" (season totals) and "this weekend" (weekend block).
    sp = sprint[["season", "round", "driver_id", "points", "position", "grid"]].rename(
        columns={"points": "sprint_pts", "position": "sprint_pos", "grid": "sprint_grid"})
    df = df.merge(sp, on=["season", "round", "driver_id"], how="left")
    df["is_sprint_weekend"] = df.groupby("race_key").sprint_pts.transform("count").gt(0).astype(int)
    df["weekend_pts"] = df.points.fillna(0) + df.sprint_pts.fillna(0)
    df.loc[is_future, "weekend_pts"] = np.nan

    # ---- qualifying pace ----------------------------------------------
    q = quali[["season", "round", "driver_id", "quali_position", "best_quali_ms"]].copy()
    q["quali_gap_pct"] = 100 * (q.best_quali_ms / q.groupby(["season", "round"]).best_quali_ms.transform("min") - 1)
    q["quali_gap_pct"] = q.quali_gap_pct.clip(upper=7)  # wet sessions / no-time laps
    df = df.merge(q.drop(columns="best_quali_ms"), on=["season", "round", "driver_id"], how="left")
    df["team_best_quali_gap"] = df.groupby(["race_key", "team"]).quali_gap_pct.transform("min")
    team_sum = df.groupby(["race_key", "team"]).quali_gap_pct.transform("sum")
    team_n = df.groupby(["race_key", "team"]).quali_gap_pct.transform("count")
    df["tm_quali_gap"] = np.where(team_n == 2, df.quali_gap_pct - (team_sum - df.quali_gap_pct), np.nan)
    df["beat_tm_quali"] = (df.tm_quali_gap < 0).astype(float).where(df.tm_quali_gap.notna())
    df["grid_pos"] = df.grid.replace(0, np.nan).fillna(df.field_size + 1)  # 0 = pit lane
    df.loc[df.grid.isna(), "grid_pos"] = np.nan
    df["positions_gained"] = (df.grid_pos - df.position).where(df.dnf == 0)

    # ---- A. driver form -------------------------------------------------
    drv = "driver_id"
    df["drv_ewm_finish"] = shifted_ewm(df, drv, "finish_pos_form")
    df["drv_ewm_points"] = shifted_ewm(df, drv, "weekend_pts")
    df["drv_last_finish"] = df.groupby(drv).finish_pos_form.shift(1)
    df["drv_ewm_quali_pos"] = shifted_ewm(df, drv, "quali_position")
    df["drv_ewm_quali_gap"] = shifted_ewm(df, drv, "quali_gap_pct")
    df["drv_dnf_rate_10"] = shifted_rolling_mean(df, drv, "dnf", 10)
    df["drv_season_pts"] = season_cumulative_before(df, [drv], "weekend_pts")
    df["drv_season_wins"] = season_cumulative_before(df, [drv], "win")
    df["drv_season_podiums"] = season_cumulative_before(df, [drv], "podium")
    df["drv_season_tm_h2h"] = df.groupby([drv, "season"]).beat_tm_quali.transform(
        lambda s: s.shift(1).expanding().mean())
    leader = df.groupby("race_key").drv_season_pts.transform("max")
    df["drv_season_pts_share"] = np.where(leader > 0, df.drv_season_pts / leader, np.nan)
    df["drv_season_rank"] = rank_within_race(df, "drv_season_pts", ascending=False)

    # ---- A2. momentum & season-only form --------------------------------
    # Short windows catch swings like Red Bull's late-2026 surge; season-only
    # stats reset every year, which matters most after a rule change.
    df["drv_last2_avg_finish"] = shifted_rolling_mean(df, drv, "finish_pos_form", 2)
    df["drv_last3_avg_points"] = shifted_rolling_mean(df, drv, "weekend_pts", 3)
    df["drv_last3_avg_quali_pos"] = shifted_rolling_mean(df, drv, "quali_position", 3)
    df["drv_wins_last5"] = df.groupby(drv).win.transform(lambda s: s.shift(1).rolling(5, min_periods=1).sum())
    df["drv_season_avg_finish"] = season_expanding_mean(df, [drv], "finish_pos_form")
    df["drv_season_avg_quali_gap"] = season_expanding_mean(df, [drv], "quali_gap_pct")
    df["drv_season_win_rate"] = season_expanding_mean(df, [drv], "win")
    df["drv_form_trend"] = df.drv_season_avg_finish - df.drv_last2_avg_finish  # > 0 = improving
    # Race pace (not just one-lap pace) and racecraft.
    df["drv_ewm_fastest_lap_rank"] = shifted_ewm(df, drv, "fastest_lap_rank")
    df["drv_ewm_positions_gained"] = shifted_ewm(df, drv, "positions_gained")

    # ---- career -----------------------------------------------------------
    df["drv_starts"] = df.groupby(drv).cumcount()
    df["drv_career_wins"] = df.groupby(drv).win.transform(lambda s: s.shift(1).fillna(0).cumsum())
    df["drv_career_win_rate"] = df.drv_career_wins / df.drv_starts.replace(0, np.nan)
    df["drv_age"] = (df.date - df.driver_dob).dt.days / 365.25

    # ---- team form (one row per team-race, then broadcast back) -----------
    t = df.groupby(["race_key", "season", "team"], sort=False).agg(
        circuit_id=("circuit_id", "first"),
        team_pts=("weekend_pts", lambda s: s.sum(min_count=1)),
        team_best_finish=("finish_pos_form", "min"),
        team_dnf=("dnf", "mean"),
        team_best_quali=("team_best_quali_gap", "first"),
    ).reset_index()
    t["team_ewm_points"] = shifted_ewm(t, "team", "team_pts")
    t["team_ewm_best_finish"] = shifted_ewm(t, "team", "team_best_finish")
    t["team_ewm_quali_gap"] = shifted_ewm(t, "team", "team_best_quali")
    t["team_dnf_rate_10"] = shifted_rolling_mean(t, "team", "team_dnf", 10)
    t["team_season_pts"] = season_cumulative_before(t.assign(team_pts=t.team_pts.fillna(0)), ["team"], "team_pts")
    t["team_season_rank"] = t.groupby("race_key").team_season_pts.rank(ascending=False, method="min")
    t["team_last2_points"] = shifted_rolling_mean(t, "team", "team_pts", 2)
    t["team_last2_best_finish"] = shifted_rolling_mean(t, "team", "team_best_finish", 2)
    t["team_last3_quali_gap"] = shifted_rolling_mean(t, "team", "team_best_quali", 3)
    t["team_season_avg_points"] = season_expanding_mean(t, ["team"], "team_pts")
    t["team_season_avg_quali_gap"] = season_expanding_mean(t, ["team"], "team_best_quali")
    t["team_form_trend"] = t.team_last2_points - t.team_season_avg_points  # > 0 = surging
    # Best finish over the team's last 3 visits here. Computed per team-race so a
    # car never sees its teammate's result from the same race.
    t["team_circuit_best_finish"] = t.groupby(["team", "circuit_id"]).team_best_finish.transform(
        lambda s: s.shift(1).rolling(3, min_periods=1).min())
    # Last year's constructors' rank: strong in stable years, weak after a rule reset.
    final = t.groupby(["season", "team"]).team_pts.sum().reset_index()
    final["rank"] = final.groupby("season").team_pts.rank(ascending=False, method="min")
    prev = dict(zip(zip(final.season + 1, final.team), final["rank"]))
    t["team_prev_season_rank"] = [prev.get(k, 12.0) for k in zip(t.season, t.team)]  # new team = last
    team_cols = ["team_ewm_points", "team_ewm_best_finish", "team_ewm_quali_gap",
                 "team_dnf_rate_10", "team_season_pts", "team_season_rank", "team_last2_points",
                 "team_last2_best_finish", "team_last3_quali_gap", "team_season_avg_points",
                 "team_season_avg_quali_gap", "team_form_trend", "team_prev_season_rank",
                 "team_circuit_best_finish"]
    df = df.merge(t[["race_key", "team"] + team_cols], on=["race_key", "team"], how="left")
    df["drv_team_pts_share"] = np.where(df.team_season_pts > 0, df.drv_season_pts / df.team_season_pts, np.nan)

    # ---- Elo ratings --------------------------------------------------------
    df["drv_elo"] = elo_ratings(df, "driver_id")
    df["team_elo"] = elo_ratings(df, "team", k=10.0)

    # ---- B. circuit history ---------------------------------------------------
    by_circ = [drv, "circuit_id"]
    df["drv_circuit_starts"] = df.groupby(by_circ).cumcount()
    df["drv_circuit_wins"] = df.groupby(by_circ).win.transform(lambda s: s.shift(1).fillna(0).cumsum())
    df["drv_circuit_podiums"] = df.groupby(by_circ).podium.transform(lambda s: s.shift(1).fillna(0).cumsum())
    circ_sum = df.groupby(by_circ).finish_pos_form.transform(lambda s: s.shift(1).fillna(0).cumsum())
    circ_n = df.groupby(by_circ).finish_pos_form.transform(lambda s: s.shift(1).notna().cumsum())
    career_avg = df.groupby(drv).finish_pos_form.transform(lambda s: s.shift(1).expanding().mean()).fillna(12)
    k = 2  # shrink sparse circuit records toward the driver's career average
    df["drv_circuit_avg_finish"] = (circ_sum + k * career_avg) / (circ_n + k)
    df["is_high_altitude"] = df.circuit_id.isin(HIGH_ALTITUDE).astype(int)
    alt = df.finish_pos_form.where(df.is_high_altitude == 1)
    df["drv_altitude_avg_finish"] = df.assign(_a=alt).groupby(drv)._a.transform(
        lambda s: s.shift(1).rolling(30, min_periods=1).mean())
    # Race-level circuit character from earlier visits: does pole convert, how
    # far back do winners start, how much does the order shuffle (overtaking).
    races = df.groupby("race_key", sort=False).agg(circuit_id=("circuit_id", "first"),
                                                     season=("season", "first"))
    races["pole_won"] = df[df.grid == 1].groupby("race_key").win.first()
    races["winner_grid"] = df[df.win == 1].groupby("race_key").grid_pos.first()
    races["abs_pos_change"] = df.assign(c=(df.grid_pos - df.position).abs().where(df.dnf == 0)) \
        .groupby("race_key").c.mean()
    circuit_cols = {"pole_won": "circuit_pole_win_rate", "winner_grid": "circuit_winner_avg_grid",
                    "abs_pos_change": "circuit_overtaking"}
    for src, name in circuit_cols.items():
        races[name] = races.groupby("circuit_id")[src].transform(lambda s: s.shift(1).expanding().mean())

    # ---- C. context ------------------------------------------------------------
    df["new_regs_season"] = df.season.isin(NEW_REG_SEASONS).astype(int)
    total_rounds = sched.groupby("season")["round"].max()
    df["season_progress"] = df["round"] / df.season.map(total_rounds)
    era = races.season.map(lambda s: max(y for y in NEW_REG_SEASONS if y <= s))
    races["races_into_era"] = races.groupby(era).cumcount()
    df = df.merge(races[list(circuit_cols.values()) + ["races_into_era"]],
                  left_on="race_key", right_index=True, how="left")

    # ---- D. weekend (only known after qualifying / sprint) ----------------------
    df["front_row"] = (df.grid_pos <= 2).astype(float).where(df.grid_pos.notna())
    df["grid_penalty"] = (df.grid_pos - df.quali_position).clip(lower=0)
    # tm_quali_gap / quali_position / quali_gap_pct / sprint_pos already present

    # ---- E. relative-to-field ranks (winning is relative) -----------------------
    for col, asc in [("drv_ewm_finish", True), ("drv_ewm_points", False), ("drv_ewm_quali_gap", True),
                     ("team_ewm_points", False), ("team_ewm_quali_gap", True), ("drv_elo", False),
                     ("team_elo", False), ("drv_last3_avg_points", False), ("team_last2_points", False),
                     ("drv_season_avg_quali_gap", True), ("team_season_avg_quali_gap", True),
                     ("drv_ewm_fastest_lap_rank", True)]:
        df[f"{col}_rank"] = rank_within_race(df, col, ascending=asc)
    df["drv_elo_gap_to_best"] = df.drv_elo - df.groupby("race_key").drv_elo.transform("max")
    df["team_elo_gap_to_best"] = df.team_elo - df.groupby("race_key").team_elo.transform("max")

    return df


PRE_WEEKEND = [
    "drv_ewm_finish", "drv_ewm_points", "drv_last_finish", "drv_ewm_quali_pos", "drv_ewm_quali_gap",
    "drv_dnf_rate_10", "drv_season_pts", "drv_season_wins", "drv_season_podiums", "drv_season_tm_h2h",
    "drv_season_pts_share", "drv_season_rank", "drv_starts", "drv_career_wins", "drv_career_win_rate",
    "drv_age", "team_ewm_points", "team_ewm_best_finish", "team_ewm_quali_gap", "team_dnf_rate_10",
    "team_season_pts", "team_season_rank", "drv_elo", "team_elo", "drv_elo_gap_to_best",
    "team_elo_gap_to_best", "drv_circuit_starts", "drv_circuit_wins", "drv_circuit_podiums",
    "drv_circuit_avg_finish", "team_circuit_best_finish", "is_high_altitude", "drv_altitude_avg_finish",
    "circuit_pole_win_rate", "circuit_winner_avg_grid", "circuit_overtaking",
    "new_regs_season", "season_progress", "races_into_era", "is_sprint_weekend",
    # momentum & season-only
    "drv_last2_avg_finish", "drv_last3_avg_points", "drv_last3_avg_quali_pos", "drv_wins_last5",
    "drv_season_avg_finish", "drv_season_avg_quali_gap", "drv_season_win_rate", "drv_form_trend",
    "drv_ewm_fastest_lap_rank", "drv_ewm_positions_gained", "drv_team_pts_share",
    "team_last2_points", "team_last2_best_finish", "team_last3_quali_gap", "team_season_avg_points",
    "team_season_avg_quali_gap", "team_form_trend", "team_prev_season_rank",
    # relative to field
    "drv_ewm_finish_rank", "drv_ewm_points_rank", "drv_ewm_quali_gap_rank", "team_ewm_points_rank",
    "team_ewm_quali_gap_rank", "drv_elo_rank", "team_elo_rank", "drv_last3_avg_points_rank",
    "team_last2_points_rank", "drv_season_avg_quali_gap_rank", "team_season_avg_quali_gap_rank",
    "drv_ewm_fastest_lap_rank_rank",
]
WEEKEND = ["grid_pos", "front_row", "quali_position", "quali_gap_pct", "tm_quali_gap", "grid_penalty",
           "sprint_pos"]
ID_COLS = ["race_key", "season", "round", "date", "race_name", "circuit_id", "driver_id",
           "driver_code", "constructor_id", "team"]
TARGETS = ["win", "podium", "position", "finish_pos_form", "dnf"]


def main():
    df = build()
    cols = ID_COLS + TARGETS + PRE_WEEKEND + WEEKEND
    OUT.mkdir(parents=True, exist_ok=True)
    df[cols].to_csv(OUT / "features.csv", index=False)
    target = df[(df.season == TARGET_SEASON) & (df["round"] == TARGET_ROUND)]
    target[cols].to_csv(OUT / "mexico_2026_entry.csv", index=False)
    print(f"features.csv: {len(df)} rows x {len(cols)} cols "
          f"({len(PRE_WEEKEND)} pre-weekend + {len(WEEKEND)} weekend features)")
    print(f"mexico_2026_entry.csv: {len(target)} drivers")


if __name__ == "__main__":
    main()
