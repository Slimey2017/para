import { getProfileRuntime, getState, setProfileRuntime } from "../state.js";
import { demoById } from "./demo-catalog.js";

const INSTALL_DURATION_MS = 10_000;

function emit() {
  document.dispatchEvent(new CustomEvent("para-runtimechange"));
}

export function recordExperience(experience) {
  if (!experience?.id || !experience?.route) return;
  const runtime = getProfileRuntime();
  const entry = { ...experience, lastOpened: Date.now() };
  const recent = [entry, ...runtime.recent.filter((item) => item.id !== entry.id)].slice(0, 12);
  const running = [entry, ...runtime.running.filter((item) => item.id !== entry.id)].slice(0, 6);
  const marks = [...runtime.marks];
  const notifications = [...runtime.notifications];
  if (experience.kind === "Game" && !marks.some((mark) => mark.id === "first-pulse")) {
    const mark = { id: "first-pulse", title: "First Pulse", description: "Opened your first PARA demo.", earnedAt: Date.now() };
    marks.unshift(mark);
    notifications.unshift({ id: "mark:first-pulse", title: "Mark earned · First Pulse", createdAt: mark.earnedAt, route: "marks" });
    document.dispatchEvent(new CustomEvent("para-markearned", { detail: mark }));
  }
  setProfileRuntime({ recent, running, marks, notifications: notifications.slice(0, 20) });
  emit();
}

export function recentExperience() {
  return refreshDemoDownloads().recent[0] || null;
}

export function recentExperiences() {
  return refreshDemoDownloads().recent;
}

export function runningExperiences() {
  return refreshDemoDownloads().running;
}

export function installedDemos() {
  const runtime = refreshDemoDownloads();
  return runtime.installedDemos.map(demoById).filter(Boolean);
}

export function startDemoInstall(id) {
  const demo = demoById(id);
  if (!demo) return false;
  const runtime = refreshDemoDownloads();
  if (runtime.installedDemos.includes(id) || runtime.downloads.some((item) => item.id === id && item.status === "downloading")) return false;
  const download = { id, title: demo.name, startedAt: Date.now(), durationMs: INSTALL_DURATION_MS, status: "downloading" };
  setProfileRuntime({ downloads: [download, ...runtime.downloads].slice(0, 8) });
  emit();
  return true;
}

export function removeDemo(id) {
  const runtime = refreshDemoDownloads();
  setProfileRuntime({
    installedDemos: runtime.installedDemos.filter((item) => item !== id),
    recent: runtime.recent.filter((item) => item.id !== `demo:${id}`),
    running: runtime.running.filter((item) => item.id !== `demo:${id}`),
  });
  emit();
}

export function refreshDemoDownloads(now = Date.now()) {
  const runtime = getProfileRuntime();
  let changed = false;
  const installed = new Set(runtime.installedDemos);
  const notifications = [...runtime.notifications];
  const downloads = runtime.downloads.map((item) => {
    if (item.status !== "downloading") return item;
    const progress = Math.max(0, Math.min(100, Math.floor(((now - item.startedAt) / item.durationMs) * 100)));
    if (progress < 100) return { ...item, progress };
    changed = true;
    installed.add(item.id);
    if (!notifications.some((note) => note.id === `installed:${item.id}`)) {
      notifications.unshift({ id: `installed:${item.id}`, title: `${item.title} is ready`, createdAt: now, route: demoById(item.id)?.route || "games" });
    }
    return { ...item, status: "complete", progress: 100, completedAt: now };
  });
  if (changed) {
    const next = setProfileRuntime({ installedDemos: [...installed], downloads, notifications: notifications.slice(0, 20) });
    emit();
    document.dispatchEvent(new CustomEvent("para-downloadcomplete", { detail: { downloads: downloads.filter((item) => item.status === "complete" && item.completedAt === now) } }));
    return next;
  }
  return { ...runtime, downloads };
}

export function activeDownloads() {
  return refreshDemoDownloads().downloads.filter((item) => item.status === "downloading");
}

export function demoStorageBytes() {
  return installedDemos().reduce((total, demo) => total + demo.sizeBytes, 0);
}

export function profileRuntime() {
  return refreshDemoDownloads();
}

export function clearNotification(id) {
  const runtime = getProfileRuntime();
  setProfileRuntime({ notifications: runtime.notifications.filter((item) => item.id !== id) });
  emit();
}

export function currentProfileName() {
  return getState().activeProfile || "P1";
}
