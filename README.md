# 🌿 Hogan Phenocam Dashboard

A redesigned, feature-expanded dashboard for automated vegetation phenology monitoring at the
Hogan Courtyard, College of the Holy Cross — built on top of the original
[`hogan-phenocam`](https://github.com/mostafajavadian/hogan-phenocam) data pipeline.

**[View the live dashboard →](https://mostafajavadian.github.io/hogan-phenocam-website/)**

## What this is

The original project logs the **Green Chromatic Coordinate (GCC)** of a live campus webcam every
30 minutes via a serverless GitHub Actions pipeline, then plots it on a single-page dashboard. This
repo keeps that pipeline's core science intact but rebuilds the front end from scratch and cleans up
the backend into a proper Python package:

- **Multi-page dashboard** — Dashboard, Data Explorer, Gallery, and Methodology, instead of a single page.
- **Green-up / senescence detection** — auto-detects spring and autumn transition dates per year from
  a 50%-of-amplitude threshold crossing, surfaced as both a table and dashed chart annotations.
- **Weather overlay** — daily temperature/precipitation for Worcester, MA (via Open-Meteo, no API key)
  plotted alongside the selected date range for scientific context.
- **Snapshot gallery / timelapse** — one canopy image archived per day; scrub through or auto-play.
- **Chart export to PNG**, next to the existing filtered CSV export.
- **Camera location map** (Leaflet/OpenStreetMap) on the Methodology page.
- **Five vegetation indices, not one** — GCC (mean/median/90th pct), RCC, BCC, ExG, toggled independently.
- **Zoomable, pannable time series** with adjustable date range (7D / 30D / 90D / YTD / All) and
  optional 10-point moving-average smoothing.
- **Year-over-year seasonal overlay** — every recorded year plotted on a shared day-of-year axis.
- **Live KPI cards** — current GCC, 24-hour Δ, inferred season phase, total observations.
- **Full data explorer** — searchable, sortable, paginated table over the raw CSV with one-click
  filtered CSV export.
- **Outlier-aware everywhere** — the daily IQR fence from the original pipeline is surfaced as a
  toggle, not hidden.
- **Dark / light theme**, responsive layout, installable as a PWA.
- **Refactored Python pipeline** (`pipeline/`) — the original three scripts are now typed, logged,
  and split into single-responsibility modules instead of one monolithic file.

## Project structure

```
hogan-phenocam-website/
├── index.html              Dashboard
├── explorer.html           Data explorer
├── gallery.html            Daily snapshot timelapse
├── methodology.html        Science + architecture writeup (incl. camera location map)
├── 404.html
├── manifest.json           PWA manifest
├── assets/
│   ├── css/styles.css      Design system (light + dark themes)
│   ├── js/
│   │   ├── data.js         CSV parsing, stats, smoothing, outlier, seasonal & phenology-event helpers
│   │   ├── charts.js       Chart.js chart builders (main, seasonal, weather) + PNG export
│   │   ├── weather.js      Open-Meteo historical weather fetch (client-side, no key)
│   │   ├── theme.js        Dark/light theme toggle
│   │   ├── nav.js          Mobile hamburger menu
│   │   ├── app.js          Dashboard controller
│   │   ├── explorer.js     Data explorer controller
│   │   └── gallery.js      Snapshot gallery/timelapse controller
│   └── img/                Favicon, hero illustration, OG image (all SVG, no external image deps)
├── data/
│   ├── phenocam_data.csv   Historical observation log
│   └── gallery/            One archived JPG per day + index.json manifest
├── pipeline/                Python extraction pipeline (refactored)
│   ├── config.py           Constants: webcam URL, location, paths, thresholds
│   ├── stream.py           Playwright stream interception + snapshot-thumbnail fallback
│   ├── phenology.py        GCC/RCC/BCC/ExG calculation + solar-elevation gate
│   ├── outliers.py         Daily IQR outlier flagging
│   ├── gallery.py          Archives one daily snapshot for the timelapse gallery
│   ├── run.py               Main entrypoint (run every 30 min by CI)
│   ├── archiver.py         Optional: archives one frame per run to phenology_images/
│   ├── canopy_mask.png     Region-of-interest mask isolating canopy pixels
│   └── requirements.txt
└── .github/workflows/phenocam.yml   Scheduled extraction job
```

## Running the dashboard locally

The dashboard is static HTML/CSS/JS with no build step — it just needs to be served over HTTP so
the browser can `fetch()` the local CSV (opening `index.html` directly via `file://` will not load
data due to browser CORS restrictions on local files):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Running the extraction pipeline

```bash
pip install -r pipeline/requirements.txt
playwright install chromium
python -m pipeline.run
```

This appends one row to `data/phenocam_data.csv`, re-flags outliers for the day, and writes an
annotated snapshot to `data/latest_image.jpg`. In production this runs unattended every 30 minutes
via `.github/workflows/phenocam.yml`.

To enable the live dashboard on GitHub Pages: **Settings → Pages → Deploy from branch → main / (root)**.

## Methodology, briefly

```
GCC = G / (R + G + B)      RCC = R / (R + G + B)      BCC = B / (R + G + B)      ExG = 2G − R − B
```

Indices are computed only over pixels inside a hand-drawn canopy mask, only when the sun is above 5°
elevation over Worcester, MA, and are cross-checked daily against an interquartile-range outlier
fence. Full detail is on the [Methodology page](https://mostafajavadian.github.io/hogan-phenocam-website/methodology.html).

## Credits

- Original pipeline & concept: [mostafajavadian/hogan-phenocam](https://github.com/mostafajavadian/hogan-phenocam)
- Live imagery: [HDOnTap](https://hdontap.com)
- Institution: [College of the Holy Cross](https://www.holycross.edu)

## License

MIT — see [LICENSE](LICENSE).
