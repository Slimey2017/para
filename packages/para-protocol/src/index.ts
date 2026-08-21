export type ServiceStatus =
  | "working-prototype"
  | "mock"
  | "browser-prototype"
  | "read-only-probe"
  | "stub"
  | "design-stub"
  | "safe-shell-only";

export interface ParaServiceDescriptor {
  id: string;
  name: string;
  kind: "frontend" | "system" | "hardware" | "remote";
  status: ServiceStatus;
  privileged: boolean;
}

export interface ParaSystemStatus {
  mode: "development-mock" | "production";
  safe_mode: boolean;
  privileged_actions_enabled: boolean;
  temperature_c: number | null;
  storage: { source: "mock" | "linux"; total_gb: number; used_gb: number };
}

export interface PulseWaveState {
  transport: "browser-gamepad" | "bluetooth" | "usb" | "none";
  connected: boolean;
  battery_percent: number | null;
  native_pairing: boolean;
}

export const apiPaths = {
  health: "/api/v1/health",
  status: "/api/v1/status",
  services: "/api/v1/services",
  hardware: "/api/v1/hardware",
  accounts: "/api/v1/accounts",
  bearHome: "/api/v1/bear-home",
  store: "/api/v1/store",
} as const;

