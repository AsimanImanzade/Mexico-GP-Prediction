"""Download race, qualifying and sprint results from the Jolpica (Ergast) F1 API.

Writes one tidy CSV per table to data/raw/. Raw JSON pages are cached so
re-runs only fetch what is missing (the API allows ~4 req/s, 500 req/hour).

Usage:  .venv/bin/python src/fetch_data.py [first_season] [last_season]
"""
import json
import sys
import time
from pathlib import Path

import pandas as pd
import requests

BASE = "https://api.jolpi.ca/ergast/f1"
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "raw" / "json"
OUT = ROOT / "data" / "raw"
PAGE = 100


def get(url, cache_file, final):
    """GET with on-disk cache. Seasons still in progress are re-fetched."""
    if final and cache_file.exists():
        return json.loads(cache_file.read_text())
    for attempt in range(6):
        r = requests.get(url, timeout=30)
        if r.status_code == 429:
            time.sleep(5 * (attempt + 1))
            continue
        r.raise_for_status()
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(r.text)
        time.sleep(0.3)
        return r.json()
    raise RuntimeError(f"rate-limited too often: {url}")


def fetch_all(season, endpoint, final):
    """Return the list of Race objects for a season/endpoint, merging pages."""
    races, offset = {}, 0
    while True:
        url = f"{BASE}/{season}/{endpoint}.json?limit={PAGE}&offset={offset}"
        data = get(url, CACHE / f"{season}_{endpoint}_{offset}.json", final)["MRData"]
        key = next(k for k in data if k.endswith("Table"))
        for race in data[key]["Races"]:
            rnd = int(race["round"])
            if rnd in races:  # a race split across two pages
                for k, v in race.items():
                    if isinstance(v, list):
                        races[rnd][k].extend(v)
            else:
                races[rnd] = race
        offset += PAGE
        if offset >= int(data["total"]):
            return [races[k] for k in sorted(races)]


def race_meta(race):
    return {
        "season": int(race["season"]),
        "round": int(race["round"]),
        "race_name": race["raceName"],
        "date": race["date"],
        "circuit_id": race["Circuit"]["circuitId"],
        "country": race["Circuit"]["Location"]["country"],
    }


def to_float(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def flatten_results(races, list_key):
    rows = []
    for race in races:
        meta = race_meta(race)
        for r in race.get(list_key, []):
            rows.append({
                **meta,
                "driver_id": r["Driver"]["driverId"],
                "driver_code": r["Driver"].get("code"),
                "driver_name": f'{r["Driver"]["givenName"]} {r["Driver"]["familyName"]}',
                "driver_dob": r["Driver"].get("dateOfBirth"),
                "constructor_id": r["Constructor"]["constructorId"],
                "constructor_name": r["Constructor"]["name"],
                "grid": int(r["grid"]),
                "position": to_float(r.get("position")),
                "position_text": r["positionText"],
                "points": float(r["points"]),
                "laps": int(r["laps"]),
                "status": r["status"],
                "time_ms": to_float(r.get("Time", {}).get("millis")),
                "fastest_lap_rank": to_float(r.get("FastestLap", {}).get("rank")),
            })
    return pd.DataFrame(rows)


def lap_ms(t):
    """'1:15.672' -> 75672.0"""
    if not t:
        return None
    m, s = t.split(":") if ":" in t else ("0", t)
    return (int(m) * 60 + float(s)) * 1000


def flatten_qualifying(races):
    rows = []
    for race in races:
        meta = race_meta(race)
        for r in race.get("QualifyingResults", []):
            q = [lap_ms(r.get(k)) for k in ("Q1", "Q2", "Q3")]
            rows.append({
                **meta,
                "driver_id": r["Driver"]["driverId"],
                "driver_code": r["Driver"].get("code"),
                "driver_dob": r["Driver"].get("dateOfBirth"),
                "constructor_id": r["Constructor"]["constructorId"],
                "quali_position": int(r["position"]),
                "q1_ms": q[0], "q2_ms": q[1], "q3_ms": q[2],
                "best_quali_ms": min([x for x in q if x] or [None]) if any(q) else None,
            })
    return pd.DataFrame(rows)


def fetch_standings(season, final):
    """Official end-of-season (or latest) standings, including points deductions."""
    tables = {}
    for kind in ("driverStandings", "constructorStandings"):
        data = get(f"{BASE}/{season}/{kind}.json?limit=100", CACHE / f"{season}_{kind}.json", final)
        lists = data["MRData"]["StandingsTable"]["StandingsLists"]
        tables[kind] = lists[0][kind[0].upper() + kind[1:]] if lists else []
    drivers = [{"season": season, "position": to_float(s.get("position")), "driver_id": s["Driver"]["driverId"],
                "points": float(s["points"]), "wins": int(s["wins"])} for s in tables["driverStandings"]]
    teams = [{"season": season, "position": to_float(s.get("position")),
              "constructor_id": s["Constructor"]["constructorId"], "constructor_name": s["Constructor"]["name"],
              "points": float(s["points"]), "wins": int(s["wins"])} for s in tables["constructorStandings"]]
    return pd.DataFrame(drivers), pd.DataFrame(teams)


def main(first, last):
    current = pd.Timestamp.today().year
    results, quali, sprint, schedule = [], [], [], []
    driver_standings, constructor_standings = [], []
    for season in range(first, last + 1):
        final = season < current
        sched = get(f"{BASE}/{season}/races.json?limit=100",
                    CACHE / f"{season}_races.json", final)
        schedule += [race_meta(r) for r in sched["MRData"]["RaceTable"]["Races"]]
        results.append(flatten_results(fetch_all(season, "results", final), "Results"))
        quali.append(flatten_qualifying(fetch_all(season, "qualifying", final)))
        if season >= 2021:  # sprints started in 2021
            sprint.append(flatten_results(fetch_all(season, "sprint", final), "SprintResults"))
        ds, cs = fetch_standings(season, final)
        driver_standings.append(ds)
        constructor_standings.append(cs)
        print(f"{season}: {len(results[-1])} result rows")

    pd.DataFrame(schedule).to_csv(OUT / "schedule.csv", index=False)
    pd.concat(results).to_csv(OUT / "results.csv", index=False)
    pd.concat(quali).to_csv(OUT / "qualifying.csv", index=False)
    pd.concat(sprint).to_csv(OUT / "sprint.csv", index=False)
    pd.concat(driver_standings).to_csv(OUT / "driver_standings.csv", index=False)
    pd.concat(constructor_standings).to_csv(OUT / "constructor_standings.csv", index=False)


if __name__ == "__main__":
    args = [int(a) for a in sys.argv[1:]]
    main(args[0] if args else 2014, args[1] if len(args) > 1 else pd.Timestamp.today().year)
