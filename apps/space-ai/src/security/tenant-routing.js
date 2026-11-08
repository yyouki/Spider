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
 * Decide whether an Agent request comes from the Spider site itself.
 * An Origin header, when present, must match exactly. Browsers omit Origin on
 * same-origin GET and HEAD requests, so those are accepted only when the browser
 * itself labels them same-origin. WebSocket upgrades and state-changing methods
 * must always carry a matching Origin.
 * @param {Request} request
 * @returns {boolean}
 */
export function isSameOriginAgentRequest(request) {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === expectedOrigin;

  const method = request.method.toUpperCase();
  const isSafeMethod = method === "GET" || method === "HEAD";
  const isUpgrade = request.headers.get("upgrade")?.toLowerCase() === "websocket";
  return isSafeMethod && !isUpgrade && request.headers.get("sec-fetch-site") === "same-origin";
}

/**
 * Name the reason a request was rejected, for logs that must stay free of secrets.
 * @param {Request} request
 * @returns {"origin-mismatch" | "origin-missing-upgrade" | "origin-missing-unsafe-method" | "origin-missing-unverified"}
 */
export function describeAgentRequestRejection(request) {
  const origin = request.headers.get("origin");
  if (origin !== null) return "origin-mismatch";
  if (request.headers.get("upgrade")?.toLowerCase() === "websocket") return "origin-missing-upgrade";
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return "origin-missing-unsafe-method";
  return "origin-missing-unverified";
}
