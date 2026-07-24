// Chart.js builders for the phenocam dashboard. Chart.js + zoom plugin are loaded via CDN in the HTML.

import { currentThemeColors } from "./theme.js";

const METRIC_META = {
  gcc_90th: { label: "GCC (90th pct)", color: "#22c55e" },
  gcc_mean: { label: "GCC (mean)", color: "#4ade80" },
  rcc_median: { label: "RCC (median)", color: "#ef4444" },
  bcc_median: { label: "BCC (median)", color: "#3b82f6" },
  exg_median: { label: "ExG (median)", color: "#f59e0b" },
};

let mainChart = null;
let seasonalChart = null;
let miniCharts = {};

function baseGridOptions() {
  const c = currentThemeColors();
  return {
    color: c.text,
    grid: c.grid,
  };
}

function withAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function buildMainChart(canvas, seriesByMetric, activeMetrics) {
  const c = baseGridOptions();
  const datasets = activeMetrics.map((key) => {
    const meta = METRIC_META[key];
    return {
      label: meta.label,
      data: seriesByMetric[key],
      borderColor: meta.color,
      backgroundColor: withAlpha(meta.color, 0.08),
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
      tension: 0.25,
      spanGaps: true,
      fill: key === "gcc_90th",
      yAxisID: key.startsWith("gcc") ? "y" : "y",
    };
  });

  if (mainChart) mainChart.destroy();
  // eslint-disable-next-line no-undef
  mainChart = new Chart(canvas, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.grid === "#1c2924" ? "#0b1210" : "#ffffff",
          titleColor: c.color,
          bodyColor: c.color,
          borderColor: c.grid,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: (items) => new Date(items[0].parsed.x).toLocaleString(),
          },
        },
        zoom: {
          zoom: { wheel: { enabled: true, speed: 0.06 }, pinch: { enabled: true }, mode: "x" },
          pan: { enabled: true, mode: "x" },
          limits: { x: { minRange: 3600000 } },
        },
      },
      scales: {
        x: {
          type: "time",
          time: { unit: "day" },
          grid: { color: c.grid, display: false },
          ticks: { color: c.color, maxRotation: 0 },
        },
        y: {
          grid: { color: c.grid },
          ticks: { color: c.color },
          title: { display: true, text: "Chromatic coordinate", color: c.color, font: { size: 11 } },
        },
      },
    },
  });
  return mainChart;
}

export function resetZoom() {
  if (mainChart && mainChart.resetZoom) mainChart.resetZoom();
}

export function buildSeasonalChart(canvas, byYear) {
  const c = baseGridOptions();
  const palette = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#0ea5e9"];
  const years = Array.from(byYear.keys()).sort();
  const datasets = years.map((year, i) => ({
    label: String(year),
    data: byYear.get(year).sort((a, b) => a.x - b.x),
    borderColor: palette[i % palette.length],
    backgroundColor: "transparent",
    pointRadius: 0,
    borderWidth: 2,
    tension: 0.3,
    spanGaps: true,
  }));

  if (seasonalChart) seasonalChart.destroy();
  // eslint-disable-next-line no-undef
  seasonalChart = new Chart(canvas, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { color: c.color, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" } },
        tooltip: { callbacks: { title: (items) => `Day ${items[0].parsed.x} of year` } },
      },
      scales: {
        x: {
          type: "linear",
          min: 1,
          max: 366,
          title: { display: true, text: "Day of year", color: c.color, font: { size: 11 } },
          grid: { color: c.grid },
          ticks: { color: c.color },
        },
        y: {
          grid: { color: c.grid },
          ticks: { color: c.color },
        },
      },
    },
  });
  return seasonalChart;
}

export function destroyAll() {
  if (mainChart) mainChart.destroy();
  if (seasonalChart) seasonalChart.destroy();
  Object.values(miniCharts).forEach((c) => c.destroy());
  miniCharts = {};
}

export const METRICS = METRIC_META;
