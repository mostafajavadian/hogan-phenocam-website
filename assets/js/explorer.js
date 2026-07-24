import { loadDataset, hasReading, downloadCsv } from "./data.js";
import { initTheme, toggleTheme } from "./theme.js";

initTheme();
document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

const PAGE_SIZE = 25;

let allRows = [];
let filtered = [];
let sortKey = "timestamp";
let sortDir = -1; // newest first
let page = 1;

const searchBox = document.getElementById("search-box");
const outliersOnly = document.getElementById("outliers-only-toggle");
const hideEmpty = document.getElementById("hide-empty-toggle");

searchBox.addEventListener("input", () => { page = 1; applyFilters(); });

for (const chip of [outliersOnly, hideEmpty]) {
  chip.addEventListener("click", (e) => {
    e.preventDefault();
    chip.classList.toggle("off");
    chip.querySelector("input").checked = !chip.classList.contains("off");
    page = 1;
    applyFilters();
  });
}

document.querySelectorAll("th[data-key]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.key;
    if (sortKey === key) {
      sortDir *= -1;
    } else {
      sortKey = key;
      sortDir = 1;
    }
    document.querySelectorAll("th[data-key] .arrow").forEach((a) => (a.textContent = ""));
    th.querySelector(".arrow").textContent = sortDir === 1 ? "↑" : "↓";
    render();
  });
});

document.getElementById("export-btn").addEventListener("click", () => {
  downloadCsv(filtered, `phenocam_export_${Date.now()}.csv`);
});

document.getElementById("pg-first").addEventListener("click", () => { page = 1; render(); });
document.getElementById("pg-prev").addEventListener("click", () => { page = Math.max(1, page - 1); render(); });
document.getElementById("pg-next").addEventListener("click", () => { page = Math.min(totalPages(), page + 1); render(); });
document.getElementById("pg-last").addEventListener("click", () => { page = totalPages(); render(); });

function totalPages() {
  return Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
}

function applyFilters() {
  const q = searchBox.value.trim().toLowerCase();
  const onlyOutliers = !outliersOnly.classList.contains("off");
  const skipEmpty = !hideEmpty.classList.contains("off");

  filtered = allRows.filter((r) => {
    if (onlyOutliers && !r.is_outlier) return false;
    if (skipEmpty && !hasReading(r)) return false;
    if (q && !r.timestamp.toLowerCase().includes(q)) return false;
    return true;
  });
  render();
}

function fmt(n) {
  return n === null || n === undefined ? '<span class="empty-cell">—</span>' : n;
}

function render() {
  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortKey];
    let bv = b[sortKey];
    if (sortKey === "timestamp") { av = a.date; bv = b.date; }
    if (sortKey === "is_outlier") { av = a.is_outlier ? 1 : 0; bv = b.is_outlier ? 1 : 0; }
    if (av === null) av = -Infinity;
    if (bv === null) bv = -Infinity;
    return av > bv ? sortDir : av < bv ? -sortDir : 0;
  });

  const start = (page - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById("table-body");
  if (!pageRows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell" style="text-align:center; padding:40px;">No rows match your filters.</td></tr>`;
  } else {
    tbody.innerHTML = pageRows
      .map(
        (r) => `<tr>
        <td>${r.timestamp}</td>
        <td>${fmt(r.gcc_mean)}</td>
        <td>${fmt(r.gcc_median)}</td>
        <td>${fmt(r.gcc_90th)}</td>
        <td>${fmt(r.rcc_median)}</td>
        <td>${fmt(r.bcc_median)}</td>
        <td>${fmt(r.exg_median)}</td>
        <td>${r.is_outlier ? '<span class="outlier-tag">OUTLIER</span>' : '<span class="ok-tag">OK</span>'}</td>
      </tr>`
      )
      .join("");
  }

  document.getElementById("row-count").textContent = `${filtered.length.toLocaleString()} rows`;
  document.getElementById("pg-label").textContent = `Page ${page} of ${totalPages()}`;
  document.getElementById("pg-first").disabled = page === 1;
  document.getElementById("pg-prev").disabled = page === 1;
  document.getElementById("pg-next").disabled = page === totalPages();
  document.getElementById("pg-last").disabled = page === totalPages();
}

async function boot() {
  try {
    allRows = await loadDataset();
    applyFilters();
  } catch (err) {
    console.error(err);
    document.getElementById("table-body").innerHTML =
      `<tr><td colspan="8" style="text-align:center; padding:40px;">Could not load data/phenocam_data.csv. Serve this site over HTTP to load local data.</td></tr>`;
  }
}

boot();
