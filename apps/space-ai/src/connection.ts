import { useCallback, useEffect, useReducer, useRef } from "react";
import { useAgent } from "agents/react";
import type { SpaceAgent } from "./server";
import {
  MAX_RECONNECT_ATTEMPTS,
  SPACE_AGENT_BASE_PATH,
  createInitialConnectionState,
  describeConnection,
  reduceConnection,
  type ConnectionBanner
} from "./security/connection-diagnosis.js";

export type SpaceAgentClient = ReturnType<typeof useAgent<SpaceAgent>>;
export type SpaceConnectionBanner = ConnectionBanner;

export function useSpaceAgentConnection() {
  const [state, dispatch] = useReducer(reduceConnection, undefined, createInitialConnectionState);
  const diagnosisInFlight = useRef(false);
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;

  const diagnose = useCallback(async () => {
    if (diagnosisInFlight.current) return;
    diagnosisInFlight.current = true;

    try {
      const response = await fetch("/api/health", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      dispatch({ type: "health", status: response.status });
    } catch {
      dispatch({ type: "health", status: null });
    } finally {
      diagnosisInFlight.current = false;
    }
  }, []);

  const agent = useAgent<SpaceAgent>({
    agent: "SpaceAgent",
    basePath: SPACE_AGENT_BASE_PATH,
    maxRetries: MAX_RECONNECT_ATTEMPTS,
    onOpen: useCallback(() => {
      dispatch({ type: "open" });
    }, []),
    onClose: useCallback((event: CloseEvent) => {
      dispatch({ type: "close", code: event.code });
      void diagnose();
    }, [diagnose]),
    onConnectionError: useCallback((error: { code: number }) => {
      dispatch({ type: "terminal", code: error.code });
      void diagnose();
    }, [diagnose])
  });

  const reconnect = useCallback(() => {
    dispatch({ type: "manual-reconnect" });
    agent.reconnect();
  }, [agent]);

  useEffect(() => {
    const resume = () => {
      if (phaseRef.current === "failed") reconnect();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") resume();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reconnect]);

  const view = describeConnection(state);

  return {
    agent,
    connected: state.phase === "connected",
    connectionLabel: view.label,
    connectionBanner: view.banner,
    reconnect
  };
}
