let stream = null;
let denied = false;

export async function microphoneState() {
  if (!navigator.mediaDevices?.getUserMedia) return { available: false, active: false, state: "unavailable" };
  if (stream?.getAudioTracks().some((track) => track.readyState === "live")) return { available: true, active: true, state: "active" };
  if (denied) return { available: true, active: false, state: "blocked" };
  let permission = "prompt";
  try { permission = (await navigator.permissions?.query({ name: "microphone" }))?.state || "prompt"; } catch { /* prompt remains accurate */ }
  if (permission === "denied") denied = true;
  return { available: true, active: false, state: permission === "denied" ? "blocked" : "off" };
}

export async function toggleMicrophone() {
  const current = await microphoneState();
  if (!current.available) return current;
  if (current.active) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    return { available: true, active: false, state: "off" };
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    denied = false;
    return { available: true, active: true, state: "active" };
  } catch {
    denied = true;
    return { available: true, active: false, state: "blocked" };
  }
}
