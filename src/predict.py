"""Predict the upcoming race with a saved model.

Usage:
    .venv/bin/python src/predict.py post_quali --refresh   # after qualifying
    .venv/bin/python src/predict.py pre_weekend

--refresh downloads the latest results/qualifying and rebuilds the features
first. The models themselves are not retrained: qualifying adds no new race
results, only this weekend's grid and pace.
"""
import argparse
import sys
from pathlib import Path

import joblib
import pandas as pd

import build_features
import fetch_data

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "data" / "processed" / "mexico_2026_entry.csv"
PRED_DIR = ROOT / "data" / "predictions"


def refresh():
    fetch_data.main(2014, build_features.TARGET_SEASON)
    build_features.main()


def predict(mode):
    entry = pd.read_csv(ENTRY)
    if mode == "post_quali" and entry.quali_position.isna().all():
        sys.exit("No qualifying results for this race yet. Try again later, or use pre_weekend.")

    model = joblib.load(ROOT / "models" / f"{mode}.joblib")
    members = {f"p_{name}": p for name, p in model.predict_members(entry).items()}
    table = (entry[["driver_code", "driver_id", "team", "quali_position", "grid_pos"]]
             .assign(win_prob=model.predict(entry), **members)
             .sort_values("win_prob", ascending=False)
             .reset_index(drop=True))
    table.index += 1

    out = PRED_DIR / f"mexico_2026_{mode}.csv"
    table.to_csv(out, index_label="rank")
    return table, out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=["pre_weekend", "post_quali"])
    parser.add_argument("--refresh", action="store_true", help="re-download data and rebuild features first")
    args = parser.parse_args()

    if args.refresh:
        refresh()
    table, out = predict(args.mode)
    shown = table.head(10).assign(win_prob=(100 * table.win_prob.head(10)).round(1).astype(str) + "%")
    print(shown[["driver_code", "team", "quali_position", "grid_pos", "win_prob"]].to_string())
    print(f"\nSaved {out.relative_to(ROOT)}")
