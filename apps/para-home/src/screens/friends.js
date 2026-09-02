import { page } from "../ui/components.js";

const FRIEND_TABS = Object.freeze([
  ["friends", "Friends"],
  ["chats", "Chats"],
  ["parties", "Parties"],
]);

let activeFriendTab = "friends";

function tabsMarkup() {
  return `<nav class="friends-tabs" aria-label="Friends sections" role="tablist">${FRIEND_TABS.map(([id, label], index) => `<button type="button" role="tab" aria-selected="${id === activeFriendTab}" class="${id === activeFriendTab ? "is-active" : ""}" data-friends-tab="${id}" ${index === 0 ? "data-autofocus='true'" : ""}>${label}</button>`).join("")}</nav>`;
}

function emptyStateMarkup(tab = "friends") {
  if (tab === "chats") {
    return `<section class="friends-empty"><span class="friends-empty__icon">◌</span><h2>No conversations</h2><p>PARA chat is not connected to the online Friends service yet. Local browser profiles and demo conversations are not shown as people.</p></section>`;
  }
  if (tab === "parties") {
    return `<section class="friends-empty"><span class="friends-empty__icon">◎</span><h2>No active parties</h2><p>Parties will appear here when PARA's online party service is connected. Steam, PlayStation, Discord, Xbox, and Nintendo bridges can plug into this app later.</p></section>`;
  }
  return `<section class="friends-empty"><span class="friends-empty__icon">✦</span><h2>No PARA friends yet</h2><p>Only real PARA accounts will appear here. Demo people and local console profiles are never treated as friends.</p><small>Friend requests and online presence will appear when the PARA Friends service is connected.</small></section>`;
}

function friendsBodyMarkup() {
  return `<section class="friends-console" data-friends-app>
    <header class="friends-console__bar"><div><span>PARA FRIENDS</span><strong>Friends</strong></div>${tabsMarkup()}</header>
    <div class="friends-console__content" data-friends-content>${emptyStateMarkup(activeFriendTab)}</div>
  </section>`;
}

export function friendsScreen() {
  return page({
    title: "Friends",
    description: "Real PARA friends, conversations, and parties in one system app.",
    eyebrow: "System app",
    className: "friends-page friends-page--v53",
    body: friendsBodyMarkup(),
  });
}

export function activateFriends({ focus } = {}) {
  const shell = document.querySelector("[data-friends-app]");
  if (!shell) return () => {};
  const render = (tab) => {
    activeFriendTab = FRIEND_TABS.some(([id]) => id === tab) ? tab : "friends";
    shell.querySelectorAll("[data-friends-tab]").forEach((button) => {
      const selected = button.dataset.friendsTab === activeFriendTab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    const content = shell.querySelector("[data-friends-content]");
    if (content) content.innerHTML = emptyStateMarkup(activeFriendTab);
  };
  const onClick = (event) => {
    const tab = event.target.closest("[data-friends-tab]");
    if (!tab) return;
    render(tab.dataset.friendsTab || "friends");
  };
  shell.addEventListener("click", onClick);
  requestAnimationFrame(() => focus?.focusFirst?.());
  return () => shell.removeEventListener("click", onClick);
}
