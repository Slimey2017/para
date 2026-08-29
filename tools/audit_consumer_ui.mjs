globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document = { documentElement: { dataset: {}, style: { setProperty() {} } } };

const { readFile } = await import("node:fs/promises");

const state = await import("../apps/para-home/src/state.js");
const boot = await import("../apps/para-home/src/screens/boot.js");
const auth = await import("../apps/para-home/src/screens/auth.js");
const home = await import("../apps/para-home/src/screens/home.js");
const libraries = await import("../apps/para-home/src/screens/libraries.js");
const files = await import("../apps/para-home/src/screens/files.js");
const system = await import("../apps/para-home/src/screens/system.js");
const personalization = await import("../apps/para-home/src/screens/personalization.js");
const experiences = await import("../apps/para-home/src/screens/experiences.js");
const media = await import("../apps/para-home/src/screens/media.js");

const renderers = {
  startup: boot.startupScreen,
  intro: boot.introScreen,
  profiles: auth.profilesScreen,
  "create-profile": auth.createProfileScreen,
  login: auth.loginScreen,
  home: home.homeScreen,
  apps: libraries.appsScreen,
  games: experiences.gamesScreen,
  "media-gallery": media.mediaGalleryScreen,
  achievements: media.achievementsScreen,
  demos: experiences.demosScreen,
  parastore: experiences.paraStoreScreen,
  creator: experiences.creatorScreen,
  community: experiences.communityScreen,
  marks: experiences.marksScreen,
  "demo-pong": () => experiences.gameScreen("demo-pong"),
  "demo-racer": () => experiences.gameScreen("demo-racer"),
  "demo-platformer": () => experiences.gameScreen("demo-platformer"),
  files: files.filesScreen,
  downloads: files.downloadsScreen,
  controller: system.controllerScreen,
  "para-input": system.paraInputScreen,
  storage: system.storageScreen,
  settings: system.settingsScreen,
  display: system.displayScreen,
  "audio-settings": system.audioSettingsScreen,
  accessibility: system.accessibilityScreen,
  network: system.networkScreen,
  notifications: system.notificationsScreen,
  about: system.aboutScreen,
  "para-lab": system.paraLabScreen,
  "reset-para": system.resetParaScreen,
  account: system.accountScreen,
  power: system.powerScreen,
  health: system.healthScreen,
  recovery: system.recoveryScreen,
  personalization: personalization.personalizationScreen,
  background: personalization.backgroundScreen,
  "control-center-settings": personalization.controlCenterSettingsScreen,
};

const banned = [
  /\bmock\b/i, /\bstub\b/i, /\bprototype\b/i, /development mode/i, /local-only/i,
  /\bfrontend\b/i, /\bbackend\b/i, /\bsimulated\b/i, /placeholder warnings?/i,
  /no commerce/i, /authentication not implemented/i, /future integration/i,
  /networkmanager/i, /compositor/i, /engineering\/debug/i,
];

const failures = [];
const renderedActions = new Set();
function audit(name, html) {
  const visibleText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const pattern of banned) if (pattern.test(visibleText)) failures.push(`${name}: ${pattern}`);
  const deadActions = [...html.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]).filter((action) => /unavailable|placeholder/i.test(action));
  if (deadActions.length) failures.push(`${name}: dead actions ${deadActions.join(", ")}`);
  for (const match of html.matchAll(/data-action="([^"]+)"/g)) renderedActions.add(match[1]);
}

for (const [name, render] of Object.entries(renderers)) audit(name, render());
for (let setupStep = 0; setupStep < boot.SETUP_CHAPTERS.length; setupStep += 1) {
  state.setState({ setupStep });
  audit(`setup:${setupStep + 1}`, boot.setupScreen());
}

const actionController = await readFile(new URL("../apps/para-home/src/app.js", import.meta.url), "utf8");
for (const action of renderedActions) {
  if (!actionController.includes(`case "${action}"`)) failures.push(`unhandled action: ${action}`);
}

if (failures.length) {
  console.error(`Consumer UI audit failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`Consumer UI audit passed: ${Object.keys(renderers).length + boot.SETUP_CHAPTERS.length} rendered states`);
