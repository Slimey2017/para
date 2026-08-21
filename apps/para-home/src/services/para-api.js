async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Accept": "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(4000),
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

export const paraApi = {
  applications: () => request("/api/v1/apps"),
  launchApplication: (id) => request("/api/v1/apps/launch", { method: "POST", body: JSON.stringify({ id }) }),
  system: () => request("/api/v1/system"),
  storage: () => request("/api/v1/storage"),
  network: () => request("/api/v1/network"),
  directories: () => request("/api/v1/directories"),
  collection: (id) => request(`/api/v1/files?collection=${encodeURIComponent(id)}`),
  health: () => request("/api/v1/health"),
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
