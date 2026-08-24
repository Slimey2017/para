import { getProfileRuntime, getState, setProfileRuntime } from "../state.js";
import { DEMOS, demoById, demoByRoute } from "../services/demo-catalog.js";
import {
  activeDownloads, installedDemos, profileRuntime, recordExperience, refreshDemoDownloads,
} from "../services/experience-runtime.js";
import { escapeHtml, formatBytes, paraApi } from "../services/para-api.js";
import { brand, hints, page } from "../ui/components.js";

function demoArt(demo) {
  return `<span class="demo-art" style="--demo-accent:${demo.accent}"><i>${demo.mark}</i><b></b></span>`;
}

const STORE_INSTALL_KEY = "para.store.installed.v1";

function installedStoreItems() {
  const profile = getState().activeProfile || "P1";
  try {
    const all = JSON.parse(localStorage.getItem(STORE_INSTALL_KEY) || "{}");
    return Array.isArray(all[profile]) ? all[profile] : [];
  } catch { return []; }
}

function saveInstalledStoreItems(items) {
  const profile = getState().activeProfile || "P1";
  let all = {};
  try { all = JSON.parse(localStorage.getItem(STORE_INSTALL_KEY) || "{}"); } catch { all = {}; }
  all[profile] = items;
  localStorage.setItem(STORE_INSTALL_KEY, JSON.stringify(all));
}

export function installStoreItem(item) {
  if (!item?.id) return false;
  const items = installedStoreItems();
  saveInstalledStoreItems([{ ...item, installedAt: Date.now() }, ...items.filter((entry) => entry.id !== item.id)]);
  recordExperience({
    id: `store:${item.id}`, title: item.title || "ParaStore game", route: "store-game",
    kind: item.project_type === "APP" ? "App" : "Game", accent: "#8d43ff",
    mark: (item.title || "P").slice(0, 1).toUpperCase(), storeId: item.id, queueStatus: "Ready to play",
  });
  return true;
}

export function uninstallStoreItem(id) {
  saveInstalledStoreItems(installedStoreItems().filter((item) => item.id !== id));
}

export function isStoreItemInstalled(id) {
  return installedStoreItems().some((item) => item.id === id);
}

function installedStoreCard(item, autofocus = false) {
  return `<article class="demo-card"><span class="demo-art" style="--demo-accent:#8d43ff"><i>${escapeHtml((item.title || "P")[0])}</i><b></b></span><div class="demo-card__copy"><span>${escapeHtml(item.runtime || "PARA")}</span><h2>${escapeHtml(item.title || "Untitled")}</h2><p>${escapeHtml(item.store_metadata?.short_description || "Installed from ParaStore")}</p></div><button class="action-button" data-action="play-store-game" data-store-id="${escapeHtml(item.id)}" ${autofocus ? "data-autofocus='true'" : ""}>Play</button><button class="demo-remove" data-action="uninstall-store-game" data-store-id="${escapeHtml(item.id)}">Uninstall</button></article>`;
}

function demoCard(demo, { installed = false, autofocus = false } = {}) {
  const download = activeDownloads().find((item) => item.id === demo.id);
  const action = installed
    ? `data-route="${demo.route}"`
    : download
      ? `disabled aria-disabled="true"`
      : `data-action="install-demo" data-demo-id="${demo.id}"`;
  const label = installed ? "Open" : download ? `${download.progress || 0}%` : "Install Demo";
  return `<article class="demo-card">${demoArt(demo)}<div class="demo-card__copy"><span>${demo.genre} · ${formatBytes(demo.sizeBytes)}</span><h2>${demo.name}</h2><p>${demo.tagline}</p></div><button class="action-button" ${action} ${autofocus && !download ? "data-autofocus='true'" : ""}>${label}</button>${installed ? `<button class="demo-remove" data-action="remove-demo" data-demo-id="${demo.id}">Remove</button>` : ""}</article>`;
}

