"""Race-aware model pieces shared by the notebook and the dashboard.

A race has exactly one winner, so per-driver probabilities must sum to 1
within a race. Two ways to get there:

* `normalize_within_race` - rescale any classifier's P(win) per race.
* `RaceSoftmax`           - conditional logit: one linear score per driver,
                            softmax across the drivers of each race.

`RaceWinModel` wraps one estimator (or an averaged ensemble) so the notebook
and the dashboard can call `fit(df)` / `predict(df)` without caring which.
"""
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler


def normalize_within_race(proba, race_keys):
    """Rescale probabilities so each race sums to 1."""
    s = pd.Series(proba, index=np.asarray(race_keys))
    return (s / s.groupby(level=0).transform("sum")).to_numpy()


def recency_weights(seasons, current_season, half_life=None, era_boost=1.0, era_start=None):
    """Down-weight old seasons: weight halves every `half_life` seasons.

    `era_boost` multiplies rows from the current regulation era
    (season >= era_start), e.g. 2026 under the new rules.
    """
    seasons = np.asarray(seasons)
    w = np.ones(len(seasons)) if half_life is None else 0.5 ** ((current_season - seasons) / half_life)
    if era_start is not None:
        w = np.where(seasons >= era_start, w * era_boost, w)
    return w


def _race_slices(groups):
    """Row -> race codes and the first row of each race (rows contiguous per race)."""
    codes = pd.factorize(pd.Series(np.asarray(groups)))[0]
    starts = np.concatenate([[0], np.flatnonzero(np.diff(codes)) + 1])
    return codes, starts


def _race_logsumexp(s, codes, starts):
    m = np.maximum.reduceat(s, starts)
    return m + np.log(np.add.reduceat(np.exp(s - m[codes]), starts))


class RaceSoftmax(BaseEstimator, ClassifierMixin):
    """Conditional logit fitted with L-BFGS; `C` is the inverse L2 strength."""

    def __init__(self, C=1.0):
        self.C = C

    def fit(self, X, y, groups, sample_weight=None):
        self.imputer_ = SimpleImputer(strategy="median").fit(X)
        self.scaler_ = StandardScaler().fit(self.imputer_.transform(X))
        Z = self.scaler_.transform(self.imputer_.transform(X))
        y = np.asarray(y, dtype=float)
        w = np.ones(len(y)) if sample_weight is None else np.asarray(sample_weight, dtype=float)
        codes, starts = _race_slices(groups)
        race_w = np.bincount(codes, weights=w * y)  # weight of each race's winner row

        def loss_and_grad(beta):
            s = Z @ beta
            lse = _race_logsumexp(s, codes, starts)
            p = np.exp(s - lse[codes])
            loss = np.sum(w * y * (lse[codes] - s)) + 0.5 / self.C * beta @ beta
            grad = Z.T @ (race_w[codes] * p - w * y) + beta / self.C
            return loss, grad

        self.coef_ = minimize(loss_and_grad, np.zeros(Z.shape[1]), jac=True, method="L-BFGS-B").x
        self.classes_ = np.array([0.0, 1.0])
        return self

    def decision_function(self, X):
        return self.scaler_.transform(self.imputer_.transform(X)) @ self.coef_

    def predict_race_proba(self, X, groups):
        s = self.decision_function(X)
        codes, starts = _race_slices(groups)
        return np.exp(s - _race_logsumexp(s, codes, starts)[codes])


class RaceWinModel:
    """Averages the race-normalised P(win) of one or more estimators."""

    def __init__(self, members, features):
        self.members = members      # {name: unfitted estimator}
        self.features = list(features)

    def fit(self, df, sample_weight=None):
        # Skip features with no values yet (e.g. sprint_pos before sprints existed).
        self.used_features_ = [c for c in self.features if df[c].notna().any()]
        X, y = df[self.used_features_], df["win"].to_numpy()
        for est in self.members.values():
            if isinstance(est, RaceSoftmax):
                est.fit(X, y, df["race_key"], sample_weight=sample_weight)
            elif hasattr(est, "steps"):  # sklearn Pipeline: route weights to the last step
                est.fit(X, y, **{f"{est.steps[-1][0]}__sample_weight": sample_weight})
            else:
                est.fit(X, y, sample_weight=sample_weight)
        return self

    def predict_members(self, df):
        X, races = df[self.used_features_], df["race_key"]
        out = {}
        for name, est in self.members.items():
            if isinstance(est, RaceSoftmax):
                out[name] = est.predict_race_proba(X, races)
            else:
                out[name] = normalize_within_race(est.predict_proba(X)[:, 1], races)
        return out

    def predict(self, df):
        p = np.mean(list(self.predict_members(df).values()), axis=0)
        return normalize_within_race(p, df["race_key"])
