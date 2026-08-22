import { paraApi } from "./para-api.js";

export const RESTART_SEQUENCE_KEY = "para.restart.sequence";

let capabilityRequest = null;

function readCapabilities() {
  if (!capabilityRequest) {
    capabilityRequest = paraApi.capabilities().catch(() => ({ power_actions: [] }));
  }
  return capabilityRequest;
}

export function preparePowerAction() {
  void readCapabilities();
}

export async function requestPowerAction(action) {
  const capabilities = await readCapabilities();
  if (!capabilities.power_actions?.includes(action)) return false;
  try {
    await paraApi.power(action);
    return true;
  } catch {
    return false;
  }
}

export async function completePowerAction(action) {
  const accepted = await requestPowerAction(action);
  if (accepted) return;

  if (action === "poweroff") {
    try { window.close(); } catch { /* the black screen remains active */ }
    return;
  }

  if (action === "reboot") {
    try { sessionStorage.setItem(RESTART_SEQUENCE_KEY, "1"); } catch { /* the route still restarts */ }
    const destination = `${location.href.split("#")[0]}#/intro`;
    setTimeout(() => location.replace(destination), 320);
  }
}

export function takeRestartSequence() {
  try {
    const restarting = sessionStorage.getItem(RESTART_SEQUENCE_KEY) === "1";
    if (restarting) sessionStorage.removeItem(RESTART_SEQUENCE_KEY);
    return restarting;
  } catch {
    return false;
  }
}
