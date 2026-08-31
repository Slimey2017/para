import { brand, hints, listRow, livingBackground } from "../ui/components.js";
import { getState } from "../state.js";
import { escapeHtml } from "../services/para-api.js";
import { knownParaAccount } from "../services/account-memory.js";

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


export function accountSignInScreen() {
  const known = knownParaAccount();
  const rememberedEmail = sessionStorage.getItem("para.account.signin.email") || known?.email || "";
  sessionStorage.removeItem("para.account.signin.email");
  const createdCopy = known ? `<p class="account-created-notice">✓ PARA Account created${known.verified ? " and verified" : ""}. Sign in to connect it to this console.</p>` : "";
  return `<section class="screen login-screen">${livingBackground()}<header class="profile-select__top">${brand()}<time data-clock>--:--</time></header><main class="login-card para-account-card"><span class="avatar login-avatar">P</span><span class="eyebrow">PARA Account</span><h1>Sign in</h1><p class="account-auth-copy">Use your PARA Account for identity, cloud-ready services, purchases, friends, and future cross-device sync.</p>${createdCopy}<form class="account-auth-form" data-account-signin-form><label><span>Email</span><input type="email" autocomplete="email" inputmode="email" value="${escapeHtml(rememberedEmail)}" data-account-email data-autofocus="true" required /></label><label><span>Password</span><input type="password" autocomplete="current-password" minlength="8" data-account-password required /></label><button type="submit" class="action-button login-continue" data-action="account-signin-submit">Sign In</button></form><p class="account-auth-status" data-account-auth-status aria-live="polite"></p><div class="login-options">${listRow({ title: "Create PARA Account", icon: "+", route: "account-signup" })}${listRow({ title: "Back", icon: "↻", action: "account-auth-back" })}</div></main>${hints({ context: false, options: false })}</section>`;
}

export function accountSignUpScreen() {
  return `<section class="screen login-screen">${livingBackground()}<header class="profile-select__top">${brand()}<time data-clock>--:--</time></header><main class="login-card para-account-card"><span class="avatar login-avatar">+</span><span class="eyebrow">PARA Account</span><h1>Create account</h1><p class="account-auth-copy">Create one PARA identity for this console and future PARA devices.</p><form class="account-auth-form" data-account-signup-form><label><span>Display name</span><input type="text" maxlength="32" autocomplete="nickname" data-account-display-name data-autofocus="true" required /></label><label><span>Email</span><input type="email" autocomplete="email" inputmode="email" data-account-email required /></label><label><span>Password</span><input type="password" autocomplete="new-password" minlength="8" data-account-password required /></label><label><span>Confirm password</span><input type="password" autocomplete="new-password" minlength="8" data-account-password-confirm required /></label><button type="submit" class="action-button login-continue" data-action="account-signup-submit">Create Account</button></form><p class="account-auth-status" data-account-auth-status aria-live="polite"></p><div class="login-options">${listRow({ title: "Already have an account", icon: "↗", route: "account-signin" })}${listRow({ title: "Back", icon: "↻", action: "account-auth-back" })}</div></main>${hints({ context: false, options: false })}</section>`;
}

export function accountVerifyScreen() {
  const pendingEmail = sessionStorage.getItem("para.account.verify.email") || "your email";
  return `<section class="screen login-screen">${livingBackground()}<header class="profile-select__top">${brand()}<time data-clock>--:--</time></header><main class="login-card para-account-card para-verification-card"><span class="avatar login-avatar">✓</span><span class="eyebrow">PARA Protection Services</span><h1>Verify your email</h1><p class="account-auth-copy">We sent a 6-digit verification code to <strong>${escapeHtml(pendingEmail)}</strong>. Enter it below to finish protecting your PARA Account.</p><form class="account-auth-form" data-account-verify-form><label><span>Verification code</span><input class="verification-code-input" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" data-account-verification-code data-autofocus="true" required /></label><button type="submit" class="action-button login-continue" data-action="account-verify-submit">Verify Email</button></form><p class="account-auth-status" data-account-auth-status aria-live="polite"></p><div class="login-options">${listRow({ title: "Resend code", icon: "↻", action: "account-verification-resend" })}${listRow({ title: "Back to Sign In", icon: "←", route: "account-signin" })}</div></main>${hints({ context: false, options: false })}</section>`;
}
