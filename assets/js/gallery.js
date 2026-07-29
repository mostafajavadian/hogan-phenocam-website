import { initTheme, toggleTheme } from "./theme.js";
import { initMobileNav } from "./nav.js";

initTheme();
document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
initMobileNav();

const PLAY_INTERVAL_MS = 600;

let dates = [];
let idx = 0;
let timer = null;

const img = document.getElementById("gallery-img");
const dateLabel = document.getElementById("gallery-date-label");
const counter = document.getElementById("gallery-counter");
const slider = document.getElementById("gallery-slider");
const playBtn = document.getElementById("gallery-play-btn");
const playIcon = document.getElementById("gallery-play-icon");
const playLabel = document.getElementById("gallery-play-label");
const prevBtn = document.getElementById("gallery-prev-btn");
const nextBtn = document.getElementById("gallery-next-btn");
const galleryCard = document.getElementById("gallery-card");
const emptyState = document.getElementById("gallery-empty");

function showFrame(i) {
  idx = Math.max(0, Math.min(dates.length - 1, i));
  const date = dates[idx];
  img.src = `data/gallery/${date}.jpg`;
  dateLabel.textContent = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
  counter.textContent = `${idx + 1} / ${dates.length}`;
  slider.value = String(idx);
  prevBtn.disabled = idx === 0;
  nextBtn.disabled = idx === dates.length - 1;
}

function pause() {
  clearInterval(timer);
  timer = null;
  playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
  playLabel.textContent = "Play";
}

function play() {
  if (idx >= dates.length - 1) showFrame(0);
  playIcon.innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
  playLabel.textContent = "Pause";
  timer = setInterval(() => {
    if (idx >= dates.length - 1) {
      pause();
      return;
    }
    showFrame(idx + 1);
  }, PLAY_INTERVAL_MS);
}

playBtn.addEventListener("click", () => (timer ? pause() : play()));
prevBtn.addEventListener("click", () => { pause(); showFrame(idx - 1); });
nextBtn.addEventListener("click", () => { pause(); showFrame(idx + 1); });
slider.addEventListener("input", () => { pause(); showFrame(Number(slider.value)); });

async function boot() {
  try {
    const res = await fetch("data/gallery/index.json", { cache: "no-store" });
    dates = res.ok ? await res.json() : [];
  } catch {
    dates = [];
  }

  if (!dates.length) {
    galleryCard.style.display = "none";
    emptyState.style.display = "block";
    return;
  }

  slider.max = String(dates.length - 1);
  showFrame(dates.length - 1);
}

boot();
