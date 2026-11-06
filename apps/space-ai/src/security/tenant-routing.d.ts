export type TenantSession = {
  userId: string;
  role: "owner" | "member";
};

export function getSpaceAgentName(session: TenantSession): string;
export function isSameOriginAgentRequest(request: Request): boolean;
