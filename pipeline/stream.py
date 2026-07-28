"""Live-stream URL interception and frame capture."""

import asyncio
import logging
import sys

import cv2
import numpy as np
from playwright.async_api import async_playwright

from . import config

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

log = logging.getLogger(__name__)


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


async def get_live_m3u8(page_url: str = config.WEBCAM_PAGE_URL) -> str | None:
    """Loads the public webcam page and intercepts its token-protected HLS playlist URL.

    Retries with a fresh page load if the first attempt doesn't see any playlist
    request in time — CI network conditions are slower and less consistent than local dev.
    """
    m3u8_url = None
    seen_urls: list[str] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(user_agent=USER_AGENT)

        def handle_response(response):
            nonlocal m3u8_url
            seen_urls.append(response.url)
            if ".m3u8" in response.url:
                m3u8_url = response.url

        page.on("response", handle_response)

        for attempt in range(config.STREAM_LOAD_RETRIES):
            await page.goto(page_url, wait_until="domcontentloaded")
            await page.wait_for_timeout(config.STREAM_LOAD_TIMEOUT_MS)
            if m3u8_url:
                break
            log.info("No playlist request seen on attempt %d/%d.", attempt + 1, config.STREAM_LOAD_RETRIES)

        await browser.close()

    if not m3u8_url:
        media_like = [u for u in seen_urls if any(ext in u for ext in (".m3u8", ".mpd", ".ts", ".mp4", "/hls/", "/stream"))]
        sample = media_like or seen_urls[-15:]
        log.info("Diagnostic — %d total responses seen, showing up to 15 media/last URLs:", len(seen_urls))
        for url in sample[:15]:
            log.info("  %s", url)

    return m3u8_url


def capture_frame(stream_url: str) -> np.ndarray | None:
    """Opens the HLS stream and reads a single BGR frame."""
    cap = cv2.VideoCapture(stream_url)
    try:
        ok, frame = cap.read()
    finally:
        cap.release()
    return frame if ok else None


async def fetch_current_frame() -> np.ndarray | None:
    stream_url = await get_live_m3u8()
    if not stream_url:
        log.warning("Could not intercept the live stream URL.")
        return None
    frame = capture_frame(stream_url)
    if frame is None:
        log.warning("Stream URL intercepted but frame read failed.")
    return frame
