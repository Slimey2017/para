const ACCOUNT_MEMORY_KEY = "para.account.identity.v1";

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") ? email.slice(0, 254) : "";
}

function cleanName(value, email = "") {
  return (String(value || "").trim() || cleanEmail(email).split("@", 1)[0] || "PARA User").slice(0, 32);
}

export function knownParaAccount() {
  try {
    const value = JSON.parse(localStorage.getItem(ACCOUNT_MEMORY_KEY) || "null");
    if (!value || typeof value !== "object" || !cleanEmail(value.email)) return null;
    return {
      email: cleanEmail(value.email),
      displayName: cleanName(value.displayName, value.email),
      created: value.created !== false,
      verified: Boolean(value.verified),
      connected: Boolean(value.connected),
      createdAt: Number(value.createdAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export function rememberParaAccount({ email = "", displayName = "", verified = false, connected = false } = {}) {
  const clean = cleanEmail(email);
  if (!clean) return null;
  const previous = knownParaAccount();
  const next = {
    email: clean,
    displayName: cleanName(displayName || previous?.displayName, clean),
    created: true,
    verified: Boolean(verified || previous?.verified),
    connected: Boolean(connected),
    createdAt: previous?.email === clean ? previous.createdAt : Date.now(),
  };
  localStorage.setItem(ACCOUNT_MEMORY_KEY, JSON.stringify(next));
  return next;
}

export function markParaAccountVerified(email = "") {
  const previous = knownParaAccount();
  const clean = cleanEmail(email || previous?.email);
  if (!clean) return null;
  return rememberParaAccount({
    email: clean,
    displayName: previous?.displayName,
    verified: true,
    connected: previous?.connected,
  });
}

export function markParaAccountConnected(user = {}) {
  return rememberParaAccount({
    email: user.email,
    displayName: user.display_name,
    verified: Boolean(user.email_verified || user.para_email_verified || user.email_confirmed),
    connected: true,
  });
}

export function markParaAccountDisconnected() {
  const previous = knownParaAccount();
  if (!previous) return null;
  return rememberParaAccount({ ...previous, connected: false });
}