export function gamesScreen() {
  const storeGames = installedStoreItems().filter((item) => (item.project_type || "GAME") === "GAME");
  const demos = installedDemos();
  const cards = [
    ...storeGames.map((item, index) => installedStoreCard(item, index === 0)),
    ...demos.map((demo, index) => demoCard(demo, { installed: true, autofocus: storeGames.length === 0 && index === 0 })),
  ];
  return page({
    title: "Games",
    description: "Games installed for this profile.",
    eyebrow: "Explore",
    className: "demo-library-page",
    body: cards.length
      ? `<div class="demo-library">${cards.join("")}</div>`
      : `<div class="library-empty"><span>◉</span><h2>No games installed</h2><button class="action-button" data-route="parastore" data-autofocus="true">Open ParaStore</button></div>`,
  });
}


export function demosScreen() {
  const installed = new Set(installedDemos().map((demo) => demo.id));
  return page({
    title: "PARA Demos",
    description: "Small games made for the PARA interface.",
    eyebrow: "Explore",
    className: "demo-library-page",
    body: `<div class="demo-library" data-demo-library>${DEMOS.map((demo, index) => demoCard(demo, { installed: installed.has(demo.id), autofocus: index === 0 })).join("")}</div>`,
  });
}

export function paraStoreScreen() {
  return page({
    title: "ParaStore",
    description: "Games and apps published for PARA.",
    eyebrow: "Store",
    className: "parastore-page",
    body: `<section class="store-feature"><div><span class="eyebrow">ParaStore</span><h2>Find your next game.</h2><p>Published developer releases appear here automatically.</p></div><span class="store-feature__orb" aria-hidden="true"></span></section><nav class="store-categories" aria-label="Store categories"><button class="is-active" data-autofocus="true">Featured</button><button>Games</button><button>Apps</button></nav><div class="store-live-grid" data-live-store><div class="library-empty"><span>◌</span><h2>Loading ParaStore…</h2><p>Checking the published catalog.</p></div></div>`,
  });
}

function liveStoreCard(item) {
  const meta = item.store_metadata || {};
  const description = meta.short_description || "Published on ParaStore";
  const type = item.project_type || "GAME";
  const genre = meta.genre || type;
  const price = meta.distribution_type === "FREE" || !meta.distribution_type ? "Free" : meta.distribution_type;
  return `<article class="store-live-card" tabindex="0" data-action="open-store-product" data-store-id="${escapeHtml(item.id)}"><div class="store-live-card__art"><span>${escapeHtml((item.title || "P").slice(0,1).toUpperCase())}</span><small>${escapeHtml(item.runtime || "PARA")}</small></div><div class="store-live-card__copy"><span>${escapeHtml(genre)}</span><h2>${escapeHtml(item.title || "Untitled")}</h2><p>${escapeHtml(description)}</p><div><strong>${escapeHtml(price)}</strong><small>View product</small></div></div></article>`;
}

export function activateParaStore() {
  const host = document.querySelector("[data-live-store]");
  if (!host) return () => {};
  let alive = true;
  paraApi.storeCatalog().then((payload) => {
    if (!alive) return;
    const items = payload.items || [];
    host.innerHTML = items.length ? items.map(liveStoreCard).join("") : `<div class="library-empty"><span>▱</span><h2>No published titles yet</h2><p>Approved releases will appear here.</p></div>`;
  }).catch((error) => {
    if (!alive) return;
    host.innerHTML = `<div class="library-empty"><span>!</span><h2>ParaStore could not connect</h2><p>${escapeHtml(error.message || "Catalog unavailable")}</p></div>`;
  });
  return () => { alive = false; };
}



export function storeProductScreen() {
  return page({
    title: "ParaStore",
    description: "Product details",
    eyebrow: "Store",
    className: "store-product-page",
    body: `<div data-store-product><div class="library-empty"><span>◌</span><h2>Loading product…</h2></div></div>`,
  });
}

function assetUrl(path) {
  return path ? `/api/v1/store/asset?path=${encodeURIComponent(path)}` : "";
}

