// Data layer: fetch + parse phenocam_data.csv, derive stats and series.

const CSV_PATH = "data/phenocam_data.csv";
const NUMERIC_COLS = ["gcc_mean", "gcc_median", "gcc_90th", "rcc_median", "bcc_median", "exg_median"];

export async function loadDataset(csvPath = CSV_PATH) {
  const res = await fetch(csvPath, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load dataset: ${res.status}`);
  const text = await res.text();
  return parseCsv(text);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    const cells = raw.split(",");
    const row = {};
    header.forEach((key, idx) => {
      const val = cells[idx];
      if (key === "timestamp") {
        row.timestamp = val;
        row.date = new Date(val.replace(" ", "T"));
      } else if (key === "is_outlier") {
        row.is_outlier = val === "1";
      } else {
        row[key] = val === undefined || val === "" ? null : Number(val);
      }
    });
    rows.push(row);
  }
  return rows.filter((r) => !Number.isNaN(r.date?.getTime()));
}

export function hasReading(row) {
  return row.gcc_mean !== null && row.gcc_mean !== undefined;
}

export function filterByRange(rows, rangeKey) {
  if (rangeKey === "all") return rows;
  const now = rows.length ? rows[rows.length - 1].date : new Date();
  const days = { "7d": 7, "30d": 30, "90d": 90, "ytd": null }[rangeKey];
  let cutoff;
  if (rangeKey === "ytd") {
    cutoff = new Date(now.getFullYear(), 0, 1);
  } else {
    cutoff = new Date(now.getTime() - days * 86400000);
  }
  return rows.filter((r) => r.date >= cutoff);
}

export function movingAverage(values, windowSize = 10) {
  const out = new Array(values.length).fill(null);
  const buffer = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined && !Number.isNaN(v)) {
      buffer.push(v);
      if (buffer.length > windowSize) buffer.shift();
      out[i] = buffer.reduce((a, b) => a + b, 0) / buffer.length;
    }
  }
  return out;
}

export function summaryStats(rows, field = "gcc_90th") {
  const vals = rows
    .filter((r) => !r.is_outlier)
    .map((r) => r[field])
    .filter((v) => v !== null && v !== undefined && !Number.isNaN(v));

  if (!vals.length) {
    return { min: null, max: null, mean: null, std: null, n: 0, latest: null };
  }
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return {
    min: Math.min(...vals),
    max: Math.max(...vals),
    mean,
    std: Math.sqrt(variance),
    n,
    latest: vals[vals.length - 1],
  };
}

/** Most recent reading with a non-null gcc value. */
export function latestReading(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (hasReading(rows[i])) return rows[i];
  }
  return null;
}

/** Reading closest to `hoursAgo` hours before the latest reading, for delta comparisons. */
export function readingHoursAgo(rows, hoursAgo) {
  const latest = latestReading(rows);
  if (!latest) return null;
  const target = latest.date.getTime() - hoursAgo * 3600000;
  let best = null;
  let bestDiff = Infinity;
  for (const r of rows) {
    if (!hasReading(r)) continue;
    const diff = Math.abs(r.date.getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

/** Approximates the current phenological season phase from day-of-year in the Northern Hemisphere. */
export function seasonPhase(date) {
  const doy = dayOfYear(date);
  if (doy < 80 || doy >= 355) return { label: "Dormant", note: "Winter baseline" };
  if (doy < 152) return { label: "Green-up", note: "Spring emergence" };
  if (doy < 244) return { label: "Peak Canopy", note: "Summer maturity" };
  if (doy < 305) return { label: "Senescence", note: "Autumn decline" };
  return { label: "Dormant", note: "Late-season decline" };
}

export function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

/** Groups daylight readings by calendar day, taking the daily 90th-percentile-of-90th-percentile as the representative value. */
export function dailySeries(rows, field = "gcc_90th") {
  const byDay = new Map();
  for (const r of rows) {
    if (r[field] === null || r[field] === undefined || r.is_outlier) continue;
    const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}-${String(r.date.getDate()).padStart(2, "0")}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r[field]);
  }
  return Array.from(byDay.entries())
    .map(([day, vals]) => ({
      day,
      date: new Date(day),
      value: vals.reduce((a, b) => a + b, 0) / vals.length,
      n: vals.length,
    }))
    .sort((a, b) => a.date - b.date);
}

/** Overlays multiple years of daily data on a shared day-of-year axis for seasonal comparison. */
export function seasonalOverlay(rows, field = "gcc_90th") {
  const daily = dailySeries(rows, field);
  const byYear = new Map();
  for (const d of daily) {
    const year = d.date.getFullYear();
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push({ x: dayOfYear(d.date), y: d.value });
  }
  return byYear;
}

/**
 * Detects green-up (spring) and senescence (autumn) transition dates per year using a
 * 50%-of-amplitude threshold crossing on a 5-day-smoothed daily GCC series -- a standard,
 * simple phenocam method. Requires at least 20 daily observations in a year to attempt.
 */
export function detectPhenologyEvents(rows, field = "gcc_90th") {
  const daily = dailySeries(rows, field);
  const byYear = new Map();
  for (const d of daily) {
    const year = d.date.getFullYear();
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(d);
  }

  const events = [];
  for (const [year, series] of byYear) {
    if (series.length < 20) {
      events.push({ year, greenup: null, senescence: null, seasonLengthDays: null, insufficientData: true });
      continue;
    }

    const values = series.map((d) => d.value);
    const smoothed = movingAverage(values, 5);
    const min = Math.min(...smoothed);
    const max = Math.max(...smoothed);
    const threshold = min + 0.5 * (max - min);
    const peakIdx = smoothed.indexOf(max);

    let greenup = null;
    for (let i = 1; i <= peakIdx; i++) {
      if (smoothed[i - 1] < threshold && smoothed[i] >= threshold) {
        greenup = series[i].date;
        break;
      }
    }

    let senescence = null;
    for (let i = smoothed.length - 1; i > peakIdx; i--) {
      if (smoothed[i - 1] >= threshold && smoothed[i] < threshold) {
        senescence = series[i].date;
        break;
      }
    }

    const seasonLengthDays = greenup && senescence
      ? Math.round((senescence - greenup) / 86400000)
      : null;

    events.push({ year, greenup, senescence, seasonLengthDays, insufficientData: false });
  }

  return events.sort((a, b) => a.year - b.year);
}

export function toCsv(rows) {
  const header = ["timestamp", ...NUMERIC_COLS, "is_outlier"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.timestamp,
        ...NUMERIC_COLS.map((c) => (r[c] === null || r[c] === undefined ? "" : r[c])),
        r.is_outlier ? "1" : "0",
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function downloadCsv(rows, filename = "phenocam_export.csv") {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function timeAgo(date) {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
