import { page } from "../ui/components.js";
import { escapeHtml } from "../services/para-api.js";
import { deactivateParaPoint, isParaPointActive } from "../ui/parapoint.js";

const START_PAGE = "about:blank";
const TAB_SESSION_KEY = "para.browser.tabs.v1";
const MAX_TABS = 8;
let tabs = [];
let activeTabId = "";
let nextTabId = 1;

function newTabRecord() {
  return { id: `tab-${nextTabId++}`, history: [START_PAGE], index: 0, title: "New tab" };
}

function currentTab() {
  return tabs.find((tab) => tab.id === activeTabId) || tabs[0] || null;
}

function currentUrl(tab = currentTab()) {
  return tab?.history?.[tab.index] || START_PAGE;
}

function titleFor(url) {
  if (!url || url === START_PAGE) return "New tab";
  try { return new URL(url).hostname.replace(/^www\./, "") || "Website"; }
  catch { return "Website"; }
}

function saveTabs() {
  try { sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify({ tabs, activeTabId, nextTabId })); } catch {}
}

function restoreTabs() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TAB_SESSION_KEY) || "null");
    if (saved && Array.isArray(saved.tabs) && saved.tabs.length) {
      tabs = saved.tabs.slice(0, MAX_TABS).map((tab, index) => {
        const history = Array.isArray(tab.history) && tab.history.length ? tab.history.map(String).slice(-32) : [START_PAGE];
        const tabIndex = Math.max(0, Math.min(Number(tab.index) || 0, history.length - 1));
        return { id: String(tab.id || `tab-${index + 1}`), history, index: tabIndex, title: String(tab.title || titleFor(history[tabIndex])) };
      });
      activeTabId = tabs.some((tab) => tab.id === saved.activeTabId) ? saved.activeTabId : tabs[0].id;
      nextTabId = Math.max(Number(saved.nextTabId) || 1, tabs.length + 1);
      return;
    }
  } catch {}
  const tab = newTabRecord();
  tabs = [tab];
  activeTabId = tab.id;
}

function renderTabs() {
  const host = document.querySelector("[data-browser-tabs]");
  const add = document.querySelector("[data-browser-new-tab]");
  if (!host) return;
  host.innerHTML = tabs.map((tab) => `<button type="button" class="browser-tab ${tab.id === activeTabId ? "is-current" : ""}" data-browser-tab="${escapeHtml(tab.id)}" aria-current="${tab.id === activeTabId ? "page" : "false"}"><span class="browser-tab-dot"></span><b>${escapeHtml(tab.title || titleFor(currentUrl(tab)))}</b><span class="browser-tab-close" data-browser-close="${escapeHtml(tab.id)}" aria-label="Close tab">×</span></button>`).join("");
  if (add) add.disabled = tabs.length >= MAX_TABS;
}

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
    title: "Browser", description: "", eyebrow: "", className: "browser-page browser-app-page",
    body: `<section class="para-browser para-browser--app" data-para-browser>
      <header class="browser-app-bar">
        <div class="browser-app-tabstrip" aria-label="Browser tabs">
          <div class="browser-app-brand"><span class="browser-app-mark">P</span><strong>Para Browser</strong></div>
          <div class="browser-tabs" data-browser-tabs></div>
          <button type="button" class="browser-new-tab" aria-label="New tab" data-browser-new-tab>+</button>
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
          <button type="button" class="browser-menu-button" aria-label="Browser menu" data-browser-menu-toggle aria-expanded="false">•••</button>
        </div>
      </header>
      <div class="para-browser-stage">
        <iframe data-browser-frame title="PARA Browser page" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" referrerpolicy="no-referrer"></iframe>
        <div class="browser-menu" data-browser-menu hidden>
          <button type="button" data-browser-command="new-tab">＋ New tab</button>
          <button type="button" data-browser-command="close-tab">× Close tab</button>
          <button type="button" data-browser-command="home">⌂ New-tab page</button>
          <button type="button" data-browser-command="clear-history">↺ Clear tab history</button>
        </div>
        <aside class="browser-first-run" data-browser-tutorial hidden aria-label="Para Browser controls">
          <header><span>CONTROLLER BROWSING</span><button type="button" data-action="dismiss-browser-tutorial" aria-label="Dismiss browser tutorial">×</button></header>
          <strong>Browse from the couch</strong><div><span><b>Right stick</b> Move ParaPoint</span><span><b>A</b> Click</span><span><b>Y</b> ParaBoard</span></div><small>ParaPoint only turns on when you choose it.</small>
        </aside>
        <div class="browser-site-note" data-browser-note hidden>That site blocks embedded browsing in the PARA web edition. The native PARA Browser will open it normally.</div>
      </div>
      <footer class="browser-controller-help"><span><b>A</b> Select</span><span><b>B</b> Back</span><span><b>Y</b> ParaBoard</span><span><b>Right stick</b> ParaPoint</span><span><b>L3</b> Pointer</span><span><b>PARA</b> Control Center</span></footer>
    </section>`,
  });
}

