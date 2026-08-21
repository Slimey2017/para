import { screenIds } from "./screen-manifest.js";

export class Router {
  constructor(onRoute) {
    this.onRoute = onRoute;
    this.history = [];
    window.addEventListener("hashchange", () => this.resolve());
  }

  current() {
    const id = location.hash.replace(/^#\/?/, "").split("?")[0] || "startup";
    return screenIds.has(id) ? id : "home";
  }

  resolve() {
    this.onRoute(this.current());
  }

  go(id, options = {}) {
    const destination = screenIds.has(id) ? id : "home";
    const current = this.current();
    if (!options.replace && current !== destination) this.history.push(current);
    const nextHash = `#/${destination}`;
    if (location.hash === nextHash) this.resolve();
    else if (options.replace) location.replace(nextHash);
    else location.hash = nextHash;
  }

  back() {
    const previous = this.history.pop();
    if (previous) this.go(previous, { replace: true });
    else if (this.current() !== "home") this.go("home", { replace: true });
  }
}

