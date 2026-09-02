import { content } from "../content-data.js";
import { getState } from "../state.js";
import { escapeHtml } from "../services/para-api.js";
import { page } from "../ui/components.js";

const FRIENDS_CHAT_KEY = "para.messages.v1";
const ACTIVE_THREAD_KEY = "para.friends.activeThread";

function chatStore() {
  const profile = getState().activeProfile || "P1";
  let all = {};
  try { all = JSON.parse(localStorage.getItem(FRIENDS_CHAT_KEY) || "{}"); } catch { all = {}; }
  if (!Array.isArray(all[profile]) || !all[profile].length) {
    all[profile] = [{
      id: "para-friends",
      title: "PARA Friends",
      initial: "P",
      status: "System",
      messages: [{
        id: `m-${Date.now()}`,
        sender: "PARA",
        text: "Friends is ready. Local conversations work in this web edition; online PARA chat and connected network chat will plug into this app later.",
        at: Date.now(),
      }],
    }];
    try { localStorage.setItem(FRIENDS_CHAT_KEY, JSON.stringify(all)); } catch { /* local preview can still render */ }
  }
  return { profile, all, threads: all[profile] };
}

function saveChatStore(profile, all, threads) {
  all[profile] = threads;
  try { localStorage.setItem(FRIENDS_CHAT_KEY, JSON.stringify(all)); } catch { /* keep current DOM state */ }
  window.dispatchEvent(new CustomEvent("para-friends-change"));
}

