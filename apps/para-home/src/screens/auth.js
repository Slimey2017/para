import { brand, hints, listRow, livingBackground } from "../ui/components.js";
import { getState } from "../state.js";
import { escapeHtml } from "../services/para-api.js";

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
}

function profileCard(profile, index) {
  return `<button type="button" class="profile-card" data-action="${profile.action}" data-profile="${escapeHtml(profile.name)}" ${index === 0 ? "data-autofocus='true'" : ""}><span class="avatar ${profile.guest ? "avatar--blue" : ""}">${escapeHtml(profile.initials)}</span><span class="profile-card__name">${escapeHtml(profile.name)}</span>${profile.guest ? `<span class="profile-card__sub">Play without saving</span>` : ""}</button>`;
}

export function profilesScreen() {
  const profiles = getState().profiles.map((name) => ({ name, initials: initials(name), action: "select-profile" }));
  profiles.push({ name: "Guest", initials: "G", action: "guest-login", guest: true });
  return `<section class="screen profile-select">${livingBackground()}<header class="profile-select__top">${brand()}<time data-clock>--:--</time></header><main><h1>Who’s playing?</h1><div class="profile-grid">${profiles.map(profileCard).join("")}<button type="button" class="profile-card profile-card--add" data-route="create-profile"><span class="avatar">+</span><span class="profile-card__name">Add User</span></button></div></main>${hints({ back: false, context: false, options: false })}</section>`;
}

export function createProfileScreen() {
  return `<section class="screen login-screen">${livingBackground()}<header class="profile-select__top">${brand()}<time data-clock>--:--</time></header><main class="login-card create-profile-card"><span class="avatar login-avatar">+</span><span class="eyebrow">New profile</span><h1>Add User</h1><label class="profile-name-field"><span>Name</span><input type="text" maxlength="24" autocomplete="off" data-new-profile-name data-autofocus="true" /></label><button class="action-button login-continue" data-action="create-profile">Create Profile</button><div class="login-options">${listRow({ title: "Cancel", icon: "↻", route: "profiles" })}</div></main>${hints({ context: false, options: false })}</section>`;
}

export function loginScreen() {
  const profile = getState().activeProfile || "P1";
  return `<section class="screen login-screen">${livingBackground()}<header class="profile-select__top">${brand()}<time data-clock>--:--</time></header><main class="login-card"><span class="avatar login-avatar">${escapeHtml(initials(profile))}</span><span class="eyebrow">Welcome back</span><h1>${escapeHtml(profile)}</h1><button class="action-button login-continue" data-action="profile-login" data-profile="${escapeHtml(profile)}" data-autofocus="true">Continue</button><div class="login-options">${listRow({ title: "Switch Profile", icon: "↻", route: "profiles" })}</div></main>${hints({ context: false, options: false })}</section>`;
}
