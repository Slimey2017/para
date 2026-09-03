export const PARA_SYSTEM_APPS = Object.freeze([
  { id: "para:friends", name: "Friends", category: "Social", route: "friends", icon: "friends", description: "Friends, chat, presence, and parties" },
  { id: "para:achievements", name: "Achievements", category: "Games", route: "achievements", icon: "achievements", description: "Game trophies and progress" },
  { id: "para:media-gallery", name: "Media Gallery", category: "Media", route: "media-gallery", icon: "media", description: "Screenshots and gameplay videos" },
  { id: "para:music", name: "Music", category: "Media", route: "music", icon: "music", description: "Play local music files" },
  { id: "para:files", name: "Files", category: "Tools", route: "files", icon: "files", description: "PARA files and storage" },
  { id: "para:parastore", name: "ParaStore", category: "Store", route: "parastore", icon: "store", description: "Discover games and apps" },
  { id: "para:settings", name: "Settings", category: "System", route: "settings", icon: "settings", description: "System, account, and accessibility" },
]);

export function systemApplicationRecords() {
  return PARA_SYSTEM_APPS.map((app) => ({ ...app, launch: { kind: "route", route: app.route } }));
}
