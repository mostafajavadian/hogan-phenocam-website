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


async def get_live_m3u8(page_url: str = config.WEBCAM_PAGE_URL) -> str | None:
    """Loads the public webcam page and intercepts its token-protected HLS playlist URL."""
    m3u8_url = None

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        def handle_response(response):
            nonlocal m3u8_url
            if "chunklist.m3u8" in response.url or "playlist.m3u8" in response.url:
                m3u8_url = response.url

        page.on("response", handle_response)
        await page.goto(page_url)
        await page.wait_for_timeout(config.STREAM_LOAD_TIMEOUT_MS)
        await browser.close()

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