export function activateStoreProduct() {
  const host = document.querySelector("[data-store-product]");
  if (!host) return () => {};
  const id = sessionStorage.getItem("para.store.product") || "";
  let alive = true;
  if (!id) {
    host.innerHTML = `<div class="library-empty"><span>!</span><h2>No product selected</h2><button class="action-button" data-route="parastore">Back to ParaStore</button></div>`;
    return () => {};
  }
  paraApi.storeProduct(id).then((item) => {
    if (!alive) return;
    const meta = item.store_metadata || {};
    const assets = item.asset_references || {};
    const hero = assetUrl(assets.hero || assets.cover || assets.icon);
    const cover = assetUrl(assets.cover || assets.icon || assets.hero);
    const shots = Array.isArray(assets.screenshots) ? assets.screenshots : [];
    const price = meta.distribution_type === "FREE" || !meta.distribution_type ? "Free" : meta.distribution_type;
    host.innerHTML = `
      <section class="store-product-hero" ${hero ? `style="--product-hero:url('${hero}')"` : ""}>
        <div class="store-product-hero__shade"></div>
        <button class="store-product-back" data-route="parastore">← Back</button>
        <div class="store-product-hero__content">
          <div class="store-product-cover">${cover ? `<img src="${cover}" alt="${escapeHtml(item.title)} cover">` : `<span>${escapeHtml((item.title || "P")[0])}</span>`}</div>
          <div class="store-product-copy">
            <span>${escapeHtml(meta.genre || item.project_type || "GAME")}</span>
            <h1>${escapeHtml(item.title || "Untitled")}</h1>
            <p>${escapeHtml(meta.short_description || "Published on ParaStore")}</p>
            <div class="store-product-meta"><strong>${escapeHtml(price)}</strong><small>${escapeHtml(item.runtime || "PARA")}</small></div>
            <div class="store-product-actions">
              ${isStoreItemInstalled(item.id) ? `<button class="action-button" data-action="play-store-game" data-store-id="${escapeHtml(item.id)}">Play</button><button class="action-button action-button--ghost" data-action="uninstall-store-game" data-store-id="${escapeHtml(item.id)}">Uninstall</button>` : `<button class="action-button" data-action="install-store-game" data-store-id="${escapeHtml(item.id)}">Install</button>`}
              <button class="action-button action-button--ghost" data-action="store-more-info">•••</button>
            </div>
          </div>
        </div>
      </section>
      <section class="store-product-details">
        <div><h2>About</h2><p>${escapeHtml(meta.full_description || meta.short_description || "No description provided.")}</p></div>
        <aside><span>Developer</span><strong>${escapeHtml(meta.developer_name || "Independent developer")}</strong><span>Runtime</span><strong>${escapeHtml(item.runtime || "PARA")}</strong><span>Release notes</span><strong>${escapeHtml(item.release_notes || "Initial release")}</strong></aside>
      </section>
      ${shots.length ? `<section class="store-product-gallery"><h2>Screenshots</h2><div>${shots.map((shot) => `<img src="${assetUrl(shot)}" alt="${escapeHtml(item.title)} screenshot">`).join("")}</div></section>` : ""}
    `;
  }).catch((error) => {
    if (!alive) return;
    host.innerHTML = `<div class="library-empty"><span>!</span><h2>Product unavailable</h2><p>${escapeHtml(error.message || "Could not load product")}</p></div>`;
  });
  return () => { alive = false; };
}

export function storeGameScreen() {
  return page({
    title: "Game",
    description: "Running from your PARA library.",
    eyebrow: "PARA",
    className: "store-game-page",
    body: `<section class="store-game-runtime" data-store-game-runtime><div class="library-empty"><span>◌</span><h2>Starting game…</h2></div></section>`,
  });
}

