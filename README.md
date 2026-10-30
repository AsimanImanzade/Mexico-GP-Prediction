# Mexico City GP Winner Prediction

![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white) ![scikit-learn](https://img.shields.io/badge/scikit--learn-F7931E?style=flat-square&logo=scikitlearn&logoColor=white) ![pandas](https://img.shields.io/badge/pandas-150458?style=flat-square&logo=pandas&logoColor=white) ![XGBoost](https://img.shields.io/badge/XGBoost-2C728E?style=flat-square) ![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)

Predicts the winner of the 2026 Mexico City Grand Prix from every Formula 1 race since 2014, before and after qualifying.

**Live dashboard: [asiman-mexico-gp.pages.dev](https://asiman-mexico-gp.pages.dev)**

## Results

Tested on 42 races the models did not help choose (2025 and 2026), retrained before every race. Giving every driver an equal chance scores a log loss of about 3.0.

| When | Model | Log loss 2025 / 2026 | Favourite won | Winner in top 3 |
|---|---|---|---|---|
| Before qualifying | XGBoost + logistic regression | 1.586 / 1.705 | 38% / 44% | 88% / 78% |
| After qualifying | XGBoost | 1.043 / 0.812 | 63% / 72% | 100% / 94% |

- Before qualifying, the favourite won more often than simply backing the championship leader (21% / 39%).
- After qualifying, the favourite matched backing the pole-sitter in 2026 (72%) and fell just short in 2025 (67%).
- Qualifying is the strongest signal. In Mexico, Antonelli's chance is 66.6% from pole and 23.6% from P3.
- Going from 44 to 70 pre-weekend features improved validation log loss from 1.504 to 1.453.
- Giving older seasons less weight helped. Extra weight on the current rules era made models worse, because the season-only and short-window features already capture it.

Before qualifying, the model gives Antonelli 40.2%, Verstappen 21.6%, Leclerc 11.1%, Hamilton 9.0% and Hadjar 5.1%.

## Data

5,501 driver-race rows from 270 races, 2014 to the 2026 United States GP, from the [Jolpica F1 API](https://api.jolpi.ca/ergast/) (race results, qualifying laps, sprints and official standings). Mexico alone has only 10 modern races, so the models learn from every race and Mexico comes in through circuit features.

## Method

1. **Features:** 77 per driver and race, all built only from what was known before that race. They cover recent form, qualifying pace, race pace, Elo ratings for drivers and teams, car reliability, record at the circuit, results at high altitude, and how often pole wins here. Seven of them need qualifying: grid slot, qualifying position, gap to pole, gap to teammate, front row, grid penalty and sprint result.
2. **Target:** one row per driver, with probabilities normalised so each race sums to 1.
3. **Validation:** walk-forward on 2021 to 2024, training only on earlier races. Six model families were compared, including a conditional logit written for "one winner per race", then tuned on season weights and hyperparameters. Pairs and trios were tried as ensembles, separately for each mode.
4. **Scoring:** per race, using the log loss of the winner's probability, how often the favourite won, and how often the winner was in the top 3. Plain accuracy is useless when 95% of rows are "did not win".
5. **Leakage checks:** one test scrambles a finished race's result and requires that race's features to stay identical. This caught a real leak in a team feature, which was fixed before the numbers above were produced.

## Dashboard

A static site with no server. The post-qualifying XGBoost model is exported to JSON and runs in the visitor's browser, matching the Python model to within 0.000001 on 300 test grids.

- **Before qualifying:** every driver's chance, recent results and what moves the model.
- **Set the grid:** drag drivers, type gaps to pole or add penalties, and the chances update instantly. Official qualifying loads by itself once it is published.
- **Race result:** appears after the race and compares the winner with both predictions.
- **Season stats:** standings, race winners and start-versus-finish charts for 2014 to 2026.
- **How reliable is it:** the 2026 race-by-race record, scores against simple rules and what each grid slot is worth.

## Run it

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python src/fetch_data.py 2014 2026     # download data
.venv/bin/python src/build_features.py           # build the feature table
```

Run `mexico_gp_modeling.ipynb` to compare models and retrain, then:

```bash
.venv/bin/python src/export_dashboard.py         # write the dashboard's data
.venv/bin/python -m pytest tests -q
cd dashboard && npm install && npm test && npm run dev
```

On macOS without Homebrew, LightGBM and XGBoost need the OpenMP library bundled with scikit-learn. Re-run this after reinstalling either package:

```bash
SP=.venv/lib/python3.14/site-packages; for lib in $SP/lightgbm/lib/lib_lightgbm.dylib $SP/xgboost/lib/libxgboost.dylib; do install_name_tool -add_rpath "$PWD/$SP/sklearn/.dylibs" "$lib" && codesign --force -s - "$lib"; done
```

To predict from the command line after qualifying:

```bash
.venv/bin/python src/predict.py post_quali --refresh
```

Deployment and race-weekend steps are in [dashboard/README.md](dashboard/README.md).

## Files

| File | Purpose |
|---|---|
| `mexico_gp_modeling.ipynb` | Model comparison, tuning, final test, grid-slot analysis |
| `src/fetch_data.py` | Downloads results, qualifying, sprints and standings |
| `src/build_features.py` | Builds the 77 features |
| `src/race_models.py` | Conditional logit and the model wrapper |
| `src/grid_features.py` | Post-qualifying features for any grid |
| `src/predict.py` | Predicts the race from the command line |
| `src/export_dashboard.py` | Writes the dashboard's data and test fixtures |
| `tests/` | Leakage, pipeline and export tests |
| `models/` | Trained models and their scores |
| `data/` | Raw data, features and predictions |
| `dashboard/` | The React dashboard |
| `snapshots/2026-10-27_pre_qualifying/` | Notebook, models and predictions frozen before qualifying |

---

By [Asiman Imanzade](https://asiman-imanzade.pages.dev). More projects on [my portfolio](https://asiman-imanzade.pages.dev).
