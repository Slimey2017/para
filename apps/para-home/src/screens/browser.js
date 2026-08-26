import { page } from "../ui/components.js";
import { escapeHtml } from "../services/para-api.js";
import { deactivateParaPoint, isParaPointActive } from "../ui/parapoint.js";

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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#090711;color:#fff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}body{min-height:100vh;display:grid;place-items:center;overflow:auto;background:radial-gradient(circle at 50% 42%,rgba(111,52,221,.22),transparent 34%),linear-gradient(180deg,#0b0814,#07060c 68%)}
  .start{width:min(860px,calc(100% - 48px));text-align:center;padding:60px 24px 80px}.mark{width:76px;height:76px;margin:0 auto 18px;border-radius:24px;display:grid;place-items:center;font-size:42px;font-weight:950;background:linear-gradient(145deg,#8e4dff,#4935d7);box-shadow:0 18px 65px rgba(117,58,240,.32)}
  h1{font-size:clamp(34px,5vw,56px);margin:0 0 10px;letter-spacing:-.04em}.lead{margin:0 auto;color:#a79eaf;line-height:1.55;max-width:590px;font-size:15px}.search{margin:32px auto 0;max-width:680px;padding:17px 20px;border:1px solid rgba(255,255,255,.13);border-radius:18px;background:rgba(5,4,9,.88);color:#b9b0c3;text-align:left;box-shadow:0 15px 50px rgba(0,0,0,.28)}
  .quick{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px auto 0;max-width:680px}.quick a{display:block;padding:17px 14px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(20,15,30,.72);color:#ddd6e7;text-decoration:none;font-size:13px}.quick a:hover{border-color:#8755ff;background:#211535}.quick b{display:block;margin-bottom:4px;color:#fff}.foot{margin-top:28px;color:#685f73;font-size:11px}
  @media(max-width:620px){.quick{grid-template-columns:1fr}.start{padding-top:38px}}
  </style></head><body><main class="start"><div class="mark">P</div><h1>New tab</h1><p class="lead">Search from the address bar or open a favorite site. ParaPoint stays off until you turn it on.</p><div class="search">⌕ &nbsp; Search or enter a website above</div><div class="quick"><a href="https://www.youtube.com"><b>YouTube</b>Video</a><a href="https://www.wikipedia.org"><b>Wikipedia</b>Reference</a><a href="https://www.google.com"><b>Google</b>Search</a></div><div class="foot">PARA Browser • Web edition</div></main></body></html>`;
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
        <aside class="browser-first-run" data-browser-tutorial hidden aria-label="Para Browser controls">
          <header><span>CONTROLLER BROWSING</span><button type="button" data-action="dismiss-browser-tutorial" aria-label="Dismiss browser tutorial">×</button></header>
          <strong>Browse from the couch</strong>
          <div><span><b>Right stick</b> Move ParaPoint</span><span><b>A</b> Click</span><span><b>Y</b> ParaBoard</span></div>
          <small>ParaPoint only turns on when you choose it.</small>
        </aside>
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
  deactivateParaPoint();
  updateParaPointState();
  const tutorial = document.querySelector("[data-browser-tutorial]");
  let tutorialSeen = false;
  try { tutorialSeen = localStorage.getItem("para.browser.tutorialSeen") === "1"; } catch {}
  if (tutorial && !tutorialSeen) tutorial.hidden = false;
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
