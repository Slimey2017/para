// Every user-facing route lives here so navigation, tests, and documentation share one source.
export const screens = [
  { id: "startup", label: "Startup launcher", group: "boot" },
  { id: "intro", label: "First-boot intro", group: "boot" },
  { id: "setup", label: "Setup wizard", group: "boot" },
  { id: "login", label: "Login", group: "identity" },
  { id: "profiles", label: "Profile selection", group: "identity" },
  { id: "home", label: "PARA Home", group: "home" },
  { id: "games", label: "Game library", group: "library" },
  { id: "apps", label: "Apps library", group: "library" },
  { id: "store", label: "ParaStore", group: "library" },
  { id: "bear-home", label: "Bear Home", group: "library" },
  { id: "creator", label: "Creator Mode", group: "library" },
  { id: "calls", label: "Calls", group: "social" },
  { id: "social", label: "Parties & friends", group: "social" },
  { id: "notifications", label: "Notifications", group: "system" },
  { id: "downloads", label: "Downloads", group: "system" },
  { id: "quick", label: "Quick menu", group: "system" },
  { id: "controller", label: "Controller pairing", group: "system" },
  { id: "storage", label: "Storage management", group: "system" },
  { id: "settings", label: "System settings", group: "system" },
  { id: "accessibility", label: "Accessibility", group: "system" },
  { id: "network", label: "Network settings", group: "system" },
  { id: "account", label: "Account settings", group: "system" },
  { id: "subscription", label: "Subscription", group: "system" },
  { id: "power", label: "Power menu", group: "system" },
  { id: "recovery", label: "Recovery menu", group: "system" },
];

export const screenIds = new Set(screens.map((screen) => screen.id));

