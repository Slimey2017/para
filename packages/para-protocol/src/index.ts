export type ServiceStatus =
  | "available"
  | "local-opt-in"
  | "local-session"
  | "read-only"
  | "mounted-media-read-only"
  | "browser-gamepad"
  | "interface-actions"
  | "contract-only";

export interface ParaServiceDescriptor {
  id: string;
  name: string;
  kind: "interface" | "system" | "hardware" | "remote";
  status: ServiceStatus;
  privileged: boolean;
}

export interface ParaSystemInformation {
  os: string;
  release: string;
  machine: string;
  hostname: string;
  cpu_count: number | null;
}

export interface ParaApplication {
  id: string;
  name: string;
  category: "Entertainment" | "Tools";
  roles: Array<"creator" | "game">;
  icon: string | null;
  launch: { kind: "route"; route: string } | { kind: "linux" };
}

export interface ControllerState {
  connected: boolean;
  name: string;
  type: "keyboard" | "para" | "xbox" | "playstation" | "nintendo";
  prompts: { confirm: string; back: string; secondary: string; options: string; para: string };
}

export interface ParaCapabilities {
  personalization: boolean;
  custom_backgrounds: boolean;
  audio: boolean;
  microphone: boolean;
  network: boolean;
  storage: boolean;
  controllers: "browser-gamepad";
  notifications: false;
  switcher: false;
  power: "session";
}

export interface ParaProfilePreferences {
  background: { selection: string; fit: "fill" | "fit" | "center" | "stretch"; dim: number; blur: number; revision: number };
  home: { order: string[]; hidden: string[] };
  controlCenter: { order: string[]; hidden: string[] };
}

export interface ParaAudioState {
  available: boolean;
  output: { volume: number; muted: boolean } | null;
  microphone: { volume: number; muted: boolean } | null;
}

export const apiPaths = {
  capabilities: "/api/v1/capabilities",
  health: "/api/v1/health",
  system: "/api/v1/system",
  storage: "/api/v1/storage",
  network: "/api/v1/network",
  audio: "/api/v1/audio",
  personalization: "/api/v1/personalization",
  customBackground: "/api/v1/backgrounds/custom",
  directories: "/api/v1/directories",
  files: "/api/v1/files",
  applications: "/api/v1/apps",
  launchApplication: "/api/v1/apps/launch",
} as const;
