from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

WEBCAM_PAGE_URL = "https://hdontap.com/stream/178090/holy-cross-hogan-courtyard-live-webcam/"
STREAM_LOAD_TIMEOUT_MS = 8000
STREAM_LOAD_RETRIES = 4

TIMEZONE = "US/Eastern"
LOCATION_NAME = "Worcester"
LOCATION_REGION = "Massachusetts"
LATITUDE = 42.2626
LONGITUDE = -71.8023
MIN_SOLAR_ELEVATION_DEG = 5.0

DATA_DIR = REPO_ROOT / "data"
CSV_PATH = DATA_DIR / "phenocam_data.csv"
MASK_PATH = REPO_ROOT / "pipeline" / "canopy_mask.png"
LATEST_IMAGE_PATH = DATA_DIR / "latest_image.jpg"

ARCHIVE_DIR = REPO_ROOT / "phenology_images"

CSV_COLUMNS = [
    "timestamp",
    "gcc_mean",
    "gcc_median",
    "gcc_90th",
    "rcc_median",
    "bcc_median",
    "exg_median",
    "is_outlier",
]

OUTLIER_MIN_DAILY_SAMPLES = 4
OUTLIER_IQR_MULTIPLIER = 1.5
MOVING_AVERAGE_WINDOW = 10
