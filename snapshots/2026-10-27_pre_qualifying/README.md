# Snapshot: before qualifying (27 Oct 2026)

A frozen copy of the project state **before Mexico City GP qualifying** (Sat 31 Oct 2026), kept as the baseline for comparing the post-qualifying predictions.

- Data through the 2026 United States GP (Round 18); no Mexico qualifying data.
- Files are read-only. They are a record, not a working copy: the notebook's paths point at the project root, so re-run the root notebook instead of this one.

| File | What it is |
|---|---|
| `mexico_gp_modeling_pre_quali.ipynb` | Executed modelling notebook with all outputs |
| `models/pre_weekend.joblib` | XGBoost + logistic regression, before-the-weekend model |
| `models/post_quali.joblib` | XGBoost, post-qualifying model (to be used once qualifying is in) |
| `models/model_card.json` | Chosen settings, validation and test scores |
| `predictions/mexico_2026_pre_weekend.csv` | Mexico 2026 win probabilities before the weekend |
| `predictions/backtest_*.csv`, `feature_importance.csv` | Backtest and importance results |
| `data/features.csv`, `data/mexico_2026_entry.csv` | Feature table and entry list the predictions came from |

**Mexico 2026, before the weekend:** Antonelli 40.2%, Verstappen 21.6%, Leclerc 11.1%, Hamilton 9.0%, Hadjar 5.1%.

Load a model from the project root with `src/` on `sys.path` (it uses `race_models.RaceWinModel`):

```python
import sys, joblib, pandas as pd
sys.path.insert(0, "src")
snap = "snapshots/2026-10-27_pre_qualifying"
model = joblib.load(f"{snap}/models/pre_weekend.joblib")
entry = pd.read_csv(f"{snap}/data/mexico_2026_entry.csv")
probs = model.predict(entry)
```
