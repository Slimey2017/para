globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document = { documentElement: { dataset: {} } };

const state = await import("../apps/para-home/src/state.js");
const boot = await import("../apps/para-home/src/screens/boot.js");
const auth = await import("../apps/para-home/src/screens/auth.js");
const home = await import("../apps/para-home/src/screens/home.js");
const libraries = await import("../apps/para-home/src/screens/libraries.js");
const social = await import("../apps/para-home/src/screens/social.js");
const system = await import("../apps/para-home/src/screens/system.js");

const renderers = {
  startup: boot.startupScreen, intro: boot.introScreen, profiles: auth.profilesScreen,
  login: auth.loginScreen, home: home.homeScreen, games: libraries.gamesScreen,
  apps: libraries.appsScreen, store: libraries.storeScreen, "bear-home": libraries.bearHomeScreen,
  creator: libraries.creatorScreen, social: social.socialScreen, calls: social.callsScreen,
  notifications: system.notificationsScreen, downloads: system.downloadsScreen, quick: system.quickScreen,
  controller: system.controllerScreen, storage: system.storageScreen, settings: system.settingsScreen,
  display: system.displayScreen, accessibility: system.accessibilityScreen, network: system.networkScreen,
  audio: system.audioScreen, privacy: system.privacyScreen, account: system.accountScreen,
  subscription: system.subscriptionScreen, vrus: system.vrusScreen, updates: system.updatesScreen,
  power: system.powerScreen, health: system.healthScreen, recovery: system.recoveryScreen,
};

const banned = [
  /\bmock\b/i, /\bstub\b/i, /\bprototype\b/i, /development mode/i, /local-only/i,
  /\bfrontend\b/i, /\bbackend\b/i, /\bsimulated\b/i, /placeholder warnings?/i,
  /no commerce/i, /authentication not implemented/i, /future integration/i,
  /networkmanager/i, /compositor/i, /engineering\/debug/i, /a confirm/i, /b back/i,
];

const failures = [];
function audit(name, html) {
  const visibleText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const pattern of banned) if (pattern.test(visibleText)) failures.push(`${name}: ${pattern}`);
}

for (const [name, render] of Object.entries(renderers)) audit(name, render());
for (let setupStep = 0; setupStep < 7; setupStep += 1) {
  state.setState({ setupStep });
  audit(`setup:${setupStep + 1}`, boot.setupScreen());
}

if (failures.length) {
  console.error(`Consumer UI audit failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`Consumer UI audit passed: ${Object.keys(renderers).length + 7} rendered states`);
