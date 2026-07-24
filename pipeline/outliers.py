"""Daily IQR-fence outlier flagging, recomputed over the full history on every run."""

import pandas as pd

from . import config


def flag_daily_outliers(df: pd.DataFrame, value_col: str = "gcc_90th") -> pd.DataFrame:
    df = df.copy()
    df["datetime"] = pd.to_datetime(df["timestamp"])
    df["date"] = df["datetime"].dt.date
    df["is_outlier"] = 0

    grouped = df[df[value_col].notnull()].groupby("date")
    for _, group in grouped:
        if len(group) < config.OUTLIER_MIN_DAILY_SAMPLES:
            continue
        q1, q3 = group[value_col].quantile([0.25, 0.75])
        iqr = q3 - q1
        lower = q1 - config.OUTLIER_IQR_MULTIPLIER * iqr
        upper = q3 + config.OUTLIER_IQR_MULTIPLIER * iqr
        out_of_bounds = group[(group[value_col] < lower) | (group[value_col] > upper)].index
        df.loc[out_of_bounds, "is_outlier"] = 1

    return df.drop(columns=["datetime", "date"])
