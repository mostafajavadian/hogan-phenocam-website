"""Chromatic vegetation indices over a masked region of interest."""

from datetime import datetime

import cv2
import numpy as np
from astral import LocationInfo
from astral.sun import elevation

from . import config


def load_canopy_mask(image_shape: tuple[int, int], mask_path=config.MASK_PATH) -> np.ndarray:
    mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        return np.full(image_shape, 255, dtype=np.uint8)
    return mask


def calculate_indices(image: np.ndarray, mask: np.ndarray) -> dict[str, float] | None:
    """Returns mean/median/90th-percentile chromatic coordinates over the masked pixels, or None if the mask is empty."""
    b, g, r = cv2.split(image.astype(float))
    total = b + g + r
    total[total == 0] = 1

    gcc = g / total
    rcc = r / total
    bcc = b / total
    exg = (2 * g) - r - b

    valid = mask == 255
    if not np.any(valid):
        return None

    return {
        "gcc_mean": float(np.mean(gcc[valid])),
        "gcc_median": float(np.median(gcc[valid])),
        "gcc_90th": float(np.percentile(gcc[valid], 90)),
        "rcc_median": float(np.median(rcc[valid])),
        "bcc_median": float(np.median(bcc[valid])),
        "exg_median": float(np.median(exg[valid])),
    }


def is_daylight(timestamp: datetime, min_elevation: float = config.MIN_SOLAR_ELEVATION_DEG) -> tuple[bool, float]:
    site = LocationInfo(
        config.LOCATION_NAME, config.LOCATION_REGION, config.TIMEZONE,
        config.LATITUDE, config.LONGITUDE,
    )
    sun_elev = elevation(site.observer, timestamp)
    return sun_elev > min_elevation, sun_elev


def annotate_mask_contours(frame: np.ndarray, mask: np.ndarray) -> np.ndarray:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(frame, contours, -1, (0, 255, 0), 2)
    return frame
