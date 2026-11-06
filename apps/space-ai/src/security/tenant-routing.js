/**
 * @typedef {{ userId: string, role: "owner" | "member" }} TenantSession
 */

const USER_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

/**
 * Select a Durable Object identity from a server-verified session.
 * Keep the existing owner's default name so their stored data remains available.
 * @param {TenantSession} session
 * @returns {string}
 */
export function getSpaceAgentName(session) {
  if (!session || (session.role !== "owner" && session.role !== "member")) {
    throw new Error("Invalid authenticated user role.");
  }

  if (session.role === "owner") return "default";

  if (typeof session.userId !== "string" || !USER_ID_PATTERN.test(session.userId)) {
    throw new Error("Invalid authenticated user identity.");
  }

  return "user-" + session.userId;
}

/**
 * Agent WebSocket/RPC requests must originate from the Space site itself.
 * @param {Request} request
 * @returns {boolean}
 */
export function isSameOriginAgentRequest(request) {
  const origin = request.headers.get("origin");
  return typeof origin === "string" && origin === new URL(request.url).origin;
}
