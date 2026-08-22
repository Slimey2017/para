export function paraLogo(className = "brand__logo") {
  return `<img class="${className}" src="./assets/para-logo.png" alt="" aria-hidden="true" />`;
}

export function brand() {
  return `<div class="brand" aria-label="PARA">${paraLogo()}<span>PARA</span></div>`;
}

export function livingBackground() {
  return `<div class="os-backdrop" aria-hidden="true"><span class="os-aurora os-aurora--one"></span><span class="os-aurora os-aurora--two"></span><span class="os-orbit"></span><span class="os-stars"></span><span class="os-vignette"></span></div>`;
}

export function topbar({ section = "PARA" } = {}) {
  return `<header class="topbar">${brand()}<div class="topbar__center">${section}</div><div class="topbar__right"><button class="topbar-icon" data-route="network" aria-label="Network settings">⌁</button><time class="clock" data-clock>--:--</time><button class="avatar avatar--small" data-route="account" aria-label="Open account settings">P1</button></div></header>`;
}

export function head(title, description, eyebrow = "") {
  return `<div class="screen-head"><div class="screen-head__copy">${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ""}<h1>${title}</h1>${description ? `<p class="lede">${description}</p>` : ""}</div></div>`;
}

export function tile({ title, meta = "", route, action, icon = "✦", badge = "", className = "", accent = "#9d5cff", disabled = false, autofocus = false, art = false }) {
  const destination = route ? `data-route="${route}"` : action ? `data-action="${action}"` : "";
  const inactive = disabled || (!route && !action);
  return `<button type="button" class="tile os-card ${className}" style="--tile-accent:${accent}" ${destination} ${inactive ? "disabled aria-disabled='true'" : ""} ${autofocus && !inactive ? "data-autofocus='true'" : ""}>
    ${art ? `<span class="tile__art" aria-hidden="true"></span>` : ""}
    <span class="tile__top"><span class="tile__icon" aria-hidden="true">${icon}</span>${badge ? `<span class="badge">${badge}</span>` : ""}</span>
    <span class="tile__bottom"><span><span class="tile__title">${title}</span>${meta ? `<span class="tile__meta">${meta}</span>` : ""}</span><span class="card-arrow" aria-hidden="true">›</span></span>
  </button>`;
}

export function listRow({ title, meta = "", route, action, icon = "•", end = "", disabled = false, autofocus = false, selected = false }) {
  const destination = route ? `data-route="${route}"` : action ? `data-action="${action}"` : "";
  const inactive = disabled || (!route && !action);
  return `<button type="button" class="list-row os-row ${selected ? "is-selected" : ""}" ${destination} ${inactive ? "disabled aria-disabled='true'" : ""} ${autofocus && !inactive ? "data-autofocus='true'" : ""}>
    <span class="list-row__icon" aria-hidden="true">${icon}</span><span class="list-row__body"><span class="list-row__title">${title}</span>${meta ? `<span class="list-row__meta">${meta}</span>` : ""}</span>${end ? `<span class="list-row__end">${end}</span>` : ""}
  </button>`;
}

export function progress(value) {
  return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><div class="progress__bar" style="width:${value}%"></div></div>`;
}

export function toggleRow({ title, meta, action, value, icon = "◉", autofocus = false }) {
  return `<button class="list-row os-row" data-action="${action}" ${autofocus ? "data-autofocus='true'" : ""}><span class="list-row__icon" aria-hidden="true">${icon}</span><span class="list-row__body"><span class="list-row__title">${title}</span><span class="list-row__meta">${meta}</span></span><span class="os-toggle ${value ? "is-on" : ""}" aria-label="${value ? "On" : "Off"}"><i></i></span></button>`;
}

export function hints({ back = true, context = false, options = false } = {}) {
  return `<footer class="bottom-nav control-legend"><span><b class="prompt-key prompt-key--blue" data-prompt="confirm">Enter</b>Select</span>${back ? `<span><b class="prompt-key prompt-key--red" data-prompt="back">Esc</b>Back</span>` : ""}${context ? `<span><b class="prompt-key prompt-key--green" data-prompt="secondary">⇧F10</b>Context</span>` : ""}${options ? `<span><b class="prompt-key prompt-key--yellow" data-prompt="options">Y</b>Options</span>` : ""}</footer>`;
}

export function page({ title, description = "", eyebrow = "", body, className = "", back = true, section = "" }) {
  return `<section class="screen os-page ${className}">${livingBackground()}${topbar({ section: section || title })}${head(title, description, eyebrow)}<div class="content-scroll">${body}</div>${hints({ back })}</section>`;
}
