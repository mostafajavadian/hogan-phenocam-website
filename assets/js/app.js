import { loadDataset, filterByRange, movingAverage, summaryStats, latestReading, readingHoursAgo, seasonPhase, seasonalOverlay, detectPhenologyEvents, hasReading, timeAgo } from "./data.js";
import { buildMainChart, buildSeasonalChart, buildWeatherChart, exportChartAsPng, resetZoom } from "./charts.js";
import { fetchWeather } from "./weather.js";
import { initTheme, toggleTheme } from "./theme.js";

initTheme();
document.getElementById("theme-toggle").addEventListener("click", () => {
  toggleTheme();
  render();
});
window.addEventListener("themechange", render);

let allRows = [];
let state = {
  range: "30d",
  metrics: ["gcc_90th", "rcc_median"],
  smoothing: true,
  showOutliers: false,
};

document.getElementById("range-seg").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-range]");
  if (!btn) return;
  document.querySelectorAll("#range-seg button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.range = btn.dataset.range;
  render();
});

document.querySelectorAll("#metric-toggles .toggle-chip[data-metric]").forEach((chip) => {
  chip.addEventListener("click", (e) => {
    e.preventDefault();
    const metric = chip.dataset.metric;
    const idx = state.metrics.indexOf(metric);
    if (idx >= 0) {
      state.metrics.splice(idx, 1);
      chip.classList.add("off");
      chip.querySelector("input").checked = false;
    } else {
      state.metrics.push(metric);
      chip.classList.remove("off");
      chip.querySelector("input").checked = true;
    }
    render();
  });
});

document.getElementById("smoothing-toggle").addEventListener("click", (e) => {
  e.preventDefault();
  state.smoothing = !state.smoothing;
  e.currentTarget.classList.toggle("off", !state.smoothing);
  e.currentTarget.querySelector("input").checked = state.smoothing;
  render();
});

document.getElementById("outlier-toggle").addEventListener("click", (e) => {
  e.preventDefault();
  state.showOutliers = !state.showOutliers;
  e.currentTarget.classList.toggle("off", !state.showOutliers);
  e.currentTarget.querySelector("input").checked = state.showOutliers;
  render();
});

document.getElementById("reset-zoom-btn").addEventListener("click", resetZoom);
document.getElementById("export-chart-png-btn").addEventListener("click", () => exportChartAsPng("main", `hogan-phenocam-gcc-${state.range}.png`));
document.getElementById("export-seasonal-png-btn").addEventListener("click", () => exportChartAsPng("seasonal", "hogan-phenocam-seasonal.png"));

function fmt(n, digits = 4) {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(digits);
}

