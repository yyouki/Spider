export type ConnectionPhase = "connecting" | "connected" | "reconnecting" | "failed";
export type ConnectionCause = "none" | "realtime" | "signed-out" | "access-denied" | "workspace-unavailable" | "network";

export type ConnectionState = {
  phase: ConnectionPhase;
  cause: ConnectionCause;
  attempt: number;
  closeCode: number | null;
};

export type ConnectionEvent =
  | { type: "open" }
  | { type: "close"; code?: number }
  | { type: "terminal"; code?: number }
  | { type: "health"; status: number | null }
  | { type: "manual-reconnect" };

export type ConnectionBanner = {
  tone: "info" | "warning" | "danger";
  title: string;
  message: string;
  action: "reconnect" | "reload";
  actionLabel: string;
};

export type ConnectionView = {
  label: string;
  banner: ConnectionBanner | null;
};

export declare const SPACE_AGENT_BASE_PATH: string;
export declare const MAX_RECONNECT_ATTEMPTS: number;
export declare const BANNER_AFTER_ATTEMPTS: number;
export declare function createInitialConnectionState(): ConnectionState;
export declare function classifyHealthStatus(status: number | null): ConnectionCause;
export declare function reduceConnection(state: ConnectionState, event: ConnectionEvent): ConnectionState;
export declare function describeConnection(state: ConnectionState): ConnectionView;
