import { page } from "../ui/components.js";

export function socialScreen() {
  return page({
    title: "Community",
    description: "PARA community services without demo people.",
    eyebrow: "Friends & parties",
    className: "social-page",
    body: `<div class="library-empty"><span>✦</span><h2>Community is moving into Friends</h2><p>Real friends, chats, and parties belong in the Friends system app. Local profiles and sample people are not used here.</p><button class="action-button" data-route="friends" data-autofocus="true">Open Friends</button></div>`,
  });
}

export function callsScreen() {
  return page({
    title: "Calls",
    description: "Voice and video calls will use real PARA friends.",
    eyebrow: "Communication",
    className: "calls-page",
    body: `<div class="library-empty"><span>◌</span><h2>No call service connected</h2><p>Recent calls are not fabricated. Calls will appear here when the online Friends service supports them.</p><button class="action-button" data-route="friends" data-autofocus="true">Open Friends</button></div>`,
  });
}
