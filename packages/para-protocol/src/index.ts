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
  icon: string | null;
  launch: { kind: "route"; route: string } | { kind: "linux" };
}

export interface ControllerState {
  connected: boolean;
  name: string;
  type: "keyboard" | "para" | "xbox" | "playstation" | "nintendo";
  prompts: { confirm: string; back: string; secondary: string; options: string };
}

export const apiPaths = {
  health: "/api/v1/health",
  system: "/api/v1/system",
  storage: "/api/v1/storage",
  network: "/api/v1/network",
  directories: "/api/v1/directories",
  files: "/api/v1/files",
  applications: "/api/v1/apps",
  launchApplication: "/api/v1/apps/launch",
} as const;
