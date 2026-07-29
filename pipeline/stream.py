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

# The player runs a video-ad waterfall (Google Ad Exchange / 2mdn.net) before the
# real live stream loads. In headless CI that waterfall can spin indefinitely
# (observed: 1900+ requests in 24s, mostly retrying a failing ad), starving out the
# actual .m3u8 request. Blocking these hosts lets the player fall through to content.
AD_BLOCK_HOSTS = (
    "googlesyndication.com",
    "doubleclick.net",
    "2mdn.net",
    "googleadservices.com",
    "google-analytics.com",
    "googletagmanager.com",
    "analytics.yahoo.com",
    "amazon-adsystem.com",
    "moatads.com",
    "scorecardresearch.com",
    "adservice.google",
)


async def get_live_m3u8(page_url: str = config.WEBCAM_PAGE_URL) -> str | None:
    """Loads the public webcam page and intercepts its token-protected HLS playlist URL.

    Ad/tracking hosts are blocked so the player's ad waterfall doesn't stall out the
    actual stream request; a single longer wait is used instead of reloading, since a
    reload just restarts the waterfall from scratch instead of letting it resolve.
    """
    m3u8_url = None
    seen_urls: list[str] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(user_agent=USER_AGENT)

        async def block_ads(route):
            if any(host in route.request.url for host in AD_BLOCK_HOSTS):
                await route.abort()
            else:
                await route.continue_()

        await page.route("**/*", block_ads)

        def handle_response(response):
            nonlocal m3u8_url
            seen_urls.append(response.url)
            if ".m3u8" in response.url:
                m3u8_url = response.url

        page.on("response", handle_response)

        await page.goto(page_url, wait_until="domcontentloaded")
        for _ in range(config.STREAM_LOAD_RETRIES):
            await page.wait_for_timeout(config.STREAM_LOAD_TIMEOUT_MS)
            if m3u8_url:
                break

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