function updateKpis(rows) {
  const latest = latestReading(rows);
  const yesterday = latest ? readingHoursAgo(rows, 24) : null;

  document.getElementById("kpi-gcc").textContent = latest ? fmt(latest.gcc_90th) : "—";

  if (latest && yesterday && yesterday.gcc_90th !== null) {
    const delta = latest.gcc_90th - yesterday.gcc_90th;
    const pct = (delta / yesterday.gcc_90th) * 100;
    const el = document.getElementById("kpi-change");
    el.textContent = `${delta >= 0 ? "+" : ""}${fmt(delta, 4)}`;
    const noteEl = document.getElementById("kpi-change-note");
    noteEl.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs 24h ago`;
    noteEl.parentElement.querySelector(".kpi-delta").className = `kpi-delta ${delta > 0.002 ? "up" : delta < -0.002 ? "down" : "flat"}`;
  } else {
    document.getElementById("kpi-change").textContent = "—";
  }

  if (latest) {
    const phase = seasonPhase(latest.date);
    document.getElementById("kpi-season").textContent = phase.label;
    document.getElementById("kpi-season-note").textContent = phase.note;
    document.getElementById("snapshot-time").textContent = `${latest.date.toLocaleString()} · ${timeAgo(latest.date)}`;
    document.getElementById("snapshot-season").textContent = phase.label;
  }

  const validCount = rows.filter(hasReading).length;
  document.getElementById("kpi-count").textContent = validCount.toLocaleString();

  updateFreshness(latest);
}

function updateFreshness(latest) {
  const badge = document.getElementById("freshness-badge");
  const text = document.getElementById("freshness-text");
  if (!latest) {
    badge.className = "freshness very-stale";
    text.textContent = "no data";
    return;
  }
  const ageHours = (Date.now() - latest.date.getTime()) / 3600000;
  let tier = "fresh";
  if (ageHours > 6) tier = "very-stale";
  else if (ageHours > 1.5) tier = "stale";
  badge.className = `freshness ${tier}`;
  text.textContent = `updated ${timeAgo(latest.date)}`;
}

function updateStatStrip(rows) {
  const stats = summaryStats(rows, "gcc_90th");
  document.getElementById("stat-min").textContent = fmt(stats.min);
  document.getElementById("stat-max").textContent = fmt(stats.max);
  document.getElementById("stat-mean").textContent = fmt(stats.mean);
  document.getElementById("stat-std").textContent = fmt(stats.std);
  document.getElementById("stat-n").textContent = stats.n.toLocaleString();
}

function buildSeriesForMetric(rows, metric) {
  const filtered = rows.filter((r) => state.showOutliers || !r.is_outlier);
  const points = filtered
    .filter((r) => r[metric] !== null && r[metric] !== undefined)
    .map((r) => ({ x: r.date.getTime(), y: r[metric], outlier: r.is_outlier }));

  if (!state.smoothing) return points;

  const values = points.map((p) => p.y);
  const smoothed = movingAverage(values, 10);
  return points.map((p, i) => ({ x: p.x, y: smoothed[i] }));
}

function fmtDate(date) {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderPhenologyEvents(rows) {
  const events = detectPhenologyEvents(rows, "gcc_90th");
  const tbody = document.getElementById("phenology-events-body");

  if (!events.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:24px;" class="empty-cell">Not enough data yet.</td></tr>`;
    return events;
  }

  tbody.innerHTML = events
    .map((ev) => {
      if (ev.insufficientData) {
        return `<tr><td>${ev.year}</td><td colspan="3" class="empty-cell">Not enough daily readings yet</td></tr>`;
      }
      return `<tr>
        <td>${ev.year}</td>
        <td>${ev.greenup ? fmtDate(ev.greenup) : '<span class="empty-cell">—</span>'}</td>
        <td>${ev.senescence ? fmtDate(ev.senescence) : '<span class="empty-cell">—</span>'}</td>
        <td>${ev.seasonLengthDays !== null ? `${ev.seasonLengthDays} days` : '<span class="empty-cell">—</span>'}</td>
      </tr>`;
    })
    .join("");

  return events;
}

async function updateWeatherChart(rangeRows) {
  const wrap = document.getElementById("weather-chart-wrap");
  const empty = document.getElementById("weather-empty");
  if (!rangeRows.length) {
    wrap.style.display = "none";
    empty.style.display = "block";
    return;
  }

  const weather = await fetchWeather(rangeRows[0].date, rangeRows[rangeRows.length - 1].date);
  if (!weather.length) {
    wrap.style.display = "none";
    empty.style.display = "block";
    return;
  }

  wrap.style.display = "";
  empty.style.display = "none";
  buildWeatherChart(document.getElementById("weather-chart"), weather);
}

function render() {
  const rangeRows = filterByRange(allRows, state.range);
  updateKpis(rangeRows.length ? rangeRows : allRows);
  updateStatStrip(rangeRows);

  const seriesByMetric = {};
  for (const m of state.metrics) seriesByMetric[m] = buildSeriesForMetric(rangeRows, m);

  buildMainChart(document.getElementById("main-chart"), seriesByMetric, state.metrics);

  const events = renderPhenologyEvents(allRows);
  const overlay = seasonalOverlay(allRows, "gcc_90th");
  buildSeasonalChart(document.getElementById("seasonal-chart"), overlay, events);

  updateWeatherChart(rangeRows);
}

function loadSnapshot() {
  const img = document.getElementById("snapshot-img");
  const fallback = img.dataset.fallback;
  const probe = new Image();
  probe.onload = () => { img.src = `data/latest_image.jpg?t=${Date.now()}`; };
  probe.onerror = () => { img.src = fallback; };
  probe.src = `data/latest_image.jpg?t=${Date.now()}`;
}

async function boot() {
  loadSnapshot();
  try {
    allRows = await loadDataset();
    render();
  } catch (err) {
    console.error(err);
    document.querySelector("main").insertAdjacentHTML(
      "afterbegin",
      `<div class="empty-state">Could not load <code>data/phenocam_data.csv</code>. If you're opening this file directly, serve it over HTTP instead (e.g. <code>python -m http.server</code>).</div>`
    );
  }
}

boot();
