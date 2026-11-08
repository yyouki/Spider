export const SPACE_AGENT_BASE_PATH = "api/me";
export const MAX_RECONNECT_ATTEMPTS = 8;
export const BANNER_AFTER_ATTEMPTS = 2;

/**
 * @typedef {"connecting" | "connected" | "reconnecting" | "failed"} ConnectionPhase
 * @typedef {"none" | "realtime" | "signed-out" | "access-denied" | "workspace-unavailable" | "network"} ConnectionCause
 * @typedef {{ phase: ConnectionPhase, cause: ConnectionCause, attempt: number, closeCode: number | null }} ConnectionState
 */

/** @returns {ConnectionState} */
export function createInitialConnectionState() {
  return { phase: "connecting", cause: "none", attempt: 0, closeCode: null };
}

/**
 * @param {number | null} status
 * @returns {ConnectionCause}
 */
export function classifyHealthStatus(status) {
  if (status === null) return "network";
  if (status === 401) return "signed-out";
  if (status === 403) return "access-denied";
  if (status >= 500) return "workspace-unavailable";
  return "realtime";
}

/**
 * @param {ConnectionState} state
 * @param {{ type: string, code?: number, status?: number | null }} event
 * @returns {ConnectionState}
 */
export function reduceConnection(state, event) {
  switch (event.type) {
    case "open":
      return { phase: "connected", cause: "none", attempt: 0, closeCode: null };
    case "close":
      if (state.phase === "failed") return state;
      return {
        ...state,
        phase: "reconnecting",
        attempt: state.attempt + 1,
        closeCode: typeof event.code === "number" ? event.code : state.closeCode
      };
    case "terminal":
      return {
        ...state,
        phase: "failed",
        closeCode: typeof event.code === "number" ? event.code : state.closeCode
      };
    case "health":
      if (state.phase === "connected") return state;
      return { ...state, cause: classifyHealthStatus(event.status ?? null) };
    case "manual-reconnect":
      return { phase: "connecting", cause: "none", attempt: 0, closeCode: null };
    default:
      return state;
  }
}

/**
 * @param {ConnectionState} state
 * @returns {{ label: string, banner: null | { tone: "info" | "warning" | "danger", title: string, message: string, action: "reconnect" | "reload", actionLabel: string } }}
 */
export function describeConnection(state) {
  if (state.phase === "connected") return { label: "Connected", banner: null };
  if (state.phase === "connecting" && state.attempt === 0) return { label: "Connecting", banner: null };

  const failed = state.phase === "failed";
  const label = failed ? "Offline" : "Reconnecting";
  const codeNote = state.closeCode === null ? "" : " (close code " + state.closeCode + ")";

  if (state.cause === "signed-out") {
    return {
      label,
      banner: {
        tone: "warning",
        title: "Your session has expired",
        message: "Sign in again to continue working in Spider.",
        action: "reload",
        actionLabel: "Sign in again"
      }
    };
  }

  if (state.cause === "access-denied") {
    return {
      label,
      banner: {
        tone: "danger",
        title: "Access was rejected",
        message: "The server refused this request. Reload the page. If it keeps happening, check that you are using the official Spider address.",
        action: "reload",
        actionLabel: "Reload page"
      }
    };
  }

  if (state.cause === "workspace-unavailable") {
    return {
      label,
      banner: {
        tone: "danger",
        title: "Workspace unavailable",
        message: failed
          ? "The server responded, but your private workspace storage cannot be reached. Try again in a moment."
          : "The server responded, but your private workspace storage cannot be reached. Spider keeps retrying.",
        action: "reconnect",
        actionLabel: "Try again"
      }
    };
  }

  if (state.cause === "network") {
    return {
      label,
      banner: {
        tone: "warning",
        title: "Cannot reach Spider",
        message: failed
          ? "Check your internet connection. Spider reconnects when you are back online, or you can retry now."
          : "Check your internet connection. Spider keeps retrying and reconnects when you are back online.",
        action: "reconnect",
        actionLabel: "Retry now"
      }
    };
  }

  if (failed) {
    return {
      label,
      banner: {
        tone: "danger",
        title: "Live connection lost",
        message: "The server is healthy, but the live channel could not be restored after " + MAX_RECONNECT_ATTEMPTS + " attempts" + codeNote + ".",
        action: "reconnect",
        actionLabel: "Reconnect"
      }
    };
  }

  if (state.attempt < BANNER_AFTER_ATTEMPTS) return { label, banner: null };

  return {
    label,
    banner: {
      tone: "info",
      title: "Live connection interrupted",
      message: "The server is healthy, but the live channel dropped. Reconnecting (attempt " + state.attempt + " of " + MAX_RECONNECT_ATTEMPTS + ")" + codeNote + ".",
      action: "reconnect",
      actionLabel: "Reconnect now"
    }
  };
}
