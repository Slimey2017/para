import { getProfilePreferences, getState } from "../state.js";
import { paraApi, escapeHtml } from "../services/para-api.js";

const definitions = {
  home: { title: "Home", icon: "⌂", route: "home" },
  network: { title: "Network", icon: "⌁", route: "network" },
  audio: { title: "Audio", icon: "◖" },
  microphone: { title: "Microphone", icon: "◉" },
  controllers: { title: "Controllers", icon: "◇", route: "controller" },
  profile: { title: "Profile", icon: "●", route: "account" },
  settings: { title: "Quick Settings", icon: "⚙", route: "settings" },
  power: { title: "Power", icon: "○", route: "power" },
};

function simpleItem(id, definition, meta = "") {
  return `<button class="control-center-item" data-route="${definition.route}" data-control-center-id="${id}"><span class="control-center-item__icon">${definition.icon}</span><span><strong>${definition.title}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</span></button>`;
}

function audioItem(audio) {
  const output = audio.output;
  return `<label class="control-center-item control-center-item--range" data-control-center-id="audio"><span class="control-center-item__icon">${definitions.audio.icon}</span><span><strong>Audio</strong><small><output data-audio-output>${output.volume}%</output></small></span><input type="range" min="0" max="100" step="2" value="${output.volume}" aria-label="Audio volume" data-audio-volume /></label>`;
}

function microphoneItem(audio) {
  const microphone = audio.microphone;
  return `<button class="control-center-item" data-action="toggle-microphone" data-microphone-muted="${microphone.muted}" data-control-center-id="microphone"><span class="control-center-item__icon">${definitions.microphone.icon}</span><span><strong>Microphone</strong><small>${microphone.muted ? "Muted" : `${microphone.volume}%`}</small></span></button>`;
}

function availableIds({ capabilities, network, audio, controller }) {
  const ids = ["home"];
  if (capabilities.network && network?.interfaces?.length) ids.push("network");
  if (capabilities.audio && audio?.output) ids.push("audio");
  if (capabilities.microphone && audio?.microphone) ids.push("microphone");
  if (controller.connected) ids.push("controllers");
  ids.push("profile", "settings", "power");
  return ids;
}

export async function populateControlCenter({ overlay, controller, focus }) {
  const panel = overlay.querySelector("[data-control-center-items]");
  if (!panel) return;
  let capabilities = {};
  let network = null;
  let audio = null;
  try {
    capabilities = await paraApi.capabilities();
    const requests = [];
    if (capabilities.network) requests.push(paraApi.network().then((value) => { network = value; }).catch(() => {}));
    if (capabilities.audio || capabilities.microphone) requests.push(paraApi.audio().then((value) => { audio = value; }).catch(() => {}));
    await Promise.all(requests);
  } catch {
    capabilities = {};
  }

  const available = availableIds({ capabilities, network, audio, controller });
  const preferences = getProfilePreferences();
  const hidden = new Set(preferences.controlCenter.hidden);
  const ordered = [...preferences.controlCenter.order, ...available.filter((id) => !preferences.controlCenter.order.includes(id))]
    .filter((id) => available.includes(id) && !hidden.has(id));
  panel.innerHTML = ordered.map((id) => {
    if (id === "network") {
      const active = network.interfaces.find((item) => item.connected);
      return simpleItem(id, definitions[id], active ? (active.kind === "wifi" ? "Wi-Fi" : "Ethernet") : "Offline");
    }
    if (id === "audio") return audioItem(audio);
    if (id === "microphone") return microphoneItem(audio);
    if (id === "profile") return simpleItem(id, definitions[id], getState().activeProfile || "Player One");
    if (id === "controllers") return simpleItem(id, definitions[id], controller.typeLabel);
    return simpleItem(id, definitions[id]);
  }).join("");
  if (!panel.children.length) panel.innerHTML = simpleItem("home", definitions.home);
  focus.setCurrent(panel.querySelector("button, input"), true);
}

export function controlCenterShell() {
  return `<div class="control-center-scrim" data-action="close-control-center"></div><aside class="control-center" role="dialog" aria-modal="true" aria-label="PARA Control Center"><header><div><span class="eyebrow">PARA</span><h2>Control Center</h2></div><button class="control-center-close" data-action="close-control-center" aria-label="Close Control Center">×</button></header><div class="control-center-items" data-control-center-items><div class="control-center-loading"><i></i><span>Opening controls…</span></div></div><footer><button data-route="control-center-settings">Customize</button><span><b data-prompt="para">PARA</b> Close</span></footer></aside>`;
}

export const controlCenterDefinitions = definitions;