export function activateStoreGame() {
  const host = document.querySelector("[data-store-game-runtime]");
  if (!host) return () => {};
  const id = sessionStorage.getItem("para.store.launch") || "";
  const item = installedStoreItems().find((entry) => entry.id === id);
  if (!item) {
    host.innerHTML = `<div class="library-empty"><span>!</span><h2>Game is not installed</h2><button class="action-button" data-route="parastore">Open ParaStore</button></div>`;
    return () => {};
  }
  recordExperience({ id: `store:${item.id}`, title: item.title || "ParaStore game", route: "store-game", kind: "Game", accent: "#8d43ff", mark: (item.title || "P")[0], storeId: item.id });
  const source = `/api/v1/store/content/${encodeURIComponent(item.id)}/index.html`;
  host.innerHTML = `<div class="store-game-toolbar"><button class="action-button action-button--ghost" data-route="games">← Library</button><strong>${escapeHtml(item.title || "Game")}</strong><span class="store-game-toolbar__state">PARA Web Runtime</span></div><iframe class="store-game-frame" data-store-game-frame src="${source}" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-downloads" allow="gamepad; autoplay; fullscreen" referrerpolicy="same-origin" title="${escapeHtml(item.title || "PARA game")}"></iframe>`;

  const frame = host.querySelector("[data-store-game-frame]");
  let runtimeReady = false;
  const onMessage = (event) => {
    if (event.source !== frame?.contentWindow) return;
    if (event.data?.type === "para-game-runtime-ready" && event.data?.id === item.id) runtimeReady = true;
  };
  window.addEventListener("message", onMessage);

  const onLoad = () => {
    if (!frame) return;
    try {
      const path = frame.contentWindow?.location?.pathname || "";
      if ((path === "/" || path === "/index.html") && runtimeReady) {
        runtimeReady = false;
        frame.src = source;
      }
    } catch (_) {}
  };
  frame?.addEventListener("load", onLoad);

  return () => {
    window.removeEventListener("message", onMessage);
    frame?.removeEventListener("load", onLoad);
  };
}

export function messagesScreen() {
  return page({
    title: "Messages",
    description: "Chat with friends across PARA.",
    eyebrow: "Community",
    className: "messages-page",
    body: `<div class="messages-shell"><aside class="messages-list"><div class="messages-list__head"><h2>Chats</h2><button aria-label="New message">＋</button></div><button class="message-thread is-active" data-autofocus="true"><i>S</i><span><strong>PARA Friends</strong><small>Welcome to Messages</small></span><time>Now</time></button><button class="message-thread"><i>＋</i><span><strong>Start a conversation</strong><small>Find a friend to message</small></span></button></aside><section class="message-conversation"><header><div><strong>PARA Friends</strong><small>Messages stay with your profile</small></div></header><div class="message-conversation__body"><div class="message-bubble"><span>PARA</span><p>Chat is ready for the social service. Friends, parties, voice, and real-time messages can plug into this screen next.</p></div></div><form class="message-composer" onsubmit="return false"><button type="button">＋</button><input placeholder="Message" aria-label="Message"/><button type="button">Send</button></form></section></div>`,
  });
}

export function activateDemoLibrary({ rerender }) {
  let alive = true;
  const timer = window.setInterval(() => {
    if (!alive || !activeDownloads().length) return;
    rerender();
  }, 500);
  return () => { alive = false; window.clearInterval(timer); };
}

export function gameScreen(route) {
  const demo = demoByRoute(route);
  if (!demo || !installedDemos().some((item) => item.id === demo.id)) return gamesScreen();
  return `<section class="screen demo-game" data-demo-game="${demo.id}"><header class="demo-game__top">${brand()}<div><strong>${demo.name}</strong><span>${demo.genre}</span></div><time data-clock>--:--</time></header><main class="demo-game__stage"><canvas width="1280" height="720" tabindex="0" data-autofocus="true" aria-label="${demo.name} game area"></canvas><div class="demo-game__hud"><span data-game-score>0</span><button data-route="home">Leave Game</button></div><div class="demo-game__start" data-game-start><span>${demo.mark}</span><h1>${demo.name}</h1><p>${demo.tagline}</p><button class="action-button" data-action="start-current-demo">Play</button></div></main>${hints({ options: true })}</section>`;
}

function inputState() {
  return { left: false, right: false, up: false, down: false, action: false };
}

