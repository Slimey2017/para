export const DEMOS = Object.freeze([
  {
    id: "pulse-pong",
    name: "Pulse Pong",
    tagline: "Keep the violet pulse in play.",
    genre: "Arcade",
    route: "demo-pong",
    sizeBytes: 8_400_000,
    accent: "#9b5cff",
    mark: "◉",
  },
  {
    id: "neon-lane",
    name: "Neon Lane",
    tagline: "Thread the night traffic.",
    genre: "Racer",
    route: "demo-racer",
    sizeBytes: 10_800_000,
    accent: "#5e7cff",
    mark: "⌁",
  },
  {
    id: "violet-step",
    name: "Violet Step",
    tagline: "Jump across a shifting horizon.",
    genre: "Platformer",
    route: "demo-platformer",
    sizeBytes: 9_600_000,
    accent: "#c36bff",
    mark: "◇",
  },
]);

export const demoById = (id) => DEMOS.find((demo) => demo.id === id) || null;
export const demoByRoute = (route) => DEMOS.find((demo) => demo.route === route) || null;
