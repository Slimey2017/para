function formatLocalTime(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
}

function greetingFor(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function updateLiveClocks(scope = document, now = new Date()) {
  const value = formatLocalTime(now);
  scope.querySelectorAll?.("[data-clock]").forEach((node) => {
    node.textContent = value;
    node.dateTime = now.toISOString();
  });
  const greeting = greetingFor(now);
  scope.querySelectorAll?.("[data-greeting]").forEach((node) => { node.textContent = greeting; });
  return value;
}

// The timeout is aligned to the next minute boundary so the displayed minute
// never drifts, even after the page has been open for hours.
export function mountLiveClock(scope = document) {
  let timer = 0;
  let active = true;
  const schedule = () => {
    if (!active) return;
    const now = new Date();
    updateLiveClocks(scope, now);
    const delay = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 20;
    timer = window.setTimeout(schedule, delay);
  };
  schedule();
  return () => {
    active = false;
    window.clearTimeout(timer);
  };
}

export { formatLocalTime };