function threadForFriend(name) {
  const { profile, all, threads } = chatStore();
  const existing = threads.find((thread) => thread.friendName === name || thread.title === name);
  if (existing) return existing.id;
  const id = `friend-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
  const friend = content.friends.find((item) => item.title === name);
  const next = [...threads, {
    id,
    title: name,
    friendName: name,
    initial: (name || "?").slice(0, 1).toUpperCase(),
    status: friend?.end || "Offline",
    messages: [],
  }];
  saveChatStore(profile, all, next);
  return id;
}

function friendMarkup(friend, index) {
  const status = String(friend.end || "Offline");
  const state = status.toLowerCase().includes("online") || status.toLowerCase().includes("join") ? "online" : "offline";
  return `<button type="button" class="friends-person" data-friend-name="${escapeHtml(friend.title)}" ${index === 0 ? "data-autofocus='true'" : ""}>
    <span class="friends-person__avatar">${escapeHtml(friend.icon || friend.title?.[0] || "?")}<i data-presence="${state}"></i></span>
    <span class="friends-person__copy"><strong>${escapeHtml(friend.title)}</strong><small>${escapeHtml(friend.meta || status)}</small></span>
    <span class="friends-person__status">${escapeHtml(status)}</span>
  </button>`;
}

function threadMarkup(thread, activeId, index) {
  const last = thread.messages?.[thread.messages.length - 1];
  const time = last?.at ? new Date(last.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  return `<button type="button" class="friends-thread ${thread.id === activeId ? "is-active" : ""}" data-friends-thread="${escapeHtml(thread.id)}" ${index === 0 ? "data-thread-autofocus='true'" : ""}>
    <span>${escapeHtml(thread.initial || thread.title?.[0] || "?")}</span>
    <i><strong>${escapeHtml(thread.title || "Conversation")}</strong><small>${escapeHtml(last?.text || "No messages yet")}</small></i>
    <time>${escapeHtml(time)}</time>
  </button>`;
}

function conversationMarkup(thread) {
  if (!thread) return `<section class="friends-chat"><div class="friends-chat-empty"><span>◌</span><h2>Pick a friend</h2><p>Select someone or a recent conversation.</p></div></section>`;
  const bubbles = (thread.messages || []).map((message) => `<div class="friends-message ${message.sender === "You" ? "is-self" : ""}"><span>${escapeHtml(message.sender || thread.title || "PARA")}</span><p>${escapeHtml(message.text || "")}</p></div>`).join("");
  const sub = thread.status === "System" ? "PARA system conversation" : `${escapeHtml(thread.status || "PARA friend")} · Local web preview`;
  return `<section class="friends-chat" data-friends-chat>
    <header><span class="friends-chat__avatar">${escapeHtml(thread.initial || thread.title?.[0] || "?")}</span><div><strong>${escapeHtml(thread.title || "Conversation")}</strong><small>${sub}</small></div></header>
    <div class="friends-chat__body" data-friends-chat-body>${bubbles || `<div class="friends-chat-empty friends-chat-empty--small"><span>✦</span><h2>Start the conversation</h2><p>Messages sent here are saved to this PARA profile on this browser.</p></div>`}</div>
    <form class="friends-composer" data-friends-message-form><input aria-label="Message" autocomplete="off" placeholder="Message ${escapeHtml(thread.title || "friend")}" data-friends-message-input><button type="submit">Send</button></form>
  </section>`;
}

function providerMarkup() {
  const providers = [
    ["PARA", "Local preview", "ready"],
    ["Steam", "Chat bridge planned", "planned"],
    ["PlayStation", "Chat bridge planned", "planned"],
    ["Discord", "Chat bridge planned", "planned"],
    ["Xbox", "Chat bridge planned", "planned"],
    ["Nintendo", "Parties planned", "planned"],
  ];
  return `<section class="friends-networks" aria-label="Connected chat networks"><div><span>NETWORKS</span><strong>One Friends app, multiple networks.</strong></div><div>${providers.map(([name, detail, state]) => `<span class="friends-network friends-network--${state}"><b>${escapeHtml(name)}</b><small>${escapeHtml(detail)}</small></span>`).join("")}</div></section>`;
}

export function friendsScreen() {
  const { threads } = chatStore();
  const activeId = sessionStorage.getItem(ACTIVE_THREAD_KEY) || threads[0]?.id || "";
  const active = threads.find((thread) => thread.id === activeId) || threads[0];
  return page({
    title: "Friends",
    description: "Friends, conversations, presence, and future connected gaming chat in one place.",
    eyebrow: "System app",
    className: "friends-page",
    body: `${providerMarkup()}<div class="friends-app" data-friends-app>
      <aside class="friends-people"><header><span>PARA FRIENDS</span><h2>Friends</h2><small>${content.friends.length} people</small></header><div data-friends-people>${content.friends.map(friendMarkup).join("")}</div></aside>
      <aside class="friends-conversations"><header><span>RECENT</span><h2>Chats</h2><button type="button" data-friends-new aria-label="New local conversation">＋</button></header><div data-friends-thread-list>${threads.map((thread, index) => threadMarkup(thread, active?.id || "", index)).join("")}</div></aside>
      ${conversationMarkup(active)}
    </div>`,
  });
}

export function activateFriends({ focus } = {}) {
  const shell = document.querySelector("[data-friends-app]");
  if (!shell) return () => {};

  const render = (requestedId = "") => {
    const { threads } = chatStore();
    const activeId = requestedId || sessionStorage.getItem(ACTIVE_THREAD_KEY) || threads[0]?.id || "";
    const active = threads.find((thread) => thread.id === activeId) || threads[0];
    if (active) sessionStorage.setItem(ACTIVE_THREAD_KEY, active.id);
    const list = shell.querySelector("[data-friends-thread-list]");
    if (list) list.innerHTML = threads.map((thread, index) => threadMarkup(thread, active?.id || "", index)).join("");
    const current = shell.querySelector("[data-friends-chat], .friends-chat");
    const holder = document.createElement("div");
    holder.innerHTML = conversationMarkup(active);
    const replacement = holder.firstElementChild;
    if (current && replacement) current.replaceWith(replacement);
    requestAnimationFrame(() => {
      const body = shell.querySelector("[data-friends-chat-body]");
      if (body) body.scrollTop = body.scrollHeight;
    });
  };

  const onClick = (event) => {
    const friend = event.target.closest("[data-friend-name]");
    if (friend) {
      const id = threadForFriend(friend.dataset.friendName || "Friend");
      sessionStorage.setItem(ACTIVE_THREAD_KEY, id);
      render(id);
      shell.querySelector("[data-friends-message-input]")?.focus();
      return;
    }
    const thread = event.target.closest("[data-friends-thread]");
    if (thread) {
      sessionStorage.setItem(ACTIVE_THREAD_KEY, thread.dataset.friendsThread || "");
      render(thread.dataset.friendsThread || "");
      return;
    }
    if (event.target.closest("[data-friends-new]")) {
      const { profile, all, threads } = chatStore();
      const id = `local-${Date.now()}`;
      const next = [...threads, { id, title: `Local Chat ${threads.length + 1}`, initial: "+", status: "Local", messages: [] }];
      saveChatStore(profile, all, next);
      sessionStorage.setItem(ACTIVE_THREAD_KEY, id);
      render(id);
      shell.querySelector("[data-friends-message-input]")?.focus();
    }
  };

  const onSubmit = (event) => {
    if (!event.target.matches("[data-friends-message-form]")) return;
    event.preventDefault();
    const input = event.target.querySelector("[data-friends-message-input]");
    const text = String(input?.value || "").trim();
    if (!text) return;
    const { profile, all, threads } = chatStore();
    const activeId = sessionStorage.getItem(ACTIVE_THREAD_KEY) || threads[0]?.id || "";
    const next = threads.map((thread) => thread.id === activeId ? {
      ...thread,
      messages: [...(thread.messages || []), { id: `m-${Date.now()}`, sender: "You", text, at: Date.now() }],
    } : thread);
    saveChatStore(profile, all, next);
    if (input) input.value = "";
    render(activeId);
  };

  shell.addEventListener("click", onClick);
  shell.addEventListener("submit", onSubmit);
  requestAnimationFrame(() => {
    const body = shell.querySelector("[data-friends-chat-body]");
    if (body) body.scrollTop = body.scrollHeight;
  });
  if (focus && !focus.current) focus.focusFirst();
  return () => {
    shell.removeEventListener("click", onClick);
    shell.removeEventListener("submit", onSubmit);
  };
}
