export type TenantSession = {
  userId: string;
  role: "owner" | "member";
};

export type AgentRequestRejection =
  | "origin-mismatch"
  | "origin-missing-upgrade"
  | "origin-missing-unsafe-method"
  | "origin-missing-unverified";

export function getSpaceAgentName(session: TenantSession): string;
export function isSameOriginAgentRequest(request: Request): boolean;
export function describeAgentRequestRejection(request: Request): AgentRequestRejection;
