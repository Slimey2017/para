export function brand() {
  return `<div class="brand" aria-label="PARA"><span class="brand__mark" aria-hidden="true"></span><span>PARA</span></div>`;
}

export function topbar({ section = "PARA Home", mockLabel = true } = {}) {
  return `<header class="topbar">
    ${brand()}
    <div class="topbar__right">
      ${mockLabel ? `<span class="status-chip status-chip--mock">Development mode</span>` : ""}
      <button class="action-button action-button--ghost avatar avatar--small" data-route="account" aria-label="Open account settings">P1</button>
      <time class="clock" data-clock>--:--</time>
    </div>
  </header>`;
}

export function head(title, description, eyebrow = "PARA system") {
  return `<div class="screen-head">
    <div class="screen-head__copy"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p class="lede">${description}</p></div>
  </div>`;
}

export function tile({ title, meta, route, action, icon = "✦", badge, className = "", accent = "#9d5cff", disabled = false, autofocus = false, art = false }) {
  const destination = route ? `data-route="${route}"` : action ? `data-action="${action}"` : "";
  return `<button class="tile ${className}" style="--tile-accent:${accent}" ${destination} ${disabled ? "disabled aria-disabled='true'" : ""} ${autofocus ? "data-autofocus='true'" : ""}>
    ${art ? `<span class="tile__art" aria-hidden="true"></span>` : ""}
    <span class="tile__top"><span class="tile__icon" aria-hidden="true">${icon}</span>${badge ? `<span class="badge ${badge === "Preview" || badge === "Mock" ? "badge--preview" : ""}">${badge}</span>` : ""}</span>
    <span class="tile__bottom"><span><span class="tile__title">${title}</span><span class="tile__meta">${meta}</span></span><span aria-hidden="true">↗</span></span>
  </button>`;
}

export function listRow({ title, meta, route, action, icon = "•", end = "", disabled = false, autofocus = false }) {
  return `<button class="list-row" ${route ? `data-route="${route}"` : `data-action="${action || "stub"}"`} ${disabled ? "disabled aria-disabled='true'" : ""} ${autofocus ? "data-autofocus='true'" : ""}>
    <span class="list-row__icon" aria-hidden="true">${icon}</span><span class="list-row__body"><span class="list-row__title">${title}</span><span class="list-row__meta">${meta}</span></span><span class="list-row__end">${end}</span>
  </button>`;
}

export function progress(value) {
  return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><div class="progress__bar" style="width:${value}%"></div></div>`;
}

export function hints({ back = true } = {}) {
  return `<footer class="bottom-nav"><div class="key-hints">
    <span class="key-hint"><span class="key">↕↔</span> Move</span><span class="key-hint"><span class="key">Enter</span> Select</span>
    ${back ? `<span class="key-hint"><span class="key">Esc</span> Back</span>` : ""}<span class="key-hint"><span class="key">M</span> Quick menu</span><span class="key-hint"><span class="key">Tab</span> Cycle</span>
  </div><span>Controller mapping: D-pad / left stick · A confirm · B back · Menu quick</span></footer>`;
}

export function page({ title, description, eyebrow, body, className = "", back = true }) {
  return `<section class="screen ${className}">${topbar()}${head(title, description, eyebrow)}<div class="content-scroll">${body}</div>${hints({ back })}</section>`;
}

export function stubNotice(name) {
  return `<div class="panel"><div class="panel__head"><h3>${name} boundary</h3><span class="badge badge--preview">Stub</span></div><p class="muted">This screen is wired into PARA navigation, but the privileged or remote service behind it is intentionally not implemented. Development mode will not imitate a successful system action.</p></div>`;
}
