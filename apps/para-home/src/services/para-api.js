async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Accept": "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    signal: AbortSignal.timeout(4000),
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

export const paraApi = {
  capabilities: () => request("/api/v1/capabilities"),
  applications: () => request("/api/v1/apps"),
  storeCatalog: () => request("/api/v1/store/catalog"),
  launchApplication: (id) => request("/api/v1/apps/launch", { method: "POST", body: JSON.stringify({ id }) }),
  system: () => request("/api/v1/system"),
  storage: () => request("/api/v1/storage"),
  network: () => request("/api/v1/network"),
  audio: () => request("/api/v1/audio"),
  setAudio: (kind, patch) => request("/api/v1/audio", { method: "POST", body: JSON.stringify({ kind, ...patch }) }),
  power: (action) => request("/api/v1/power", { method: "POST", body: JSON.stringify({ action }) }),
  directories: () => request("/api/v1/directories"),
  browseFiles: (path = "home") => request(`/api/v1/files/browse?path=${encodeURIComponent(path)}`),
  searchFiles: (path, query) => request(`/api/v1/files/search?path=${encodeURIComponent(path)}&q=${encodeURIComponent(query)}`),
  fileAction: (action, payload = {}) => request("/api/v1/files/action", { method: "POST", body: JSON.stringify({ action, ...payload }) }),
  volumeAction: (action, device) => request("/api/v1/volumes/action", { method: "POST", body: JSON.stringify({ action, device }) }),
  health: () => request("/api/v1/health"),
  personalization: (profile) => request(`/api/v1/personalization?profile=${encodeURIComponent(profile)}`),
  savePersonalization: (profile, preferences) => request("/api/v1/personalization", { method: "POST", body: JSON.stringify({ profile, preferences }) }),
  uploadBackground: async (profile, file) => {
    const response = await fetch(`/api/v1/backgrounds/custom?profile=${encodeURIComponent(profile)}`, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": file.type },
      body: file,
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
    return payload;
  },
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

export function formatBytes(value) {
  if (!Number.isFinite(value)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1000 && index < units.length - 1) { size /= 1000; index += 1; }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}
