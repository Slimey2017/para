async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Accept": "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    signal: AbortSignal.timeout(4000),
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `Request failed: ${response.status}`);
    error.code = payload.error || "request_failed";
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export const paraApi = {
  capabilities: () => request("/api/v1/capabilities"),
  authSession: () => request("/api/v1/auth/session"),
  authSignIn: (email, password) => request("/api/v1/auth/signin", { method: "POST", body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(12_000) }),
  authSignUp: (displayName, email, password) => request("/api/v1/auth/signup", { method: "POST", body: JSON.stringify({ display_name: displayName, email, password }), signal: AbortSignal.timeout(12_000) }),
  authRequestPasswordRecovery: (email) => request("/api/v1/auth/recovery/request", { method: "POST", body: JSON.stringify({ email }), signal: AbortSignal.timeout(12_000) }),
  authCompletePasswordRecovery: (accessToken, refreshToken, expiresIn, password) => request("/api/v1/auth/recovery/complete", { method: "POST", body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, password }), signal: AbortSignal.timeout(12_000) }),
  authSignOut: () => request("/api/v1/auth/signout", { method: "POST", body: JSON.stringify({}) }),
  authUpdateProfile: (displayName) => request("/api/v1/auth/profile", { method: "POST", body: JSON.stringify({ display_name: displayName }) }),
  authUpdatePassword: (password) => request("/api/v1/auth/password", { method: "POST", body: JSON.stringify({ password }) }),
  authRequestVerification: (email) => request("/api/v1/auth/verification/request", { method: "POST", body: JSON.stringify({ email }), signal: AbortSignal.timeout(12_000) }),
  authVerifyEmail: (email, code) => request("/api/v1/auth/verification/verify", { method: "POST", body: JSON.stringify({ email, code }), signal: AbortSignal.timeout(12_000) }),
  steamStatus: () => request("/api/v1/integrations/steam/status", { signal: AbortSignal.timeout(12_000) }),
  steamDisconnect: () => request("/api/v1/integrations/steam/disconnect", { method: "POST", body: JSON.stringify({}), signal: AbortSignal.timeout(12_000) }),
  googleStatus: () => request("/api/v1/integrations/google/status", { signal: AbortSignal.timeout(12_000) }),
  googleDisconnect: () => request("/api/v1/integrations/google/disconnect", { method: "POST", body: JSON.stringify({}), signal: AbortSignal.timeout(12_000) }),
  youtubeUploadCapture: (file, { title, description = "", privacy = "private", madeForKids, tags = [], categoryId = "20", publishAt = "", thumbnailPending = false } = {}, onProgress = null) => new Promise((resolve, reject) => {
    const query = new URLSearchParams({
      title: String(title || ""),
      description: String(description || ""),
      privacy: String(privacy || "private"),
      made_for_kids: madeForKids ? "true" : "false",
      tags: Array.isArray(tags) ? tags.join(",") : String(tags || ""),
      category_id: String(categoryId || "20"),
      publish_at: String(publishAt || ""),
      thumbnail_pending: thumbnailPending ? "true" : "false",
    });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/v1/integrations/google/youtube/upload?${query}`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", file.type || "video/webm");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.((event.loaded / event.total) * 100, event.loaded, event.total);
    };
    xhr.onerror = () => {
      const error = new Error("The connection to PARA was interrupted during the YouTube upload.");
      error.code = "youtube_upload_network_error";
      reject(error);
    };
    xhr.onload = () => {
      let payload = {};
      try { payload = JSON.parse(xhr.responseText || "{}"); } catch {}
      if (xhr.status < 200 || xhr.status >= 300) {
        const error = new Error(payload.message || payload.error || `YouTube upload failed: ${xhr.status}`);
        error.code = payload.error || "youtube_upload_failed";
        error.status = xhr.status;
        error.payload = payload;
        reject(error);
        return;
      }
      onProgress?.(100, file.size, file.size);
      resolve(payload);
    };
    xhr.send(file);
  }),
  youtubeSetThumbnail: async (videoId, imageBlob) => {
    const response = await fetch(`/api/v1/integrations/google/youtube/thumbnail?video_id=${encodeURIComponent(String(videoId || ""))}`, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": imageBlob?.type || "image/jpeg" },
      body: imageBlob,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || payload.error || `Thumbnail upload failed: ${response.status}`);
      error.code = payload.error || "youtube_thumbnail_failed";
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  },
  applications: () => request("/api/v1/apps"),
  storeCatalog: () => request("/api/v1/store/catalog"),
  storeProduct: (id) => request(`/api/v1/store/product?id=${encodeURIComponent(id)}`),
  storeAchievements: (id) => request(`/api/v1/store/achievements?id=${encodeURIComponent(id)}`),
  storeCheckoutQuote: (ids) => request("/api/v1/store/checkout/quote", { method: "POST", body: JSON.stringify({ ids }) }),
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
    if (!response.ok) throw new Error(payload.message || payload.error || `Request failed: ${response.status}`);
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
