"""Archives one representative snapshot per calendar day for the front-end timelapse gallery.

Captures are intermittent (see stream.py), so rather than requiring an exact midday
capture, this opportunistically saves the first successful frame each day that falls
within a wide midday-ish window -- good enough for a daily timelapse without needing
the pipeline to succeed on a precise schedule.
"""

import json
from datetime import datetime

import cv2
import numpy as np

from . import config


def maybe_save_daily_snapshot(frame: np.ndarray, timestamp: datetime) -> None:
    if not (config.GALLERY_WINDOW_START_HOUR <= timestamp.hour <= config.GALLERY_WINDOW_END_HOUR):
        return

    config.GALLERY_DIR.mkdir(parents=True, exist_ok=True)
    image_path = config.GALLERY_DIR / f"{timestamp.strftime('%Y-%m-%d')}.jpg"
    if image_path.exists():
        return

    cv2.imwrite(str(image_path), frame)
    rebuild_index()


def rebuild_index() -> None:
    if not config.GALLERY_DIR.exists():
        return
    dates = sorted(p.stem for p in config.GALLERY_DIR.glob("*.jpg"))
    config.GALLERY_INDEX_PATH.write_text(json.dumps(dates, indent=2))