function loadFrame(url, push = true) {
  const tab = currentTab();
  const frame = document.querySelector("[data-browser-frame]");
  const address = document.querySelector("[data-browser-address]");
  if (!tab || !frame) return;
  if (push) {
    tab.history = tab.history.slice(0, tab.index + 1);
    tab.history.push(url);
    tab.index = tab.history.length - 1;
  }
  tab.title = titleFor(url);
  if (url === START_PAGE) {
    frame.srcdoc = browserStartMarkup(); frame.removeAttribute("src"); if (address) address.value = "";
  } else {
    frame.removeAttribute("srcdoc"); frame.src = url; if (address) address.value = url;
  }
  renderTabs(); saveTabs();
}

function addTab() {
  if (tabs.length >= MAX_TABS) return false;
  const tab = newTabRecord(); tabs.push(tab); activeTabId = tab.id; renderTabs(); loadFrame(START_PAGE, false); return true;
}

function closeTab(id = activeTabId) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const wasActive = tabs[index].id === activeTabId;
  tabs.splice(index, 1);
  if (!tabs.length) tabs.push(newTabRecord());
  if (wasActive) activeTabId = tabs[Math.min(index, tabs.length - 1)].id;
  renderTabs(); loadFrame(currentUrl(), false);
}

function switchTab(id) {
  if (!tabs.some((tab) => tab.id === id) || id === activeTabId) return;
  activeTabId = id; renderTabs(); loadFrame(currentUrl(), false);
}

export function browserNavigate(raw) { loadFrame(normalizeAddress(raw), true); }
export function browserBack() { const tab = currentTab(); if (tab && tab.index > 0) { tab.index -= 1; loadFrame(currentUrl(tab), false); return true; } return false; }
export function browserForward() { const tab = currentTab(); if (tab && tab.index < tab.history.length - 1) { tab.index += 1; loadFrame(currentUrl(tab), false); return true; } return false; }
export function browserReload() { const frame = document.querySelector("[data-browser-frame]"); if (!frame) return; try { frame.contentWindow.location.reload(); } catch { loadFrame(currentUrl(), false); } }

export function updateParaPointState() {
  const node = document.querySelector("[data-parapoint-state]");
  const button = document.querySelector("[data-action='toggle-parapoint']");
  if (node) node.textContent = isParaPointActive() ? "On" : "Off";
  button?.classList.toggle("is-active", isParaPointActive());
}

export function activateBrowser() {
  restoreTabs(); renderTabs(); loadFrame(currentUrl(), false); deactivateParaPoint(); updateParaPointState();
  const tutorial = document.querySelector("[data-browser-tutorial]");
  let tutorialSeen = false; try { tutorialSeen = localStorage.getItem("para.browser.tutorialSeen") === "1"; } catch {}
  if (tutorial && !tutorialSeen) tutorial.hidden = false;
  const menu = document.querySelector("[data-browser-menu]");
  const menuToggle = document.querySelector("[data-browser-menu-toggle]");
  const setMenu = (open) => { if (menu) menu.hidden = !open; menuToggle?.setAttribute("aria-expanded", String(open)); };
  const onChange = () => updateParaPointState();
  const onBack = () => { if (!browserBack()) deactivateParaPoint(); updateParaPointState(); };
  const onEnter = (event) => { if (event.target.matches("[data-browser-address]") && event.key === "Enter") browserNavigate(event.target.value); };
  const onClick = (event) => {
    const close = event.target.closest("[data-browser-close]"); if (close) { event.preventDefault(); event.stopPropagation(); closeTab(close.dataset.browserClose); return; }
    const tab = event.target.closest("[data-browser-tab]"); if (tab) { switchTab(tab.dataset.browserTab); return; }
    if (event.target.closest("[data-browser-new-tab]")) { addTab(); setMenu(false); return; }
    if (event.target.closest("[data-browser-menu-toggle]")) { setMenu(Boolean(menu?.hidden)); return; }
    const command = event.target.closest("[data-browser-command]")?.dataset.browserCommand;
    if (command === "new-tab") addTab();
    else if (command === "close-tab") closeTab();
    else if (command === "home") loadFrame(START_PAGE, true);
    else if (command === "clear-history") { const tabNow = currentTab(); if (tabNow) { const url = currentUrl(tabNow); tabNow.history = [url]; tabNow.index = 0; saveTabs(); } }
    if (command) setMenu(false);
  };
  const onBlocked = () => { const note = document.querySelector("[data-browser-note]"); if (note) { note.hidden = false; window.setTimeout(() => { if (note.isConnected) note.hidden = true; }, 4500); } };
  document.addEventListener("para-parapointchange", onChange); document.addEventListener("para-browser-back", onBack); document.addEventListener("para-parapoint-blocked", onBlocked); document.addEventListener("keydown", onEnter); document.addEventListener("click", onClick);
  return () => { deactivateParaPoint(); saveTabs(); document.removeEventListener("para-parapointchange", onChange); document.removeEventListener("para-browser-back", onBack); document.removeEventListener("para-parapoint-blocked", onBlocked); document.removeEventListener("keydown", onEnter); document.removeEventListener("click", onClick); };
}
