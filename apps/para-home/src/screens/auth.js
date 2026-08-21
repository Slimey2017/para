import { content } from "../mock-data.js";
import { brand, hints, listRow, livingBackground } from "../ui/components.js";
import { getState } from "../state.js";

function profileCard(profile, index) {
  const guest = profile.name === "Guest";
  return `<button class="profile-card" data-action="${guest ? "guest-login" : "select-profile"}" data-profile="${profile.name}" ${index === 0 ? "data-autofocus='true'" : ""}><span class="avatar ${profile.color === "blue" ? "avatar--blue" : ""}">${profile.initials}</span><span class="profile-card__name">${profile.name}</span>${guest ? `<span class="profile-card__sub">Play without saving</span>` : `<span class="profile-card__controller"><i></i> Controller 1</span>`}</button>`;
}

export function profilesScreen() {
  return `<section class="screen profile-select">${livingBackground()}<header class="profile-select__top">${brand()}<time data-clock>--:--</time></header><main><h1>Who’s playing?</h1><div class="profile-grid">${content.profiles.map(profileCard).join("")}<button class="profile-card" data-action="add-profile"><span class="avatar avatar--add">＋</span><span class="profile-card__name">Add Profile</span></button></div></main>${hints({ back: false })}</section>`;
}

export function loginScreen() {
  const profile = getState().activeProfile || "Player One";
  const initials = profile === "Player One" ? "P1" : profile.slice(0, 2).toUpperCase();
  return `<section class="screen login-screen">${livingBackground()}<header class="profile-select__top">${brand()}<time data-clock>--:--</time></header><main class="login-card"><span class="avatar login-avatar">${initials}</span><span class="eyebrow">Welcome back</span><h1>${profile}</h1><div class="pin-dots" aria-label="Profile PIN"><i></i><i></i><i></i><i></i></div><button class="action-button login-continue" data-action="profile-login" data-profile="${profile}" data-autofocus="true">Continue</button><div class="login-options">${listRow({ title: "Switch Profile", icon: "↻", route: "profiles" })}${listRow({ title: "Sign-in Options", icon: "⌘", action: "sign-in-options" })}</div></main>${hints()}</section>`;
}