function drawBackdrop(context, width, height, accent) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#05030b");
  gradient.addColorStop(1, "#16062c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = `${accent}66`;
  context.lineWidth = 2;
  for (let y = height * .58; y < height; y += 44) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
}

function pongEngine(canvas, demo, input, scoreNode) {
  const context = canvas.getContext("2d");
  const state = { py: 310, ai: 310, x: 640, y: 360, vx: 6, vy: 3.5, score: 0, enemy: 0 };
  return () => {
    const gamepad = navigator.getGamepads?.()[0];
    const axis = gamepad?.axes?.[1] || 0;
    state.py = Math.max(55, Math.min(665, state.py + ((input.up ? -8 : input.down ? 8 : 0) + axis * 8)));
    state.ai += Math.sign(state.y - state.ai) * 4.2;
    state.x += state.vx; state.y += state.vy;
    if (state.y < 18 || state.y > 702) state.vy *= -1;
    if (state.x < 74 && Math.abs(state.y - state.py) < 78 && state.vx < 0) { state.vx *= -1.045; state.x = 75; }
    if (state.x > 1206 && Math.abs(state.y - state.ai) < 78 && state.vx > 0) { state.vx *= -1.045; state.x = 1205; }
    if (state.x < -20 || state.x > 1300) {
      state.x > 640 ? state.score += 1 : state.enemy += 1;
      state.x = 640; state.y = 360; state.vx = (state.x < 0 ? 1 : -1) * 6;
      scoreNode.textContent = `${state.score}  ·  ${state.enemy}`;
    }
    drawBackdrop(context, 1280, 720, demo.accent);
    context.fillStyle = demo.accent; context.shadowColor = demo.accent; context.shadowBlur = 22;
    context.fillRect(46, state.py - 64, 16, 128); context.fillRect(1218, state.ai - 64, 16, 128);
    context.beginPath(); context.arc(state.x, state.y, 13, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0;
    context.fillStyle = "#ffffff66"; context.fillRect(638, 40, 4, 640);
  };
}

function racerEngine(canvas, demo, input, scoreNode) {
  const context = canvas.getContext("2d");
  const state = { x: 640, speed: 7, distance: 0, obstacles: [], cooldown: 0 };
  return () => {
    const gamepad = navigator.getGamepads?.()[0];
    const axis = gamepad?.axes?.[0] || 0;
    state.x = Math.max(310, Math.min(970, state.x + ((input.left ? -10 : input.right ? 10 : 0) + axis * 10)));
    state.distance += state.speed / 10; state.cooldown -= 1;
    if (state.cooldown <= 0) { state.obstacles.push({ x: 350 + Math.random() * 580, y: -80 }); state.cooldown = 48 + Math.random() * 42; }
    state.obstacles.forEach((item) => { item.y += state.speed; });
    const hit = state.obstacles.find((item) => item.y > 570 && item.y < 690 && Math.abs(item.x - state.x) < 56);
    if (hit) { state.distance = Math.max(0, state.distance - 40); hit.y = 900; }
    state.obstacles = state.obstacles.filter((item) => item.y < 820);
    scoreNode.textContent = `${Math.floor(state.distance)} m`;
    drawBackdrop(context, 1280, 720, demo.accent);
    context.fillStyle = "#0c0b12"; context.fillRect(260, 0, 760, 720);
    context.strokeStyle = "#a678ff55"; context.lineWidth = 8;
    for (let y = (state.distance * 8) % 100 - 100; y < 720; y += 100) { context.beginPath(); context.moveTo(640, y); context.lineTo(640, y + 56); context.stroke(); }
    context.fillStyle = demo.accent; context.shadowColor = demo.accent; context.shadowBlur = 18;
    context.fillRect(state.x - 34, 606, 68, 100); context.shadowBlur = 0;
    context.fillStyle = "#f8f6ff"; state.obstacles.forEach((item) => context.fillRect(item.x - 38, item.y, 76, 86));
  };
}

function platformEngine(canvas, demo, input, scoreNode) {
  const context = canvas.getContext("2d");
  const state = { x: 210, y: 540, vy: 0, distance: 0, blocks: [{ x: 0, w: 1280 }], nextGap: 980 };
  return () => {
    const gamepad = navigator.getGamepads?.()[0];
    const pressed = input.action || input.up || gamepad?.buttons?.[0]?.pressed;
    if (pressed && state.y >= 539) state.vy = -14;
    state.vy += .72; state.y = Math.min(540, state.y + state.vy);
    state.distance += 5.2;
    const shift = 5.2;
    state.blocks.forEach((block) => { block.x -= shift; });
    state.nextGap -= shift;
    if (state.nextGap < 900) {
      const gap = 95 + Math.random() * 85;
      const width = 250 + Math.random() * 320;
      state.blocks.push({ x: state.nextGap + gap, w: width });
      state.nextGap += gap + width;
    }
    state.blocks = state.blocks.filter((block) => block.x + block.w > -50);
    const supported = state.blocks.some((block) => state.x + 28 > block.x && state.x - 28 < block.x + block.w);
    if (!supported && state.y >= 539) { state.y = 760; }
    if (state.y > 720) { state.y = 540; state.vy = 0; state.distance = Math.max(0, state.distance - 500); state.blocks = [{ x: 0, w: 850 }]; state.nextGap = 1050; }
    scoreNode.textContent = `${Math.floor(state.distance / 10)} steps`;
    drawBackdrop(context, 1280, 720, demo.accent);
    context.fillStyle = "#6f41c5"; state.blocks.forEach((block) => context.fillRect(block.x, 610, block.w, 110));
    context.fillStyle = demo.accent; context.shadowColor = demo.accent; context.shadowBlur = 20; context.fillRect(state.x - 28, state.y, 56, 70); context.shadowBlur = 0;
  };
}

export function activateDemoGame({ route }) {
  const demo = demoByRoute(route);
  const canvas = document.querySelector("[data-demo-game] canvas");
  const score = document.querySelector("[data-game-score]");
  const start = document.querySelector("[data-game-start]");
  if (!demo || !canvas || !score || !start) return () => {};
  recordExperience({ id: `demo:${demo.id}`, title: demo.name, route: demo.route, kind: "Game", accent: demo.accent, mark: demo.mark });
  const input = inputState();
  let running = false;
  let frame = 0;
  const renderFrame = demo.id === "pulse-pong" ? pongEngine(canvas, demo, input, score) : demo.id === "neon-lane" ? racerEngine(canvas, demo, input, score) : platformEngine(canvas, demo, input, score);
  const loop = () => { if (!running) return; renderFrame(); frame = requestAnimationFrame(loop); };
  const begin = () => { if (running) return; running = true; start.hidden = true; canvas.focus({ preventScroll: true }); loop(); };
  const onStart = (event) => { if (event.target.closest?.("[data-action='start-current-demo']")) begin(); };
  const onKey = (event) => {
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", " ": "action" };
    const key = map[event.key];
    if (!key) return;
    event.preventDefault(); event.stopImmediatePropagation(); input[key] = event.type === "keydown";
    if (!running && event.type === "keydown") begin();
  };
  document.addEventListener("click", onStart);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
  renderFrame();
  return () => {
    running = false; cancelAnimationFrame(frame);
    document.removeEventListener("click", onStart);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKey, true);
  };
}

