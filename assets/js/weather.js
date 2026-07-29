// Historical weather for Worcester, MA via Open-Meteo's free archive API (no key required).

const LATITUDE = 42.2626;
const LONGITUDE = -71.8023;
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

const cache = new Map();

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

/** Returns [{date, tempMean, precipSum}] for the given date range, or [] if the request fails. */
export async function fetchWeather(startDate, endDate) {
  // Open-Meteo's archive only has data up to a couple of days ago.
  const safeEnd = new Date(Math.min(endDate.getTime(), Date.now() - 2 * 86400000));
  if (safeEnd < startDate) return [];

  const key = `${toDateStr(startDate)}_${toDateStr(safeEnd)}`;
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({
    latitude: LATITUDE,
    longitude: LONGITUDE,
    start_date: toDateStr(startDate),
    end_date: toDateStr(safeEnd),
    daily: "temperature_2m_mean,precipitation_sum",
    temperature_unit: "fahrenheit",
    timezone: "America/New_York",
  });

  try {
    const res = await fetch(`${ARCHIVE_URL}?${params}`);
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
    const json = await res.json();
    const days = json.daily?.time ?? [];
    const result = days.map((day, i) => ({
      date: new Date(day),
      tempMean: json.daily.temperature_2m_mean[i],
      precipSum: json.daily.precipitation_sum[i],
    }));
    cache.set(key, result);
    return result;
  } catch (err) {
    console.warn("Weather fetch failed:", err);
    return [];
  }
}
