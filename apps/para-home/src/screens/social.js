import { mock } from "../mock-data.js";
import { page, tile, listRow, stubNotice } from "../ui/components.js";

export function socialScreen() {
  const body = `<div class="tile-grid tile-grid--wide">${tile({ title: "Friends", meta: "Presence is development-only mock data", action: "social-stub", icon: "◎", badge: "Mock", className: "tile--hero", art: true, autofocus: true })}${tile({ title: "Start a party", meta: "Voice backend is not connected", action: "party-stub", icon: "+", badge: "Stub" })}${tile({ title: "Calls", meta: "Audio/video service boundary", route: "calls", icon: "⌕", badge: "Stub" })}${tile({ title: "Invitations", meta: "No pending mock invitations", action: "social-stub", icon: "↗", badge: "Mock" })}</div><div class="panel" style="margin-top:22px"><div class="panel__head"><h3>Friends</h3><span class="badge badge--preview">Mock presence</span></div><div class="list">${mock.friends.map((friend) => listRow({ ...friend, action: "social-stub" })).join("")}</div></div>`;
  return page({ title: "Social", description: "Friends, parties, invitations, and communication share one clear service boundary.", eyebrow: "Parties & friends · Mock", body });
}

export function callsScreen() {
  const body = `${stubNotice("Calls and communications")}<div class="tile-grid tile-grid--wide" style="margin-top:22px">${tile({ title: "Start a call", meta: "Requires identity, contacts, WebRTC signaling, consent, and moderation", action: "calls-stub", icon: "⌕", badge: "Unavailable", autofocus: true, disabled: true })}${tile({ title: "Recent", meta: "No real call history is stored", action: "calls-stub", icon: "↻", badge: "Mock" })}${tile({ title: "Safety controls", meta: "Blocking and reporting service boundary", action: "calls-stub", icon: "◇", badge: "Planned" })}</div>`;
  return page({ title: "Calls", description: "A reserved console calling surface. It does not capture audio, video, contacts, or call history.", eyebrow: "Communication · Stub", body });
}