export function creatorScreen() {
  const runtime = getProfileRuntime();
  return page({
    title: "Creator Playground",
    description: "Draw, write, and build a beat. Work saves to this profile.",
    eyebrow: "Create",
    className: "creator-page",
    body: `<div class="creator-tools"><section class="creator-tool"><div class="creator-tool__head"><span>Sketch Pad</span><button data-action="clear-creator-drawing">Clear</button></div><canvas width="900" height="420" data-creator-canvas aria-label="Drawing canvas"></canvas></section><section class="creator-tool"><div class="creator-tool__head"><span>Notes</span><small data-note-status>Saved</small></div><textarea data-creator-note placeholder="Write something…">${escapeHtml(runtime.creator.note)}</textarea></section><section class="creator-tool creator-tool--music"><div class="creator-tool__head"><span>Pulse Pad</span><small>Select a pad to play</small></div><div class="music-pads">${[196, 246.94, 293.66, 392, 493.88, 587.33].map((frequency, index) => `<button data-action="play-creator-tone" data-creator-tone="${frequency}" style="--pad-index:${index}" ${index === 0 ? "data-autofocus='true'" : ""}>${index + 1}</button>`).join("")}</div></section></div>`,
  });
}

export function activateCreator() {
  recordExperience({ id: "para:creator", title: "Creator Playground", route: "creator", kind: "App", accent: "#a96cff", mark: "✦" });
  const canvas = document.querySelector("[data-creator-canvas]");
  const note = document.querySelector("[data-creator-note]");
  if (!canvas || !note) return () => {};
  const context = canvas.getContext("2d");
  context.lineCap = "round"; context.lineJoin = "round"; context.strokeStyle = "#a86cff"; context.lineWidth = 7;
  const saved = getProfileRuntime().creator.drawing;
  if (saved) { const image = new Image(); image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height); image.src = saved; }
  let drawing = false;
  const point = (event) => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; };
  const down = (event) => { drawing = true; const p = point(event); context.beginPath(); context.moveTo(p.x, p.y); canvas.setPointerCapture(event.pointerId); };
  const move = (event) => { if (!drawing) return; const p = point(event); context.lineTo(p.x, p.y); context.stroke(); };
  const up = () => { if (!drawing) return; drawing = false; setProfileRuntime({ creator: { drawing: canvas.toDataURL("image/webp", .8) } }); };
  const input = () => { setProfileRuntime({ creator: { note: note.value } }); const status = document.querySelector("[data-note-status]"); if (status) status.textContent = "Saved"; };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); note.addEventListener("input", input);
  return () => { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); note.removeEventListener("input", input); };
}

