"""Main extraction entrypoint: capture a frame, compute indices, log to CSV, re-flag outliers.

Run every 30 minutes by .github/workflows/phenocam.yml.
"""

import asyncio
import csv
import logging

import cv2
import pandas as pd
import pytz
from datetime import datetime

from . import config, stream
from .outliers import flag_daily_outliers
from .phenology import annotate_mask_contours, calculate_indices, is_daylight, load_canopy_mask

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def append_row(timestamp_str: str, stats: dict | None) -> None:
    write_header = not config.CSV_PATH.exists()
    config.CSV_PATH.parent.mkdir(parents=True, exist_ok=True)

    with open(config.CSV_PATH, mode="a", newline="") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(config.CSV_COLUMNS)

        if stats:
            writer.writerow([
                timestamp_str,
                round(stats["gcc_mean"], 4), round(stats["gcc_median"], 4), round(stats["gcc_90th"], 4),
                round(stats["rcc_median"], 4), round(stats["bcc_median"], 4), round(stats["exg_median"], 4),
                0,
            ])
        else:
            writer.writerow([timestamp_str, "", "", "", "", "", "", 0])


def recompute_outliers() -> None:
    try:
        df = pd.read_csv(config.CSV_PATH)
        df = flag_daily_outliers(df)
        df.to_csv(config.CSV_PATH, index=False)
        log.info("Daily outlier check complete.")
    except Exception:
        log.exception("Outlier recomputation failed; leaving existing flags in place.")


async def main() -> None:
    eastern = pytz.timezone(config.TIMEZONE)
    now = datetime.now(eastern)
    timestamp_str = now.strftime("%Y-%m-%d %H:%M:%S")

    daylight, sun_elev = is_daylight(now)

    frame = await stream.fetch_current_frame()
    if frame is None:
        log.warning("[%s] No frame captured; skipping this cycle.", timestamp_str)
        return

    if not daylight:
        log.info("[%s] Below solar elevation threshold (%.1f°). Logging empty row.", timestamp_str, sun_elev)
        append_row(timestamp_str, None)
        return

    mask = load_canopy_mask(frame.shape[:2])
    stats = calculate_indices(frame, mask)
    if stats is None:
        log.warning("[%s] Canopy mask matched no pixels; skipping.", timestamp_str)
        return

    log.info("[%s] Daylight (elev %.1f°). GCC 90th: %.4f", timestamp_str, sun_elev, stats["gcc_90th"])
    append_row(timestamp_str, stats)
    recompute_outliers()

    annotated = annotate_mask_contours(frame, mask)
    config.LATEST_IMAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(config.LATEST_IMAGE_PATH), annotated)


if __name__ == "__main__":
    asyncio.run(main())
