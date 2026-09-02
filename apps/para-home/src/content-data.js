// Consumer sample content. Live PARA services can replace this module without
// changing screen components.
export const content = {
  profiles: [
    { name: "Player One", initials: "P1", color: "violet" },
    { name: "Guest", initials: "G", color: "blue" },
  ],
  games: [
    { title: "Neon Drift", genre: "Arcade racing", status: "Ready to play", color: "#8c5cff", art: "neon", price: "$39.99" },
    { title: "Hollow Circuit", genre: "Action adventure", status: "Installed", color: "#3f7cff", art: "circuit", price: "$49.99" },
    { title: "Wildlight", genre: "Open-world adventure", status: "Installed", color: "#31caa0", art: "wild", price: "$29.99" },
    { title: "Velocity Ash", genre: "Competitive racing", status: "In library", color: "#fa784d", art: "ash", price: "$59.99" },
    { title: "Orbit Fold", genre: "Puzzle exploration", status: "In library", color: "#e8b94c", art: "orbit", price: "$19.99" },
    { title: "Echo Divide", genre: "Tactical co-op", status: "Installed", color: "#db4cab", art: "echo", price: "$34.99" },
  ],
  apps: [
    { title: "PARA Browser", meta: "Browse the web", icon: "◎", action: "unavailable" },
    { title: "Media", meta: "Movies, music, and photos", icon: "▷", action: "unavailable" },
    { title: "Bear Home", meta: "Files and storage", icon: "⌂", route: "bear-home" },
    { title: "Creator Mode", meta: "Your PC workspace", icon: "✦", route: "creator" },
    { title: "VR-US", meta: "Enter spatial experiences", icon: "◉", route: "vrus" },
    { title: "Steam", meta: "Your PC game library", icon: "◌", action: "unavailable" },
  ],
  products: [
    { title: "Eclipse Run", kicker: "Featured adventure", price: "$59.99", category: "Featured", art: "eclipse", colors: ["#2a0d5f", "#b56cff"] },
    { title: "Skyline Zero", kicker: "New release", price: "$49.99", category: "New Releases", art: "skyline", colors: ["#08223f", "#3db6ff"] },
    { title: "Garden Spirits", kicker: "Cozy exploration", price: "$24.99", category: "Popular", art: "garden", colors: ["#11392f", "#66dda2"] },
    { title: "Prism Arena", kicker: "Free to play", price: "Free", category: "Free to Play", art: "prism", colors: ["#48103e", "#ff5fbd"] },
    { title: "Canvas Flow", kicker: "Creative app", price: "$14.99", category: "Apps", art: "canvas", colors: ["#36230b", "#ffbe53"] },
    { title: "Rift Builder", kicker: "Community world", price: "$8.99", category: "UGC", art: "rift", colors: ["#2d144d", "#b783ff"] },
    { title: "Signal Bloom", kicker: "Creator Pick", price: "$29.99", category: "Creator Picks", art: "bloom", colors: ["#0c3239", "#5ee9f2"] },
    { title: "Last Frequency", kicker: "40% off", price: "$17.99", oldPrice: "$29.99", category: "Deals", art: "frequency", colors: ["#3b1018", "#ff6b70"] },
    { title: "Moon Harbor", kicker: "Story adventure", price: "$39.99", category: "Popular", art: "harbor", colors: ["#0c1b3e", "#7f86ff"] },
    { title: "Voxel Kitchen", kicker: "Build together", price: "$12.99", category: "UGC", art: "voxel", colors: ["#24310e", "#b1d94f"] },
  ],
  downloads: [
    { title: "Hollow Circuit", progress: 64, meta: "3.8 GB of 5.9 GB · 18 min remaining" },
    { title: "PARA system update", progress: 100, meta: "Ready to install" },
    { title: "Neon Drift soundtrack", progress: 28, meta: "1.1 GB of 3.9 GB · Queued" },
  ],
  notifications: [
    { title: "Welcome to PARA", meta: "Your Home is ready", icon: "✦" },
    { title: "Hollow Circuit is downloading", meta: "18 minutes remaining", icon: "↓" },
  ],
  friends: [],
  networks: [
    { title: "PulseWave 5G", meta: "Connected · Secure", signal: "Strong" },
    { title: "Workshop", meta: "Secure", signal: "Good" },
    { title: "Guest Mesh", meta: "Secure", signal: "Fair" },
  ],
};