export function communityScreen() {
  return page({
    title: "Community",
    description: "News from the PARA project.",
    eyebrow: "PARA Updates",
    className: "community-page",
    body: `<div class="community-feed"><article><span>Build 0.7.0</span><h2>Continuity update</h2><p>Continue, Switcher, profile saves, demo installs, and the live system clock now share one persistent session.</p></article><article><span>Interface</span><h2>Control Center grows</h2><p>Sound, microphone, downloads, and running experiences now live in the compact bottom overlay.</p></article><article><span>PARA Lab</span><h2>Three playable demos</h2><p>Pulse Pong, Neon Lane, and Violet Step are available through ParaStore.</p></article></div>`,
  });
}

export function marksScreen() {
  const marks = getProfileRuntime().marks;
  return page({ title: "Marks", description: "Milestones earned across PARA.", eyebrow: "Profile", body: marks.length ? `<div class="marks-list">${marks.map((mark, index) => `<article ${index === 0 ? "tabindex='0' data-autofocus='true'" : "tabindex='0'"}><span>◇</span><div><h2>${escapeHtml(mark.title)}</h2><p>${escapeHtml(mark.description)}</p><small>${new Date(mark.earnedAt).toLocaleDateString()}</small></div></article>`).join("")}</div>` : `<div class="library-empty"><span>◇</span><h2>No Marks earned yet</h2><p>Play a PARA demo to begin.</p></div>` });
}

export function activateCommunity() {
  recordExperience({ id: "para:community", title: "Community", route: "community", kind: "App", accent: "#8257ff", mark: "◎" });
  return () => {};
}

export function playCreatorTone(target) {
  const frequency = Number(target.dataset.creatorTone);
  if (!frequency) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const audio = new AudioContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = frequency; oscillator.type = "triangle";
  gain.gain.setValueAtTime(.12, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .34);
  oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .36);
  target.classList.add("is-playing"); window.setTimeout(() => target.classList.remove("is-playing"), 180);
}

export function clearCreatorDrawing() {
  const canvas = document.querySelector("[data-creator-canvas]");
  canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  setProfileRuntime({ creator: { drawing: "" } });
}

export { demoById, refreshDemoDownloads, profileRuntime };
