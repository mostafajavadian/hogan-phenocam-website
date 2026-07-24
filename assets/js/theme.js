const STORAGE_KEY = "phenocam-theme";

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  updateToggleIcon();
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(STORAGE_KEY, next);
  updateToggleIcon();
  window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
}

function updateToggleIcon() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const isDark = (document.documentElement.getAttribute("data-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
  btn.innerHTML = isDark
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
}

export function currentThemeColors() {
  const isDark = (document.documentElement.getAttribute("data-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
  return {
    isDark,
    text: isDark ? "#9db3a5" : "#5b6b62",
    grid: isDark ? "#1c2924" : "#e6ece8",
    bgElevated: isDark ? "#121b17" : "#ffffff",
  };
}
