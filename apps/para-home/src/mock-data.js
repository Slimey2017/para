// Development-only display data. Nothing here represents a real account, license, device, or service.
export const mock = {
  profiles: [
    { name: "Player One", initials: "P1", state: "Local prototype profile", controller: "P1" },
    { name: "Guest", initials: "G", state: "Session data is not saved", controller: "—" },
  ],
  games: [
    { title: "Drift Signal", meta: "Concept build · 2–4 players", color: "#8c5cff", status: "Mock title" },
    { title: "Hollow Circuit", meta: "Prototype · Quick Resume slot", color: "#5aa6ff", status: "Mock title" },
    { title: "Wildlight", meta: "Adventure · Local placeholder", color: "#72e0b0", status: "Mock title" },
    { title: "Velocity Ash", meta: "Racing · Not installed", color: "#ff9e68", status: "Mock title" },
    { title: "Orbit Fold", meta: "Puzzle · Cloud placeholder", color: "#f1c65d", status: "Mock title" },
  ],
  apps: [
    { title: "PARA Browser", meta: "Web runtime boundary", icon: "⌁", status: "Design stub" },
    { title: "Media Room", meta: "Video and music shell", icon: "▷", status: "Mock app" },
    { title: "Bear Home", meta: "Files with a warmer face", icon: "⌂", status: "UI prototype" },
    { title: "Creator Mode", meta: "Build, test, and publish", icon: "✦", status: "Design stub" },
    { title: "VR-US", meta: "Spatial runtime gateway", icon: "◉", status: "Unavailable" },
  ],
  downloads: [
    { title: "Hollow Circuit — concept package", progress: 64, meta: "3.8 GB of 5.9 GB · simulated" },
    { title: "System UI preview assets", progress: 100, meta: "Ready · mock package" },
    { title: "PulseWave mapping profile", progress: 28, meta: "Waiting for mock service" },
  ],
  notifications: [
    { title: "Welcome to PARA development mode", meta: "Core shell · now", icon: "✦" },
    { title: "PulseWave uses browser mapping", meta: "Controller service · 8 min", icon: "⌁" },
    { title: "System update check simulated", meta: "Update service · 1 hr", icon: "↓" },
  ],
  friends: [
    { title: "Mika", meta: "In Creator Mode · mock presence", icon: "M" },
    { title: "Romeo", meta: "Offline · mock presence", icon: "R" },
    { title: "Aleciyah", meta: "At PARA Home · mock presence", icon: "A" },
  ],
  networks: [
    { title: "PARA-LAB-5G", meta: "Connected · WPA3 · simulated", signal: "Strong" },
    { title: "Workshop", meta: "Secured · simulated scan", signal: "Good" },
    { title: "Guest Mesh", meta: "Secured · simulated scan", signal: "Fair" },
  ],
};
