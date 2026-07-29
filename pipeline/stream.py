"""Live-stream URL interception and frame capture.

Primary path matches the original hogan-phenocam project: intercept the page's HLS
playlist request and read a frame via cv2.VideoCapture. That request sits behind an
ad system (Google Ad Exchange via AdThrive) that doesn't reliably resolve within a
short headless-browser wait, so in practice it only succeeds intermittently.

As a fallback, HDOnTap also serves a periodically-refreshed static preview image for
this camera (a "snapshot thumbnail") with no ad or video-player gating at all. If the
HLS manifest never shows up, we grab that image URL from the same page load instead
and download it directly -- no stream, no ads, no waiting on a player to initialize.
"""

import asyncio
import logging
import sys
import urllib.request

import cv2
import numpy as np
from playwright.async_api import async_playwright

from . import config

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

log = logging.getLogger(__name__)

SNAPSHOT_URL_MARKER = f"user_snapshot_thumbnails/thumbnail_snapshot_{config.WEBCAM_STREAM_ID}_"


async def get_stream_urls(page_url: str = config.WEBCAM_PAGE_URL) -> tuple[str | None, str | None]:
    """Loads the public webcam page and returns (m3u8_url, snapshot_url); either may be None."""
    m3u8_url = None
    snapshot_url = None
    seen_urls: list[str] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        def handle_response(response):
            nonlocal m3u8_url, snapshot_url
            seen_urls.append(response.url)
            if "chunklist.m3u8" in response.url or "playlist.m3u8" in response.url:
                m3u8_url = response.url
            elif SNAPSHOT_URL_MARKER in response.url:
                snapshot_url = response.url

        page.on("response", handle_response)
        await page.goto(page_url)
        await page.wait_for_timeout(config.STREAM_LOAD_TIMEOUT_MS)
        await browser.close()

    if not m3u8_url and not snapshot_url:
        log.info("Diagnostic — last 15 of %d responses seen:", len(seen_urls))
        for url in seen_urls[-15:]:
            log.info("  %s", url)

    return m3u8_url, snapshot_url


def capture_frame(stream_url: str) -> np.ndarray | None:
    """Opens the HLS stream and reads a single BGR frame."""
    cap = cv2.VideoCapture(stream_url)
    try:
        ok, frame = cap.read()
    finally:
        cap.release()
    return frame if ok else None


def download_snapshot(image_url: str) -> np.ndarray | None:
    """Downloads the static preview image and decodes it as a BGR frame."""
    try:
        with urllib.request.urlopen(image_url, timeout=10) as resp:
            data = resp.read()
    except Exception:
        log.exception("Failed to download snapshot thumbnail.")
        return None
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


async def fetch_current_frame() -> np.ndarray | None:
    m3u8_url, snapshot_url = await get_stream_urls()

    if m3u8_url:
        frame = capture_frame(m3u8_url)
        if frame is not None:
            return frame
        log.warning("HLS stream URL intercepted but frame read failed; trying snapshot fallback.")

    if snapshot_url:
        frame = download_snapshot(snapshot_url)
        if frame is not None:
            log.info("Using HDOnTap snapshot thumbnail (live HLS stream unavailable this cycle).")
            return frame

    log.warning("Could not obtain a frame via HLS stream or snapshot thumbnail.")
    return None
