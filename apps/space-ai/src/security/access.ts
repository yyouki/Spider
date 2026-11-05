type AuthEnvironment = {
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  GITHUB_OWNER_LOGIN: string;
  SESSION_SECRET: string;
  DEPLOYMENT_ENV: string;
  ALLOW_LOCAL_DEV_AUTH_BYPASS?: string;
};

export type OwnerSession = {
  login: string;
  expiresAt: number;
};

const SESSION_COOKIE = "__Host-space_session";
const STATE_COOKIE = "space_oauth_state";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const entry of cookies.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) {
      return entry.slice(separator + 1).trim();
    }
  }
  return null;
}

function secureCookie(name: string, value: string, options: { path: string; maxAge: number }): string {
  return [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function oauthReady(env: AuthEnvironment): boolean {
  return Boolean(
    env.GITHUB_OAUTH_CLIENT_ID &&
    env.GITHUB_OAUTH_CLIENT_SECRET &&
    env.GITHUB_OWNER_LOGIN &&
    env.SESSION_SECRET &&
    env.SESSION_SECRET.length >= 32
  );
}

function localBypass(env: AuthEnvironment): boolean {
  return env.DEPLOYMENT_ENV !== "production" &&
    env.ALLOW_LOCAL_DEV_AUTH_BYPASS === "true";
}

export async function getOwnerSession(
  request: Request,
  env: AuthEnvironment
): Promise<OwnerSession | null> {
  if (localBypass(env)) {
    return {
      login: env.GITHUB_OWNER_LOGIN || "local-development",
      expiresAt: Number.MAX_SAFE_INTEGER
    };
  }
  if (!oauthReady(env)) return null;

  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const payloadPart = token.slice(0, separator);
  const signaturePart = token.slice(separator + 1);
  let expectedSignature: string;
  let payload: { login?: unknown; expiresAt?: unknown };

  try {
    expectedSignature = await hmac(payloadPart, env.SESSION_SECRET);
    if (!constantTimeEqual(signaturePart, expectedSignature)) return null;
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))) as {
      login?: unknown;
      expiresAt?: unknown;
    };
  } catch {
    return null;
  }

  if (
    typeof payload.login !== "string" ||
    payload.login.toLowerCase() !== env.GITHUB_OWNER_LOGIN.toLowerCase() ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= Date.now()
  ) {
    return null;
  }

  return { login: payload.login, expiresAt: payload.expiresAt };
}

export async function requireOwnerAccess(
  request: Request,
  env: AuthEnvironment
): Promise<{ ok: true; session: OwnerSession } | { ok: false; response: Response }> {
  const session = await getOwnerSession(request, env);
  if (session) return { ok: true, session };

  if (!oauthReady(env)) {
    return {
      ok: false,
      response: Response.json({ error: "GitHub owner login is not configured." }, { status: 503 })
    };
  }

  return {
    ok: false,
    response: Response.json({ error: "Sign in with the owner GitHub account." }, { status: 401 })
  };
}

/** Handle OAuth routes before protected API and Agent routing. */
export async function handleAuthRequest(
  request: Request,
  env: AuthEnvironment
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/auth/github" && request.method === "GET") {
    if (!oauthReady(env)) {
      return Response.json({ error: "GitHub OAuth is not configured." }, { status: 503 });
    }

    const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
    const callback = new URL("/auth/github/callback", url.origin).toString();
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", env.GITHUB_OAUTH_CLIENT_ID);
    authorize.searchParams.set("redirect_uri", callback);
    authorize.searchParams.set("scope", "read:user");
    authorize.searchParams.set("state", state);

    const headers = new Headers({ Location: authorize.toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", secureCookie(STATE_COOKIE, state, {
      path: "/auth/github/callback",
      maxAge: 10 * 60
    }));
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === "/auth/github/callback" && request.method === "GET") {
    const clearState = secureCookie(STATE_COOKIE, "", {
      path: "/auth/github/callback",
      maxAge: 0
    });
    const clearHeaders = new Headers({ "Cache-Control": "no-store" });
    clearHeaders.append("Set-Cookie", clearState);

    if (!oauthReady(env)) {
      return new Response("GitHub OAuth is not configured.", { status: 503, headers: clearHeaders });
    }

    const returnedState = url.searchParams.get("state") ?? "";
    const savedState = cookieValue(request, STATE_COOKIE) ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!code || !returnedState || !constantTimeEqual(returnedState, savedState)) {
      return new Response("GitHub sign-in state is missing or invalid. Please try again.", {
        status: 400,
        headers: clearHeaders
      });
    }

    const callback = new URL("/auth/github/callback", url.origin).toString();
    try {
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "space-ai"
        },
        body: JSON.stringify({
          client_id: env.GITHUB_OAUTH_CLIENT_ID,
          client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
          code,
          redirect_uri: callback
        })
      });
      if (!tokenResponse.ok) {
        return new Response("GitHub token exchange failed. Please try again.", {
          status: 502,
          headers: clearHeaders
        });
      }

      const tokenData = await tokenResponse.json() as { access_token?: string };
      if (!tokenData.access_token) {
        return new Response("GitHub did not authorize this sign-in.", {
          status: 401,
          headers: clearHeaders
        });
      }

      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "space-ai"
        }
      });
      if (!userResponse.ok) {
        return new Response("Could not verify the GitHub account.", {
          status: 502,
          headers: clearHeaders
        });
      }

      const user = await userResponse.json() as { login?: string };
      const allowed = typeof user.login === "string" &&
        user.login.toLowerCase() === env.GITHUB_OWNER_LOGIN.toLowerCase();

      // Use the short-lived read:user token only for this lookup; never persist it.
      if (!allowed || typeof user.login !== "string") {
        return new Response("This GitHub account is not allowed to access this private workspace.", {
          status: 403,
          headers: clearHeaders
        });
      }

      const payload = base64UrlEncode(encoder.encode(JSON.stringify({
        login: user.login,
        expiresAt: Date.now() + SESSION_SECONDS * 1000
      })));
      const sessionToken = `${payload}.${await hmac(payload, env.SESSION_SECRET)}`;
      const headers = new Headers({
        Location: "/",
        "Cache-Control": "no-store"
      });
      headers.append("Set-Cookie", clearState);
      headers.append("Set-Cookie", secureCookie(SESSION_COOKIE, sessionToken, {
        path: "/",
        maxAge: SESSION_SECONDS
      }));
      return new Response(null, { status: 302, headers });
    } catch {
      return new Response("GitHub sign-in could not be completed. Please try again.", {
        status: 502,
        headers: clearHeaders
      });
    }
  }

  if (url.pathname === "/auth/logout" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) {
      return Response.json({ error: "Invalid request origin." }, { status: 403 });
    }
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", secureCookie(SESSION_COOKIE, "", { path: "/", maxAge: 0 }));
    return new Response(null, { status: 204, headers });
  }

  return null;
}
