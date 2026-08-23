const DATABASE = "para-profile-assets";
const STORE = "backgrounds";
let databasePromise = null;
const activeUrls = new Map();

function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB unavailable"));
  databasePromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function transaction(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveBrowserBackground(profile, file) {
  if (!(file instanceof Blob) || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Unsupported image");
  await transaction("readwrite", (store) => store.put(file, profile));
  return Date.now();
}

export async function applyBrowserBackground(profile) {
  const blob = await transaction("readonly", (store) => store.get(profile));
  if (!(blob instanceof Blob)) return false;
  if (activeUrls.has(profile)) URL.revokeObjectURL(activeUrls.get(profile));
  const url = URL.createObjectURL(blob);
  activeUrls.set(profile, url);
  document.documentElement.style.setProperty("--profile-wallpaper-image", `url("${url}")`);
  document.documentElement.style.setProperty("--profile-wallpaper-color", "#030208");
  return true;
}

export async function clearProfileAssets() {
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).clear();
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  activeUrls.forEach((url) => URL.revokeObjectURL(url));
  activeUrls.clear();
}
