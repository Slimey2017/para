import { page } from "../ui/components.js";
import { escapeHtml } from "../services/para-api.js";
import { activateParaPoint, deactivateParaPoint, isParaPointActive } from "../ui/parapoint.js";

const START_PAGE = "about:blank";
let historyStack = [];
let historyIndex = -1;

function normalizeAddress(raw) {
  const value = String(raw || "").trim();
  if (!value) return START_PAGE;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) return `https://${value}`;
  return `https://www.google.com/search?igu=1&q=${encodeURIComponent(value)}`;
}

function browserStartMarkup() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#080711;color:#fff;font-family:system-ui;height:100%}body{display:grid;place-items:center}.start{max-width:760px;text-align:center;padding:40px}.mark{font-size:70px;color:#8d55ff}.start h1{font-size:44px;margin:8px}.start p{color:#aaa;line-height:1.5}.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:30px}.tile{background:#151122;border:1px solid #30244a;border-radius:18px;padding:20px;color:#ddd}</style></head><body><main class="start"><div class="mark">P</div><h1>PARA Browser</h1><p>Enter a website or search above. ParaPoint lets your controller act like a mouse, and ParaBoard opens for text entry.</p><div class="tiles"><div class="tile">Right stick<br><b>Move pointer</b></div><div class="tile">A<br><b>Click</b></div><div class="tile">Text field<br><b>ParaBoard</b></div></div></main></body></html>`;
}

export function browserScreen() {
  return page({
    title: "Browser",
    description: "",
    eyebrow: "",
    className: "browser-page browser-app-page",
    body: `<section class="para-browser para-browser--app" data-para-browser>
      <header class="browser-app-chrome">
        <div class="browser-app-tabstrip" aria-label="Browser tabs">
          <div class="browser-app-brand"><span class="browser-app-mark">P</span><strong>Para Browser</strong></div>
          <button type="button" class="browser-tab is-current" aria-current="page"><span class="browser-tab-dot"></span><b>New tab</b><span class="browser-tab-close">×</span></button>
          <button type="button" class="browser-new-tab" aria-label="New tab" disabled>+</button>
          <div class="browser-window-actions" aria-hidden="true"><span>—</span><span>□</span><span>×</span></div>
        </div>
        <div class="para-browser-toolbar">
          <div class="browser-nav-actions">
            <button type="button" data-action="browser-back" aria-label="Back">←</button>
            <button type="button" data-action="browser-forward" aria-label="Forward">→</button>
            <button type="button" data-action="browser-reload" aria-label="Reload">↻</button>
          </div>
          <label class="browser-address"><span>⌕</span><input type="text" data-browser-address aria-label="Website or search" placeholder="Search or enter a website" autocomplete="off" spellcheck="false"></label>
          <button type="button" class="browser-go" data-action="browser-go">Go</button>
          <button type="button" class="browser-point-toggle" data-action="toggle-parapoint"><span>↗</span><b>ParaPoint</b><small data-parapoint-state>Off</small></button>
          <button type="button" class="browser-menu-button" aria-label="Browser menu" disabled>•••</button>
        </div>
      </header>
      <div class="para-browser-stage">
        <iframe data-browser-frame title="PARA Browser page" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" referrerpolicy="no-referrer"></iframe>
        <div class="browser-site-note" data-browser-note hidden>That site blocks embedded browsing in the PARA web edition. The native PARA Browser will open it normally.</div>
      </div>
      <footer class="browser-controller-help"><span><b>A</b> Select</span><span><b>B</b> Back</span><span><b>Y</b> ParaBoard</span><span><b>Right stick</b> ParaPoint</span><span><b>L3</b> Pointer</span><span><b>PARA</b> Control Center</span></footer>
    </section>`,
  });
}

function loadFrame(url, push = true) {
  const frame = document.querySelector("[data-browser-frame]");
  const address = document.querySelector("[data-browser-address]");
  if (!frame) return;
  if (url === START_PAGE) {
    frame.srcdoc = browserStartMarkup();
    frame.removeAttribute("src");
    if (address) address.value = "";
  } else {
    frame.removeAttribute("srcdoc");
    frame.src = url;
    if (address) address.value = url;
  }
  if (push) {
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(url);
    historyIndex = historyStack.length - 1;
  }
}

export function browserNavigate(raw) { loadFrame(normalizeAddress(raw), true); }
export function browserBack() { if (historyIndex > 0) { historyIndex -= 1; loadFrame(historyStack[historyIndex], false); return true; } return false; }
export function browserForward() { if (historyIndex < historyStack.length - 1) { historyIndex += 1; loadFrame(historyStack[historyIndex], false); return true; } return false; }
export function browserReload() { const frame = document.querySelector("[data-browser-frame]"); if (!frame) return; try { frame.contentWindow.location.reload(); } catch { const current = historyStack[historyIndex] || START_PAGE; loadFrame(current, false); } }

export function updateParaPointState() {
  const node = document.querySelector("[data-parapoint-state]");
  const button = document.querySelector("[data-action='toggle-parapoint']");
  if (node) node.textContent = isParaPointActive() ? "On" : "Off";
  button?.classList.toggle("is-active", isParaPointActive());
}

export function activateBrowser() {
  historyStack = [START_PAGE];
  historyIndex = 0;
  loadFrame(START_PAGE, false);
  activateParaPoint();
  updateParaPointState();
  const onChange = () => updateParaPointState();
  const onBack = () => { if (!browserBack()) deactivateParaPoint(); updateParaPointState(); };
  const onEnter = (event) => {
    if (event.target.matches("[data-browser-address]") && event.key === "Enter") browserNavigate(event.target.value);
  };
  const onBlocked = () => {
    const note = document.querySelector("[data-browser-note]");
    if (note) { note.hidden = false; window.setTimeout(() => { if (note.isConnected) note.hidden = true; }, 4500); }
  };
  document.addEventListener("para-parapointchange", onChange);
  document.addEventListener("para-browser-back", onBack);
  document.addEventListener("para-parapoint-blocked", onBlocked);
  document.addEventListener("keydown", onEnter);
  return () => {
    deactivateParaPoint();
    document.removeEventListener("para-parapointchange", onChange);
    document.removeEventListener("para-browser-back", onBack);
    document.removeEventListener("para-parapoint-blocked", onBlocked);
    document.removeEventListener("keydown", onEnter);
  };
}
