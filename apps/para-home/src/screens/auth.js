import { mock } from "../mock-data.js";
import { brand, hints, listRow } from "../ui/components.js";

function profileCard(profile, action, index) {
  return `<button class="profile-card" data-action="${action}" data-profile="${profile.name}" ${index === 0 ? "data-autofocus='true'" : ""}>
    <span class="avatar">${profile.initials}</span><span class="profile-card__name">${profile.name}</span><span class="muted">${profile.state}</span><span class="badge">Controller ${profile.controller}</span>
  </button>`;
}

export function profilesScreen() {
  return `<section class="screen screen--center">
    ${brand()}<div><span class="eyebrow">Local profile shell</span><h1 style="margin-top:18px">Who’s playing?</h1><p class="lede" style="margin-inline:auto">Profiles below are mock local entries. No real authentication or profile security is active.</p></div>
    <div class="profile-grid">${mock.profiles.map((profile, index) => profileCard(profile, profile.name === "Guest" ? "guest-login" : "profile-login", index)).join("")}
      <button class="profile-card" data-action="add-profile"><span class="avatar" style="background:rgba(255,255,255,.07)">＋</span><span class="profile-card__name">Add profile</span><span class="muted">Account backend required</span><span class="badge badge--preview">Stub</span></button>
    </div>${hints({ back: false })}
  </section>`;
}

export function loginScreen() {
  return `<section class="screen screen--center">
    <div class="setup-shell" style="grid-template-columns:1fr 1fr;min-height:540px">
      <div class="setup-content" style="background:linear-gradient(145deg,rgba(157,92,255,.2),transparent)">${brand()}<div><div class="avatar" style="width:150px;height:150px">P1</div><h1 style="margin-top:28px">Welcome back.</h1><p class="lede">Local development sign-in for Player One.</p></div><span class="micro">Authentication is deliberately stubbed. Do not use a real password or PIN.</span></div>
      <div class="setup-content"><div><span class="eyebrow">Sign in</span><h2 style="margin-top:20px">Choose a safe prototype action</h2><div class="list" style="margin-top:28px">
        ${listRow({ title: "Continue locally", meta: "No credential check · development only", icon: "→", action: "profile-login", autofocus: true })}
        ${listRow({ title: "Use profile PIN", meta: "Not implemented — no fake security", icon: "••", action: "pin-stub" })}
        ${listRow({ title: "Account recovery", meta: "Backend and verified recovery channel required", icon: "↻", action: "recovery-stub" })}
        ${listRow({ title: "Switch profile", meta: "Return to profile selection", icon: "◎", route: "profiles" })}
      </div></div>${hints()}</div>
    </div>
  </section>`;
}
