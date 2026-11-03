import { createRemoteJWKSet, jwtVerify } from "jose";

type AccessEnvironment = {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ACCESS_ALLOWED_EMAIL: string;
  DEPLOYMENT_ENV: string;
  ALLOW_LOCAL_DEV_AUTH_BYPASS?: string;
};

type AccessResult =
  | { ok: true; email: string }
  | { ok: false; response: Response };

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function requireOwnerAccess(
  request: Request,
  env: AccessEnvironment
): Promise<AccessResult> {
  // This bypass is only read from local .dev.vars; production defaults to fail-closed.
  if (
    env.DEPLOYMENT_ENV !== "production" &&
    env.ALLOW_LOCAL_DEV_AUTH_BYPASS === "true"
  ) {
    return { ok: true, email: "local-development" };
  }

  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.ACCESS_AUD?.trim();
  const allowedEmail = env.ACCESS_ALLOWED_EMAIL?.trim().toLowerCase();

  // Fail closed: a fresh deployment is inaccessible until Access is configured.
  if (!teamDomain || !audience || !allowedEmail) {
    return {
      ok: false,
      response: jsonError(
        503,
        "Private access is not configured. Configure Cloudflare Access before using space."
      )
    };
  }

  let issuer: string;
  try {
    const parsed = new URL(teamDomain);
    if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("Invalid Cloudflare Access team domain.");
    }
    issuer = parsed.origin;
  } catch {
    return {
      ok: false,
      response: jsonError(503, "ACCESS_TEAM_DOMAIN must be an HTTPS Cloudflare Access team domain.")
    };
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    return {
      ok: false,
      response: jsonError(401, "Cloudflare Access authentication is required.")
    };
  }

  try {
    let jwks = jwksByIssuer.get(issuer);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      jwksByIssuer.set(issuer, jwks);
    }

    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience
    });

    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email || email !== allowedEmail) {
      return {
        ok: false,
        response: jsonError(403, "This Cloudflare Access identity is not authorized for this private workspace.")
      };
    }

    return { ok: true, email };
  } catch {
    return {
      ok: false,
      response: jsonError(401, "The Cloudflare Access token is missing, expired, or invalid.")
    };
  }
}
