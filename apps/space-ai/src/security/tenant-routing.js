export type TenantSession = {
  userId: string;
  role: "owner" | "member";
};

const USER_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

/** Keep the existing owner's default Durable Object name so their data remains available. */
export function getSpaceAgentName(session: TenantSession): string {
  if (session.role === "owner") return "default";
  if (typeof session.userId !== "string" || !USER_ID_PATTERN.test(session.userId)) {
    throw new Error("Invalid authenticated user identity.");
  }
  return "user-" + session.userId;
}

/** Agent WebSocket/RPC requests must originate from the Space site itself. */
export function isSameOriginAgentRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return typeof origin === "string" && origin === new URL(request.url).origin;
}
