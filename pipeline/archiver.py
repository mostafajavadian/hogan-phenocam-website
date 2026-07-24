"""Optional: saves one full-resolution frame per run into a dated archive folder.

Useful for rebuilding the ROI mask or for a supplementary visual timeline outside of git history.
Not run by the scheduled workflow by default — invoke manually or wire into a separate, lower-frequency cron.
"""

import asyncio
import logging
from datetime import datetime

import cv2

from . import config, stream

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


async def main() -> None:
    now = datetime.now()
    save_dir = config.ARCHIVE_DIR / now.strftime("%Y") / now.strftime("%m")
    save_dir.mkdir(parents=True, exist_ok=True)

    filename = f"HC1_{now.strftime('%Y_%m_%d_%H_%M')}.jpg"
    filepath = save_dir / filename

    frame = await stream.fetch_current_frame()
    if frame is None:
        log.warning("Could not capture a frame to archive.")
        return

    cv2.imwrite(str(filepath), frame)
    log.info("Archived frame to %s", filepath)


if __name__ == "__main__":
    asyncio.run(main())
