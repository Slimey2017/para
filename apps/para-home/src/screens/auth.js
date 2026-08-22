import { brand, hints, listRow, livingBackground } from "../ui/components.js";
import { getState } from "../state.js";

const profiles = [
  { name: "Player One", initials: "P1", action: "select-profile" },
  { name: "Guest", initials: "G", action: "guest-login", guest: true },
];

function profileCard(profile, index) {
  return `<button type="button" class="profile-card" data-action="${profile.action}" data-profile="${profile.name}" ${index === 0 ? "data-autofocus='true'" : ""}><span class="avatar ${profile.guest ? "avatar--blue" : ""}">${profile.initials}</span><span class="profile-card__name">${profile.name}</span>${profile.guest ? `<span class="profile-card__sub">Play without saving</span>` : ""}</button>`;
}

export function profilesScreen() {
  return `<section class="screen profile-select">${livingBackground()}<header class="profile-select__top">${brand()}<time data-clock>--:--</time></header><main><h1>Who’s playing?</h1><div class="profile-grid">${profiles.map(profileCard).join("")}</div></main>${hints({ back: false, context: false, options: false })}</section>`;
}

export function loginScreen() {
  const profile = getState().activeProfile || "Player One";
  const initials = profile === "Player One" ? "P1" : profile.slice(0, 2).toUpperCase();
  return `<section class="screen login-screen">${livingBackground()}<header class="profile-select__top">${brand()}<time data-clock>--:--</time></header><main class="login-card"><span class="avatar login-avatar">${initials}</span><span class="eyebrow">Welcome back</span><h1>${profile}</h1><button class="action-button login-continue" data-action="profile-login" data-profile="${profile}" data-autofocus="true">Continue</button><div class="login-options">${listRow({ title: "Switch Profile", icon: "↻", route: "profiles" })}</div></main>${hints({ context: false, options: false })}</section>`;
}
