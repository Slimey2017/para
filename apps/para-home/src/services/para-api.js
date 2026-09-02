const API_MAX_CONCURRENT_REQUESTS = 4;
const API_DEFAULT_TIMEOUT_MS = 4_000;
const API_MAX_429_RETRIES = 3;
const API_CACHE_DEFAULT_TTL_MS = 750;
const apiQueue = [];
const apiInFlight = new Map();
const apiCache = new Map();
let apiActiveRequests = 0;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function pumpApiQueue() {
  while (apiActiveRequests < API_MAX_CONCURRENT_REQUESTS && apiQueue.length) {
    const entry = apiQueue.shift();
    apiActiveRequests += 1;
    Promise.resolve()
      .then(entry.task)
      .then(entry.resolve, entry.reject)
      .finally(() => {
        apiActiveRequests = Math.max(0, apiActiveRequests - 1);
        pumpApiQueue();
      });
  }
}

function queueApiRequest(task) {
  return new Promise((resolve, reject) => {
    apiQueue.push({ task, resolve, reject });
    pumpApiQueue();
  });
}

function retryAfterMs(response, attempt) {
  const raw = String(response?.headers?.get?.("Retry-After") || "").trim();
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1000);
    const absolute = Date.parse(raw);
    if (Number.isFinite(absolute)) return Math.min(30_000, Math.max(0, absolute - Date.now()));
  }
  // Keep retries gentle enough to avoid a synchronized request stampede.
  const backoff = Math.min(8_000, 650 * (2 ** Math.max(0, attempt)));
  return backoff + Math.floor(Math.random() * 250);
}

function cacheTtlFor(path, explicit) {
  if (Number.isFinite(explicit)) return Math.max(0, Number(explicit));
  if (path.startsWith("/api/v1/auth/")) return 0;
  if (path.startsWith("/api/v1/integrations/")) return 1_500;
  if (path === "/api/v1/store/catalog") return 10_000;
  if (path.startsWith("/api/v1/store/product")) return 30_000;
  if (path.startsWith("/api/v1/store/achievements")) return 10_000;
  if (path === "/api/v1/capabilities") return 5_000;
  if (/^\/api\/v1\/(system|storage|network|audio|apps|directories)(?:\?|$)/.test(path)) return 1_500;
  return API_CACHE_DEFAULT_TTL_MS;
}

function requestKey(method, path, body = "") {
  return `${method}:${path}:${typeof body === "string" ? body : ""}`;
}

async function rawFetchWithPolicy(path, options = {}, { retry429 = false, timeoutMs = API_DEFAULT_TIMEOUT_MS } = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const maxRetries = retry429 ? API_MAX_429_RETRIES : 0;
  let lastResponse = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const signal = options.signal || AbortSignal.timeout(timeoutMs);
    const response = await queueApiRequest(() => fetch(path, { ...options, method, signal }));
    lastResponse = response;
    if (response.status !== 429 || attempt >= maxRetries) return response;
    await wait(retryAfterMs(response, attempt));
  }
  return lastResponse;
}

async function request(path, options = {}) {
  const {
    cacheTtl,
    dedupe,
    retry429,
    timeoutMs = API_DEFAULT_TIMEOUT_MS,
    ...fetchOptions
  } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const body = fetchOptions.body || "";
  const key = requestKey(method, path, body);
  const safeRead = method === "GET" || method === "HEAD";
  const shouldDedupe = dedupe == null ? safeRead : Boolean(dedupe);
  const ttl = safeRead ? cacheTtlFor(path, cacheTtl) : 0;

  if (safeRead && ttl > 0) {
    const cached = apiCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.payload;
    if (cached) apiCache.delete(key);
  }

  if (shouldDedupe && apiInFlight.has(key)) return apiInFlight.get(key);

  const operation = (async () => {
    const maxRetries = retry429 === false
      ? 0
      : Number.isFinite(retry429)
        ? Math.max(0, Math.min(API_MAX_429_RETRIES, Number(retry429)))
        : safeRead ? API_MAX_429_RETRIES : 0;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const headers = {
        "Accept": "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(fetchOptions.headers || {}),
      };
      const signal = fetchOptions.signal || AbortSignal.timeout(timeoutMs);
      const { response, payload } = await queueApiRequest(async () => {
        const response = await fetch(path, {
          ...fetchOptions,
          method,
          headers,
          signal,
        });
        let payload = {};
        try { payload = await response.json(); } catch {}
        return { response, payload };
      });

      if (response.status === 429 && attempt < maxRetries) {
        await wait(retryAfterMs(response, attempt));
        continue;
      }

      if (!response.ok) {
        const error = new Error(payload.message || payload.error || `Request failed: ${response.status}`);
        error.code = payload.error || (response.status === 429 ? "rate_limited" : "request_failed");
        error.status = response.status;
        error.payload = payload;
        error.retryAfterMs = response.status === 429 ? retryAfterMs(response, attempt) : 0;
        throw error;
      }

      if (safeRead && ttl > 0) {
        apiCache.set(key, { payload, expiresAt: Date.now() + ttl });
      } else if (!safeRead) {
        // Mutations can change data shown by any system app. Clear short-lived
        // GET snapshots instead of letting a stale screen trigger another burst.
        apiCache.clear();
      }
      return payload;
    }
    throw new Error("PARA request retry loop ended unexpectedly.");
  })();

  if (shouldDedupe) apiInFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    if (shouldDedupe && apiInFlight.get(key) === operation) apiInFlight.delete(key);
  }
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
    const response = await rawFetchWithPolicy(`/api/v1/integrations/google/youtube/thumbnail?video_id=${encodeURIComponent(String(videoId || ""))}`, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": imageBlob?.type || "image/jpeg" },
      body: imageBlob,
    }, { timeoutMs: 30_000 });
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
  achievementProgress: () => request("/api/v1/achievements/progress", { signal: AbortSignal.timeout(12_000) }),
  unlockAchievement: (projectId, achievementKey) => request("/api/v1/achievements/unlock", { method: "POST", body: JSON.stringify({ project_id: projectId, achievement_key: achievementKey }), signal: AbortSignal.timeout(12_000) }),
  setAchievementProgress: (projectId, achievementKey, progress) => request("/api/v1/achievements/progress", { method: "POST", body: JSON.stringify({ project_id: projectId, achievement_key: achievementKey, progress }), signal: AbortSignal.timeout(12_000) }),
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
    const response = await rawFetchWithPolicy(`/api/v1/backgrounds/custom?profile=${encodeURIComponent(profile)}`, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": file.type },
      body: file,
      signal: AbortSignal.timeout(12_000),
    }, { timeoutMs: 12_000 });
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
